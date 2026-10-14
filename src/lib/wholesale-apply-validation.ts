import { normalizePhone, isValidPhone } from "@/lib/phone";
import { isValidCnpj, normalizeCnpj } from "@/lib/wholesale-identity";

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

const SERVICE_MODELS = ["LOJA_FISICA", "LOJA_ONLINE", "FISICA_E_ONLINE", "OUTRO"] as const;
const FOUND_US = ["INSTAGRAM", "SITE", "INDICACAO", "OUTRO"] as const;
const INVESTMENT_BANDS = ["ATE_3K", "DE_3_A_5K", "DE_5_A_10K", "ACIMA_10K"] as const;

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
  cnpj: string; // só dígitos, 14
}

export type ApplyValidation = { error: string } | { ok: true; clean: CleanApply };

/**
 * Tetos de cada campo livre. Campo de texto sem limite numa porta pública é
 * convite a encher a tabela: ninguém digita 5.000 caracteres de história, e
 * quem manda não está preenchendo um formulário.
 */
const CAMPOS_TEXTO = [
  { campo: "contactName", rotulo: "Nome completo", max: 120 },
  { campo: "email", rotulo: "E-mail", max: 160 },
  { campo: "phone", rotulo: "WhatsApp", max: 200 },
  { campo: "story", rotulo: "Sua história", max: 2000 },
  { campo: "city", rotulo: "Cidade", max: 120 },
  { campo: "instagram", rotulo: "Instagram da loja", max: 60 },
  { campo: "marketTime", rotulo: "Tempo de mercado", max: 200 },
  { campo: "teamSize", rotulo: "Tamanho da equipe", max: 200 },
  { campo: "brandsCarried", rotulo: "Marcas que você trabalha", max: 200 },
  { campo: "followTime", rotulo: "Tempo que você nos acompanha", max: 200 },
] as const;

const MAX_OUTRO = 200;

/** Leitura defensiva: o que não for string é tratado como vazio, não quebra. */
function texto(campos: Record<string, string>, chave: string): string {
  const valor: unknown = (campos as Record<string, unknown>)[chave];
  return typeof valor === "string" ? valor.trim() : "";
}

export function validateApplyPayload(campos: Record<string, string>): ApplyValidation {
  // O objeto INTEIRO pode não chegar (cliente malformado, envio truncado).
  // Trocado por um vazio, cai na primeira mensagem de campo obrigatório em vez
  // de lançar — numa porta pública, exceção é 500 na cara de quem enviou.
  const fonte: Record<string, string> =
    campos && typeof campos === "object" ? campos : {};

  // 1. Obrigatórios e tetos, de uma vez, na ordem em que aparecem na tela:
  // a primeira mensagem que a lojista vê aponta o primeiro campo errado.
  const lidos: Record<string, string> = {};
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
  // Conferido depois de tirar a arroba: "@" sozinho passa no obrigatório acima
  // e não é handle nenhum.
  const instagram = lidos.instagram.replace(/^@+/, "").trim();
  if (!instagram) return { error: 'Preencha o campo "Instagram da loja".' };

  // 2. E-mail e telefone: formato conferido aqui porque são os dois caminhos
  // pelos quais a vendedora vai responder. Errados, o cadastro não serve.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lidos.email)) {
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
