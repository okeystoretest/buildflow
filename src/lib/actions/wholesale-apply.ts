"use server";

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
 */

const GENERICO = "Não foi possível enviar agora. Tente novamente em alguns minutos.";
const MIN_FILL_MS = 5_000;

const BRANDS = ["OKEY", "LOV_CLUB"] as const;

export interface ApplyInput {
  brandSlug: string;
  referralCode?: string | null;
  campos: Record<string, string>;
  instagramImage: string; // data-URL
  storeImage: string; // data-URL
  honeypot: string;
  openedAt: number;
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

export async function submitWholesaleApplication(
  input: ApplyInput,
): Promise<ActionResult<void>> {
  // 1. Contenção, antes de qualquer trabalho caro (decisão 27).
  // O argumento inteiro pode não chegar: o tipo é promessa do compilador, e
  // quem chama esta action é um navegador qualquer.
  if (!input || typeof input !== "object") return actionError(GENERICO);
  if (input.honeypot) return actionError(GENERICO);
  if (
    typeof input.openedAt !== "number" ||
    !Number.isFinite(input.openedAt) ||
    Date.now() - input.openedAt < MIN_FILL_MS
  ) {
    return actionError(GENERICO);
  }
  const ip = getClientIp();
  const rate = checkRate(`atacado:${ip}`, { max: 5, windowMs: 60 * 60 * 1000 });
  if (!rate.allowed) return actionError(GENERICO);

  // 2. Marca pelo caminho, nunca pelo payload. A tradução marca <-> slug tem
  // um único lugar (`brandSlug`); aqui ela é percorrida de volta para que uma
  // marca nova não precise ser lembrada em dois arquivos.
  const brand = BRANDS.find((b) => brandSlug(b) === input.brandSlug) ?? null;
  if (!brand) return actionError(GENERICO);

  // 3. Campos.
  const v = validateApplyPayload(input.campos);
  if ("error" in v) return actionError(v.error);

  // 4. Imagens: assinatura manda, MIME declarado não (CVE-2026-96889).
  const insta = bufferDoDataUrl(input.instagramImage);
  const loja = bufferDoDataUrl(input.storeImage);
  const erroInsta = validateUploadDataUrl(input.instagramImage, insta);
  if (erroInsta) return actionError(`Imagem do Instagram: ${erroInsta}`);
  if (ehPdf(insta)) {
    return actionError("Imagem do Instagram: envie uma foto (JPG ou PNG), não um PDF.");
  }
  const erroLoja = validateUploadDataUrl(input.storeImage, loja);
  if (erroLoja) return actionError(`Foto da loja: ${erroLoja}`);
  if (ehPdf(loja)) {
    return actionError("Foto da loja: envie uma foto (JPG ou PNG), não um PDF.");
  }

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
  } catch {
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
    imgInsta = await processAndSaveImage(insta, { folder: "atacado", fileName: "instagram" });
  } catch {
    return actionError(
      "Não foi possível processar a imagem do Instagram. Tente enviar um JPG ou PNG.",
    );
  }

  let imgLoja: ProcessedImage;
  try {
    imgLoja = await processAndSaveImage(loja, { folder: "atacado", fileName: "loja" });
  } catch {
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
  } catch {
    // Os dois arquivos foram gravados antes da linha; se ela falhar, eles não
    // podem ficar órfãos no disco apontados por ninguém.
    await deleteUploadedFile(imgInsta.filePath).catch(() => {});
    await deleteUploadedFile(imgLoja.filePath).catch(() => {});
    return actionError("Não foi possível registrar o seu cadastro. Tente novamente.");
  }

  return actionOk(undefined);
}
