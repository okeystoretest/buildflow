import { normalizePhone, isValidPhone } from "@/lib/phone";
import { isValidCnpj, normalizeCnpj } from "@/lib/wholesale-identity";
import { instanteNoFuso, FUSO_NEGOCIO } from "@/lib/rank-window";

/**
 * Validação do formulário público de atacado.
 *
 * Função PURA de propósito: é a única regra de escrita deste sistema que
 * decide sobre dados de quem NÃO tem sessão, e um script a confere sem subir
 * Postgres nem navegador. A Server Action carrega o que precisa do banco e
 * obedece ao veredito daqui.
 *
 * TUDO é obrigatório (decisão 20): um cadastro pela metade chega à analista
 * como trabalho que ela não pode concluir, e ela não tem como voltar a
 * perguntar — a lojista preencheu e foi embora.
 *
 * O tipo de entrada é `Record<string, string>`, mas o conteúdo vem de um
 * navegador: o compilador promete, o cliente HTTP não cumpre. Por isso todo
 * campo é lido por `texto()`, que trata chave ausente, `undefined` e valor
 * que não é string como vazio — nenhum deles pode chegar a `normalizePhone`,
 * a `normalizeCnpj` ou a uma conta de comprimento.
 */

export const UF_LIST = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG",
  "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE",
  "TO",
] as const;

export const SERVICE_MODELS = ["LOJA_FISICA", "LOJA_ONLINE", "FISICA_E_ONLINE", "OUTRO"] as const;
export const FOUND_US = ["INSTAGRAM", "SITE", "INDICACAO", "OUTRO"] as const;
export const INVESTMENT_BANDS = ["ATE_3K", "DE_3_A_5K", "DE_5_A_10K", "ACIMA_10K"] as const;

export interface CleanApply {
  contactName: string;
  email: string;
  phone: string; // só dígitos
  story: string;
  state: string; // UF, 2 letras maiúsculas
  city: string;
  serviceModel: (typeof SERVICE_MODELS)[number];
  serviceModelOther: string | null;
  instagram: string; // sem "@"
  storeImageKind: "ESPACO_FISICO" | "LOJA_ONLINE";
  marketTime: string;
  teamSize: string;
  brandsCarried: string;
  foundUs: (typeof FOUND_US)[number];
  foundUsOther: string | null;
  followTime: string;
  investmentBand: (typeof INVESTMENT_BANDS)[number];
  wantsVisit: boolean;
  wantsPresentation: boolean;
  /// Instante ancorado no fuso do negócio; null quando a resposta foi "não".
  presentationAt: Date | null;
  cnpj: string; // só dígitos, 14
}

export type ApplyValidation = { error: string } | { ok: true; clean: CleanApply };

/**
 * Tetos de cada campo livre. Campo de texto sem limite numa porta pública é
 * convite a encher a tabela: ninguém digita 5.000 caracteres de história, e
 * quem manda não está preenchendo um formulário.
 */
/**
 * O RÓTULO É O DA TELA, palavra por palavra.
 *
 * Antes eram nomes internos ("Nome completo", "Sua história", "Tempo de
 * mercado") que **não existem na página**: a lojista lia *Preencha o campo
 * "Nome completo"* procurando um campo chamado assim, enquanto a tela perguntava
 * "Como podemos te chamar?". Mensagem de erro que nomeia um campo invisível é
 * pior que mensagem genérica, porque manda procurar o que não está lá.
 *
 * `scripts/checks/wholesale-apply-validation.ts` lê o `rotulo=` de cada campo em
 * `apply-form.tsx` e afirma que casa com esta tabela — então divergir aqui fica
 * vermelho, em vez de só chegar à lojista.
 */
const CAMPOS_TEXTO = [
  { campo: "contactName", rotulo: "Como podemos te chamar?", max: 120 },
  { campo: "email", rotulo: "Qual é o seu melhor e-mail para contato?", max: 160 },
  { campo: "phone", rotulo: "Qual é o seu WhatsApp ou telefone para conversarmos?", max: 200 },
  { campo: "story", rotulo: "Conte-nos um pouco sobre você e sua trajetória", max: 2000 },
  { campo: "city", rotulo: "Em qual cidade sua loja está localizada?", max: 120 },
  { campo: "instagram", rotulo: "Qual é o Instagram da sua loja?", max: 60 },
  { campo: "marketTime", rotulo: "Há quanto tempo sua loja atua no mercado?", max: 200 },
  { campo: "teamSize", rotulo: "Quantas pessoas fazem parte da sua equipe atualmente?", max: 200 },
  { campo: "brandsCarried", rotulo: "Quais marcas já fazem parte do seu espaço?", max: 200 },
  { campo: "followTime", rotulo: "Há quanto tempo você acompanha a nossa marca?", max: 200 },
] as const;

/**
 * Os rótulos, expostos para a checagem poder compará-los com a tela.
 * Não é para consumo em runtime.
 */
export const ROTULOS_DE_CAMPO: Readonly<Record<string, string>> = Object.fromEntries(
  CAMPOS_TEXTO.map(({ campo, rotulo }) => [campo, rotulo]),
);

/**
 * Forma de e-mail. Prova FORMA, não endereço entregável — `foo@bar.com` passa e
 * pode não existir. Exigir o ponto no domínio é o que separa "ana@loja" (que o
 * `type="email"` nativo aceita) de algo que um mailer tem chance de entregar.
 *
 * ReDoS descartado por medição: pior caso de 160 caracteres leva 0,05 ms.
 */
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * A gramática real e pública do handle do Instagram: letras, números, ponto e
 * sublinhado, até 30. Antes o campo tinha só teto de tamanho e remoção do "@",
 * então `minhaloja/?x=1` e uma quebra de linha eram gravados como se fossem
 * handle. Sem XSS hoje — os dois renders são texto JSX, que o React escapa —
 * mas a exposição é a próxima pessoa que escrever
 * `href={`https://instagram.com/${lead.instagram}`}` e herdar barra, `?`, `#`
 * ou newline. Fechar a gramática agora custa uma linha; depois custa auditar
 * todo consumidor.
 */
export const GRAMATICA_INSTAGRAM = /^[A-Za-z0-9._]{1,30}$/;

/**
 * Reduz ao handle o que a lojista realmente cola.
 *
 * No celular, "Copiar link do perfil" entrega
 * `https://www.instagram.com/minhaloja/` — e com gramática fechada isso viraria
 * uma recusa para alguém que fez exatamente o que parecia certo. Então o prefixo
 * conhecido, a arroba, a barra final e qualquer `?`/`#` saem ANTES da gramática
 * decidir. O que a gramática recusa é o que sobrou sem ser handle.
 */
export function normalizarInstagram(valor: string): string {
  return valor
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^(?:www\.)?instagram\.com\//i, "")
    .split(/[?#]/)[0]
    .replace(/^@+/, "")
    .replace(/\/+$/, "")
    .trim();
}

/**
 * Os nomes de campo que a tabela acima declara, como união de literais.
 *
 * É o que faz o COMPILADOR carregar o mapeamento: `lidos` é indexado por este
 * tipo, então `lidos.contactNome` (com o "e" trocado) não compila. Como um
 * `Record<string, string>` ele compilava, devolvia `undefined` e espalhava esse
 * `undefined` dentro do `prisma.create` — exatamente a quebra que o brief
 * avisa, com o compilador cego para ela.
 */
type CampoTexto = (typeof CAMPOS_TEXTO)[number]["campo"];

/**
 * Campos de valor fechado e os dois textos de "Outro": lidos por `texto()` mais
 * abaixo, fora da tabela de textos livres.
 */
type CampoFechado =
  | "state"
  | "serviceModel"
  | "serviceModelOther"
  | "foundUs"
  | "foundUsOther"
  | "investmentBand"
  | "wantsVisit"
  | "wantsPresentation"
  | "presentationAt"
  | "cnpj";

/**
 * TODO nome de campo que `validateApplyPayload` lê, como união de literais.
 *
 * O formulário público tipa o seu payload com `Record<CampoEsperado, string>`.
 * O envio é a única parte desta feature que nenhum script de checagem alcança
 * (é componente de cliente), e uma chave com nome trocado só aparece quando a
 * lojista já preencheu 18 campos e o servidor recusa — sem pista no relatório
 * dela. Assim, chave errada ou faltando deixa de compilar.
 */
export type CampoEsperado = CampoTexto | CampoFechado;

const MAX_OUTRO = 200;

/** Leitura defensiva: o que não for string é tratado como vazio, não quebra. */
function texto(campos: Record<string, string>, chave: CampoEsperado): string {
  const valor: unknown = (campos as Record<string, unknown>)[chave];
  return typeof valor === "string" ? valor.trim() : "";
}


// ---------------------------------------------------------------------------
// Data e hora da apresentação
// ---------------------------------------------------------------------------

/** Forma exata que `<input type="datetime-local">` envia. */
const DATETIME_LOCAL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/**
 * Até onde se pode agendar. Dois anos não é regra de negócio, é teto de
 * sanidade: o seletor do celular rola até 9999, e uma apresentação em 4021
 * seria uma tarefa que nunca sai da coluna "A Fazer" da vendedora.
 */
const MAX_MESES_A_FRENTE = 24;

/**
 * Converte o texto do formulário no instante que a lojista quis dizer.
 *
 * O `datetime-local` manda "2026-11-20T14:00" SEM FUSO. `new Date(texto)` o
 * interpretaria no relógio do processo — e o container roda em UTC, então
 * "14:00" viraria 11:00 em Brasília e a vendedora apareceria três horas
 * depois. Por isso o texto é quebrado em números e remontado por
 * `instanteNoFuso`, a mesma função que ancora as janelas do ranking.
 *
 * Reconstruir e comparar é o que recusa 31/02 e 25:00: `instanteNoFuso` usa
 * `Date.UTC`, que normaliza silenciosamente o dia inválido para o mês
 * seguinte em vez de reclamar.
 */
export function validarApresentacao(
  bruto: string,
  agora: Date = new Date(),
): { error: string } | { quando: Date } {
  const m = DATETIME_LOCAL.exec(bruto);
  if (!m) return { error: "Informe a data e o horário da apresentação." };

  const [ano, mes, dia, hora, minuto] = m.slice(1).map(Number);
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31 || hora > 23 || minuto > 59) {
    return { error: "Data ou horário inválido. Confira o que você escolheu." };
  }

  const quando = instanteNoFuso(ano, mes, dia, hora, minuto);
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO_NEGOCIO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(quando);
  if (partes !== `${m[1]}-${m[2]}-${m[3]}`) {
    return { error: "Data ou horário inválido. Confira o que você escolheu." };
  }

  // Passado é recusado: a tarefa da vendedora nasceria vencida. O minuto
  // corrente ainda vale — quem escolhe "agora" no seletor não está errada.
  if (quando.getTime() < agora.getTime() - 60_000) {
    return { error: "Escolha uma data e um horário que ainda não passaram." };
  }

  const teto = new Date(agora);
  teto.setMonth(teto.getMonth() + MAX_MESES_A_FRENTE);
  if (quando.getTime() > teto.getTime()) {
    return { error: `Escolha uma data dentro dos próximos ${MAX_MESES_A_FRENTE} meses.` };
  }

  return { quando };
}

export function validateApplyPayload(campos: Record<string, string>): ApplyValidation {
  // O objeto INTEIRO pode não chegar (cliente malformado, envio truncado).
  // Trocado por um vazio, cai na primeira mensagem de campo obrigatório em vez
  // de lançar — numa porta pública, exceção é 500 na cara de quem enviou.
  const fonte: Record<string, string> =
    campos && typeof campos === "object" ? campos : {};

  // 1. Obrigatórios e tetos, de uma vez, na ordem em que aparecem na tela:
  // a primeira mensagem que a lojista vê aponta o primeiro campo errado.
  // O cast parte de um objeto vazio porque o laço abaixo o preenche; ele é
  // seguro porque o laço percorre TODOS os campos da tabela e retorna no
  // primeiro que falte, então quem chega à leitura tem os dez preenchidos.
  const lidos = {} as Record<CampoTexto, string>;
  for (const { campo, rotulo, max } of CAMPOS_TEXTO) {
    const valor = texto(fonte, campo);
    if (!valor) return { error: `Preencha o campo "${rotulo}".` };
    if (valor.length > max) {
      return { error: `O campo "${rotulo}" passa de ${max} caracteres.` };
    }
    lidos[campo] = valor;
  }

  // Handle sem o "@": é assim que o campo é gravado e é assim que a analista
  // monta o link do perfil. Deixar a arroba entrar produziria "@@loja".
  const instagram = normalizarInstagram(lidos.instagram);
  if (!instagram) {
    return { error: `Preencha o campo "${ROTULOS_DE_CAMPO.instagram}".` };
  }
  if (!GRAMATICA_INSTAGRAM.test(instagram)) {
    return { error: "Instagram inválido. Informe só o @ da loja, sem link." };
  }

  // 2. E-mail e telefone: formato conferido aqui porque são os dois caminhos
  // pelos quais a vendedora vai responder. Errados, o cadastro não serve.
  if (!EMAIL_RE.test(lidos.email)) {
    return { error: "E-mail inválido. Confira o endereço." };
  }
  const phone = normalizePhone(lidos.phone);
  if (!isValidPhone(phone)) {
    return { error: "WhatsApp inválido. Informe o número com DDD." };
  }

  // 3. Valores fechados: a lista manda, não o que o navegador mandar. Um
  // <select> é conforto de tela — o payload é texto livre como qualquer outro.
  const state = texto(fonte, "state");
  if (!(UF_LIST as readonly string[]).includes(state)) {
    return { error: "Escolha o seu estado." };
  }

  const serviceModel = texto(fonte, "serviceModel");
  if (!(SERVICE_MODELS as readonly string[]).includes(serviceModel)) {
    return { error: "Escolha como você atende suas clientes hoje." };
  }
  // "Outro" sem texto é resposta que não informa nada (decisão 22).
  // O teto só vale quando o texto foi PEDIDO: fora de "Outro" ele é descartado
  // na gravação, e recusar por tamanho algo que a lojista não está nem vendo
  // (ela trocou a opção depois de digitar) é erro que ela não sabe corrigir.
  const serviceModelOther = texto(fonte, "serviceModelOther");
  if (serviceModel === "OUTRO") {
    if (!serviceModelOther) {
      return { error: "Descreva como você atende suas clientes hoje." };
    }
    if (serviceModelOther.length > MAX_OUTRO) {
      return { error: `A descrição de como você atende passa de ${MAX_OUTRO} caracteres.` };
    }
  }

  const foundUs = texto(fonte, "foundUs");
  if (!(FOUND_US as readonly string[]).includes(foundUs)) {
    return { error: "Escolha como você nos encontrou." };
  }
  const foundUsOther = texto(fonte, "foundUsOther");
  if (foundUs === "OUTRO") {
    if (!foundUsOther) {
      return { error: "Conte como você nos encontrou." };
    }
    if (foundUsOther.length > MAX_OUTRO) {
      return { error: `A descrição de como você nos encontrou passa de ${MAX_OUTRO} caracteres.` };
    }
  }

  const investmentBand = texto(fonte, "investmentBand");
  if (!(INVESTMENT_BANDS as readonly string[]).includes(investmentBand)) {
    return { error: "Escolha a sua faixa de investimento inicial." };
  }

  // Booleano também é valor fechado: vazio não é "não", é pergunta sem
  // resposta, e a visita é o que a vendedora agenda depois da aprovação.
  const wantsVisitBruto = texto(fonte, "wantsVisit").toLowerCase();
  const SIM = ["sim", "true", "1"];
  const NAO = ["nao", "não", "false", "0"];
  if (!SIM.includes(wantsVisitBruto) && !NAO.includes(wantsVisitBruto)) {
    return { error: "Diga se você gostaria de receber uma visita." };
  }

  // Mesma forma da `wantsVisit`: valor fechado, vazio é pergunta sem resposta.
  const wantsPresentationBruto = texto(fonte, "wantsPresentation").toLowerCase();
  if (!SIM.includes(wantsPresentationBruto) && !NAO.includes(wantsPresentationBruto)) {
    return { error: "Diga se você tem disponibilidade para uma apresentação." };
  }
  const querApresentacao = SIM.includes(wantsPresentationBruto);

  // A data só é PEDIDA quando ela disse "sim" — e, dito "sim", é obrigatória:
  // "tenho disponibilidade" sem quando é uma resposta que não agenda nada. É a
  // mesma regra dos dois campos de "Outro" logo acima.
  let presentationAt: Date | null = null;
  if (querApresentacao) {
    const erroData = validarApresentacao(texto(fonte, "presentationAt"));
    if ("error" in erroData) return erroData;
    presentationAt = erroData.quando;
  }

  // 4. CNPJ: dígitos verificadores, não só comprimento. Os códigos de recusa
  // 02 e 05 descrevem conferência humana a partir de um número que já faça
  // sentido — não vale ocupar a analista com dígito digitado errado.
  const cnpjBruto = texto(fonte, "cnpj");
  if (!cnpjBruto) return { error: "Informe o CNPJ da sua loja." };
  if (!isValidCnpj(cnpjBruto)) {
    return { error: "CNPJ inválido. Confira os números." };
  }

  return {
    ok: true,
    clean: {
      contactName: lidos.contactName,
      email: lidos.email,
      phone,
      story: lidos.story,
      state,
      city: lidos.city,
      serviceModel: serviceModel as CleanApply["serviceModel"],
      // Só guarda o texto de "Outro" quando ele foi pedido: preenchido e
      // depois trocada a opção, o texto antigo viraria ruído na análise.
      serviceModelOther: serviceModel === "OUTRO" ? serviceModelOther : null,
      instagram,
      storeImageKind: storeImageKindFor(serviceModel as CleanApply["serviceModel"]),
      marketTime: lidos.marketTime,
      teamSize: lidos.teamSize,
      brandsCarried: lidos.brandsCarried,
      foundUs: foundUs as CleanApply["foundUs"],
      foundUsOther: foundUs === "OUTRO" ? foundUsOther : null,
      followTime: lidos.followTime,
      investmentBand: investmentBand as CleanApply["investmentBand"],
      wantsVisit: SIM.includes(wantsVisitBruto),
      wantsPresentation: querApresentacao,
      // "Não" apaga a data: respondido "sim", escolhida a data e trocada a
      // resposta depois, a data velha viraria uma tarefa que ninguém pediu.
      presentationAt: querApresentacao ? presentationAt : null,
      cnpj: normalizeCnpj(cnpjBruto),
    },
  };
}

/**
 * Qual imagem o segundo upload pede (decisão 21).
 *
 * Quem vende SÓ online não tem espaço físico para fotografar; o campo segue
 * obrigatório, muda o que se pede. Todo o resto — física, híbrida e "Outro" —
 * tem um lugar onde atende, e é a foto dele que informa a análise.
 */
export function storeImageKindFor(
  serviceModel: CleanApply["serviceModel"],
): CleanApply["storeImageKind"] {
  return serviceModel === "LOJA_ONLINE" ? "LOJA_ONLINE" : "ESPACO_FISICO";
}
