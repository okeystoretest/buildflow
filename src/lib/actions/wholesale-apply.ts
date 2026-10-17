"use server";

import { WholesaleBrand } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { actionOk, actionError, type ActionResult } from "@/types/action";
import { getClientIp } from "@/lib/request-ip";
import { checkRate } from "@/lib/rate-limit";
import {
  validateUploadDataUrl,
  processAndSaveImage,
  deleteUploadedFile,
  type ProcessedImage,
} from "@/lib/image";
import { resolveReferral, brandSlug } from "@/lib/wholesale-referral";
import { validateApplyPayload } from "@/lib/wholesale-apply-validation";

/**
 * A ÚNICA escrita sem sessão deste sistema.
 *
 * Não há `requireRoleAction` aqui, de propósito: quem preenche ainda não é
 * cliente. Em troca, tudo que normalmente a sessão garantiria tem de ser
 * garantido à mão — contenção por IP, formato de arquivo pela assinatura e
 * não pelo MIME declarado, e nenhum campo gravado como veio.
 *
 * MENSAGEM GENÉRICA em qualquer recusa de contenção: dizer qual das quatro
 * falhou (honeypot, tempo, IP, marca) ensina a contorná-la. Erro de CAMPO é o
 * contrário: ali a lojista precisa saber exatamente o que corrigir.
 *
 * NADA aqui pode lançar. Exceção não tratada numa página pública é um 500 na
 * cara de quem acabou de preencher 18 campos, e ela não volta.
 *
 * Em troca, todo `catch` REGISTRA o erro com o prefixo `[atacado]` antes de
 * devolver a mensagem amena. Esta é a única escrita sem sessão e sem rede de
 * testes do sistema: engolir o diagnóstico faria "banco fora", "libvips sem
 * HEIC" e "pool esgotado" chegarem como a mesma frase na tela e como nada
 * algum no log, e o sintoma seria "os leads pararam de chegar" sem pista de
 * qual dos três.
 */

// "mais tarde", não "em alguns minutos": o balde do rate limit é de SESSENTA
// minutos, então quem bateu no teto e volta em cinco leva a mesma recusa e
// conclui que a página está quebrada.
const GENERICO = "Não foi possível enviar agora. Tente novamente mais tarde.";
const MIN_FILL_MS = 5_000;

/**
 * Teto POR IMAGEM, e são DUAS por envio.
 *
 * Não é o `MAX_UPLOAD_MB` (9) do `@/lib/image`: aquele foi calibrado para UM
 * arquivo por requisição, e aqui vão duas fotos no mesmo corpo. O limite real
 * é o `serverActions.bodySizeLimit` de 12mb do next.config, e o base64 infla o
 * binário em 4/3 — duas fotos comuns de celular de 5MB chegam como ~13,3MB e
 * morrem DENTRO do Next, antes desta action rodar, com erro opaco de rede numa
 * página pública. Quatro megabytes por imagem deixam as duas mais os campos de
 * texto abaixo do teto do Next com folga, e a recusa passa a ser a nossa
 * mensagem em pt-BR em vez de uma falha sem explicação.
 *
 * Passado como parâmetro de `validateUploadDataUrl`; a constante do módulo de
 * imagem continua valendo para os comprovantes e NÃO é redefinida aqui.
 */
const MAX_FOTO_MB = 4;
// Tetos de DECODIFICACAO desta porta, apertados em relacao ao padrao de
// image.ts. O cliente ja encolhe para 1600 px e o servidor redimensiona para
// 1600 px, entao nada maior que isto tem utilidade aqui — e esta e a unica
// porta de upload sem sessao do sistema, onde o custo de uma bomba de
// descompressao e o processo inteiro, nao so a LP.
const TETOS_DE_DECODIFICACAO = {
  limitInputPixels: 50_000_000,
  maxDecodedBytes: 64 * 1024 * 1024,
} as const;


// A tradução marca <-> slug só existe em `brandSlug`; a LISTA de marcas vem do
// enum do Prisma, que é a única definição delas. Derivada, e não repetida à
// mão, para que uma marca nova realmente não precise ser lembrada aqui.
const BRANDS = Object.values(WholesaleBrand);

export interface ApplyInput {
  brandSlug: string;
  referralCode?: string | null;
  campos: Record<string, string>;
  instagramImage: string; // data-URL
  storeImage: string; // data-URL
  honeypot: string;
  /**
   * Milissegundos que a página ficou aberta, medidos NO CLIENTE.
   *
   * Tempo decorrido, não um instante: comparar `Date.now()` do servidor com um
   * `Date.now()` do celular trancava fora toda lojista com relógio adiantado,
   * porque a diferença ficava negativa e negativo é sempre menor que o mínimo.
   */
  msPreenchendo: number;
}

/**
 * O arquivo é REALMENTE um PDF, pelos seus próprios bytes.
 *
 * `validateUploadDataUrl` libera `application/pdf` porque o mesmo caminho
 * serve comprovantes de pagamento — aqui os dois campos são FOTOS, e um PDF
 * aprovado por ele chegaria ao sharp, que só entende raster, e lançaria.
 * Conferido: um PDF declarado `application/pdf`, e um PDF enviado SEM prefixo
 * `data:`, passam os dois por ele devolvendo null.
 *
 * Por que a assinatura e não `isPdfDataUrl`: aquele helper lê o MIME
 * DECLARADO, e quem envia escolhe o que declara. Declarar `application/pdf` é
 * escolha legítima nesse caminho compartilhado, e não declarar nada também —
 * nos dois casos o helper não recusa nada. Os quatro primeiros bytes do
 * arquivo não são escolha de ninguém.
 */
function ehPdf(buffer: Buffer): boolean {
  return buffer.subarray(0, 4).toString("ascii") === "%PDF";
}

/** Bytes de um data-URL. Lê defensivamente: o payload vem de um navegador. */
function bufferDoDataUrl(valor: unknown): Buffer {
  if (typeof valor !== "string") return Buffer.alloc(0);
  const virgula = valor.indexOf(",");
  const base64 = virgula >= 0 ? valor.slice(virgula + 1) : valor;
  return Buffer.from(base64, "base64");
}

/**
 * Recusa de uma das duas fotos, com a mensagem DESTA tela.
 *
 * As mensagens de `validateUploadDataUrl` servem ao fluxo de comprovantes e
 * não podem ser repassadas aqui: ele oferece "Envie JPG, PNG, HEIC, WebP ou
 * PDF" uma guarda antes de nós recusarmos PDF, e diz "Arquivo vazio ou
 * invalido" sem acento, fora do padrão de pt-BR acentuado do resto da LP.
 * Dizer à lojista que PDF serve, para recusá-lo em seguida, é desinformação em
 * página pública.
 *
 * A validação endurecida continua sendo a dele, integralmente: é ele que
 * sniffa os magic bytes e é o veredito dele que manda (CVE-2026-96889). O que
 * trocamos é só o TEXTO. Tamanho e arquivo vazio são conferidos antes para que
 * esses dois casos ganhem mensagem própria; qualquer outra recusa dele é, por
 * eliminação, problema de formato.
 */
function erroDaFoto(
  campo: { sujeito: string; objeto: string },
  dataUrl: unknown,
  buffer: Buffer,
): string | null {
  if (buffer.length === 0) return `Envie ${campo.objeto}.`;
  if (buffer.length > MAX_FOTO_MB * 1024 * 1024) {
    return `${campo.sujeito} passa de ${MAX_FOTO_MB}MB. Envie uma foto mais leve.`;
  }
  const recusa = validateUploadDataUrl(
    typeof dataUrl === "string" ? dataUrl : "",
    buffer,
    MAX_FOTO_MB,
  );
  if (recusa) return `${campo.sujeito} precisa ser uma foto JPG, PNG, WebP ou HEIC.`;
  if (ehPdf(buffer)) {
    return `${campo.sujeito} é um PDF. Envie uma foto (JPG ou PNG).`;
  }
  return null;
}

const CAMPO_INSTAGRAM = { sujeito: "A imagem do Instagram", objeto: "a imagem do Instagram" };
const CAMPO_LOJA = { sujeito: "A foto da loja", objeto: "a foto da loja" };

export async function submitWholesaleApplication(
  input: ApplyInput,
): Promise<ActionResult<void>> {
  // 1. Contenção, antes de qualquer trabalho caro (decisão 27).
  // O argumento inteiro pode não chegar: o tipo é promessa do compilador, e
  // quem chama esta action é um navegador qualquer.
  if (!input || typeof input !== "object") return actionError(GENERICO);
  if (input.honeypot) return actionError(GENERICO);
  // Número vindo do cliente, e já era: `Date.now() - 10000` derrotava a versão
  // anterior num token. Continua valendo as seis linhas contra robô de
  // formulário, e continua NÃO sendo controle de segurança. O que mudou é que
  // agora não há dois relógios na conta, então ninguém real é trancado fora.
  if (
    typeof input.msPreenchendo !== "number" ||
    !Number.isFinite(input.msPreenchendo) ||
    input.msPreenchendo < MIN_FILL_MS
  ) {
    return actionError(GENERICO);
  }
  // Recortado em 45 caracteres (o maior IPv6 textual, inclusive o formato com
  // sufixo IPv4). Em produção o valor vem do nosso proxy, contado do FIM do
  // X-Forwarded-For, mas o fallback `x-real-ip` é texto escolhido por quem
  // chama — e aqui ele vira chave de um `Map` em memória E linha no banco,
  // partindo de uma requisição sem sessão.
  const ip = getClientIp().slice(0, 45);
  // QUINZE por hora, não cinco. As operadoras móveis brasileiras usam CGNAT:
  // milhares de pessoas genuinamente distintas saem pelo mesmo IP público. O
  // teto precisa caber várias lojistas atrás do NAT da operadora MAIS as
  // tentativas recusadas de uma delas — toda recusa queima uma ficha, inclusive
  // erro de campo. Com cinco, uma única lojista errando duas fotos trancava
  // candidatas reais da mesma operadora, numa página cujo propósito inteiro é
  // captar lead. Passar de quinze num IP é abuso inequívoco e segue limitado, e
  // o trabalho caro (sharp e a linha) está atrás da validação de campo de todo
  // modo. Se o número estiver errado para cima, custa até quinze candidaturas
  // de lixo por hora na fila da analista, que ela apaga; errado para baixo,
  // custa uma revendedora real, calada.
  const rate = await checkRate(`atacado:${ip}`, { max: 15, windowMs: 60 * 60 * 1000 });
  if (!rate.allowed) return actionError(GENERICO);

  // 2. Marca pelo caminho, nunca pelo payload. `BRANDS` vem do enum do Prisma
  // e a tradução para slug vem de `brandSlug`: nenhuma das duas é repetida
  // aqui, então uma marca nova não precisa ser lembrada neste arquivo.
  const brand = BRANDS.find((b) => brandSlug(b) === input.brandSlug) ?? null;
  if (!brand) return actionError(GENERICO);

  // 3. Campos.
  const v = validateApplyPayload(input.campos);
  if ("error" in v) return actionError(v.error);

  // 4. Imagens: assinatura manda, MIME declarado não (CVE-2026-96889).
  const insta = bufferDoDataUrl(input.instagramImage);
  const loja = bufferDoDataUrl(input.storeImage);
  const erroInsta = erroDaFoto(CAMPO_INSTAGRAM, input.instagramImage, insta);
  if (erroInsta) return actionError(erroInsta);
  const erroLoja = erroDaFoto(CAMPO_LOJA, input.storeImage, loja);
  if (erroLoja) return actionError(erroLoja);

  // 5. Dono do lead. Elegibilidade conferida AGORA, não quando o link nasceu.
  // A consulta também vai em try/catch: banco indisponível aqui lançaria, e o
  // 500 cairia na página pública depois de a lojista já ter preenchido tudo.
  // Mesma mensagem genérica — não há nada que ela possa corrigir.
  let sellerId: string | null;
  try {
    const candidatos = await prisma.user.findMany({
      where: { role: "VENDAS", salesModel: "ATACADO" },
      select: { id: true, referralCode: true, role: true, salesModel: true, active: true },
    });
    sellerId = resolveReferral(input.referralCode, candidatos);
  } catch (err) {
    console.error("[atacado] falha ao carregar as vendedoras candidatas:", err);
    return actionError(GENERICO);
  }

  // 6. Grava. As imagens vão para o disco antes da linha; o nome base diz
  // apenas de qual campo o arquivo veio, porque `processAndSaveImage` já
  // acrescenta um UUID aleatório e é ele que garante unicidade e caminho não
  // adivinhável entre dois envios simultâneos.
  //
  // Cada chamada em try/catch próprio: o sharp lança no que não consegue
  // decodificar, e o HEIC do iPhone é liberado pela validação mas não decodifica
  // em toda build do libvips. Sem o catch, esse envio seria um 500.
  let imgInsta: ProcessedImage;
  try {
    imgInsta = await processAndSaveImage(insta, {
      folder: "atacado",
      fileName: "instagram",
      ...TETOS_DE_DECODIFICACAO,
    });
  } catch (err) {
    console.error("[atacado] sharp falhou na imagem do Instagram:", err);
    return actionError(
      "Não foi possível processar a imagem do Instagram. Tente enviar um JPG ou PNG.",
    );
  }

  let imgLoja: ProcessedImage;
  try {
    imgLoja = await processAndSaveImage(loja, {
      folder: "atacado",
      fileName: "loja",
      ...TETOS_DE_DECODIFICACAO,
    });
  } catch (err) {
    console.error("[atacado] sharp falhou na foto da loja:", err);
    // A primeira imagem já está no disco e nenhuma linha vai apontar para
    // ela: sai junto, senão fica órfã (mesma regra de select-finance.ts).
    await deleteUploadedFile(imgInsta.filePath).catch(() => {});
    return actionError(
      "Não foi possível processar a foto da loja. Tente enviar um JPG ou PNG.",
    );
  }

  try {
    await prisma.wholesaleLead.create({
      data: {
        brand,
        sellerId,
        ...v.clean,
        instagramImagePath: imgInsta.filePath,
        storeImagePath: imgLoja.filePath,
        // "desconhecido" é a falta de IP, não um IP: gravado como texto, dois
        // envios sem proxy pareceriam vir do mesmo lugar e alimentariam um
        // falso sinal do código 34 (tentativa de burlar cadastro).
        submittedIp: ip === "desconhecido" ? null : ip,
      },
    });
  } catch (err) {
    console.error("[atacado] falha ao gravar o lead:", err);
    // Os dois arquivos foram gravados antes da linha; se ela falhar, eles não
    // podem ficar órfãos no disco apontados por ninguém.
    await deleteUploadedFile(imgInsta.filePath).catch(() => {});
    await deleteUploadedFile(imgLoja.filePath).catch(() => {});
    // GENERICO, e não uma mensagem própria: a anterior dizia a um remetente SEM
    // SESSÃO que a escrita no banco falhou — reconhecimento de graça, e a única
    // falha pós-contenção que não ajudava em nada a lojista. As duas recusas de
    // sharp acima seguem específicas de propósito (ela precisa saber QUAL foto
    // trocar); esta não oferece ação nenhuma, então dobrar no genérico não custa
    // nada a ela. O diagnóstico fica no `console.error`, onde pertence.
    return actionError(GENERICO);
  }

  return actionOk(undefined);
}
