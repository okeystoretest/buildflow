import { normalizePhone, isValidPhone } from "@/lib/phone";
import { isValidCnpj, normalizeCnpj } from "@/lib/wholesale-identity";
import { isValidRejectionCode } from "@/lib/wholesale-rejection-codes";
import {
  EMAIL_RE,
  FOUND_US,
  GRAMATICA_INSTAGRAM,
  INVESTMENT_BANDS,
  SERVICE_MODELS,
  UF_LIST,
  normalizarInstagram,
  storeImageKindFor,
} from "@/lib/wholesale-apply-validation";

/**
 * Importação das candidaturas ANTIGAS, que viviam numa planilha.
 *
 * Função PURA, pelo mesmo motivo de `wholesale-apply-validation.ts`: um script
 * confere linha por linha sem subir Postgres (`scripts/checks/wholesale-leads-import.ts`).
 * A Server Action lê o CSV, chama isto e só grava o que passou.
 *
 * A DIFERENÇA ESSENCIAL EM RELAÇÃO AO FORMULÁRIO PÚBLICO: lá tudo é
 * obrigatório (decisão 20), porque a lojista está na tela e pode ser cobrada.
 * Aqui não há ninguém para perguntar — a planilha é o que existe. Então só
 * `marca` e `nome` são obrigatórios: sem marca a candidatura não pertence a
 * nenhuma operação, e sem nome não há o que ler na lista. Todo o resto entra em
 * branco quando a planilha não tem, e a ficha mostra "—".
 *
 * O QUE *NÃO* É FROUXO: campo preenchido é VALIDADO com o mesmo rigor do
 * formulário público. Um CNPJ de 13 dígitos ou uma UF inventada entrariam no
 * banco e quebrariam o aviso de repetição e o filtro por estado — defeitos que
 * aparecem semanas depois, longe da importação. Linha com dado inválido é
 * recusada com o número dela, e as outras entram.
 */

/** Uma coluna do modelo: o cabeçalho, o exemplo e se é obrigatória. */
export interface ColunaImport {
  /** Cabeçalho exato do modelo. */
  nome: string;
  /** Valor de exemplo, para a linha de amostra do arquivo-modelo. */
  exemplo: string;
  obrigatoria?: true;
  /** Valores aceitos, quando a coluna é de valor fechado. */
  aceita?: readonly string[];
}

/**
 * AS COLUNAS, EM ORDEM — fonte única.
 *
 * O arquivo-modelo, o texto de ajuda do botão e o mapa de cabeçalhos saem todos
 * daqui. Acrescentar coluna em um lugar e esquecer o outro era o defeito óbvio
 * a evitar: o modelo diria uma coisa e o leitor esperaria outra.
 *
 * As duas imagens do formulário (print do Instagram e foto da loja) NÃO têm
 * coluna: são arquivos enviados, não célula de planilha. Ficam vazias, e a
 * ficha já sabe exibir "Imagem não disponível" (ver `Miniatura`).
 */
export const COLUNAS_IMPORT: readonly ColunaImport[] = [
  { nome: "marca", exemplo: "OKEY", obrigatoria: true, aceita: ["OKEY", "LOV_CLUB"] },
  { nome: "data_recebimento", exemplo: "15/03/2026" },
  { nome: "nome", exemplo: "Ana Paula Souza", obrigatoria: true },
  { nome: "email", exemplo: "ana@lojadaana.com.br" },
  { nome: "telefone", exemplo: "(11) 98765-4321" },
  { nome: "cnpj", exemplo: "12.345.678/0001-95" },
  { nome: "instagram", exemplo: "lojadaana" },
  { nome: "cidade", exemplo: "Campinas" },
  { nome: "uf", exemplo: "SP" },
  {
    nome: "modelo_atendimento",
    exemplo: "LOJA_FISICA",
    aceita: SERVICE_MODELS,
  },
  { nome: "modelo_atendimento_outro", exemplo: "" },
  { nome: "historia", exemplo: "Abri a loja em 2019 com uma arara e muita vontade." },
  { nome: "tempo_mercado", exemplo: "6 anos" },
  { nome: "tamanho_equipe", exemplo: "3 pessoas" },
  { nome: "marcas_que_trabalha", exemplo: "Marca A, Marca B" },
  { nome: "como_nos_achou", exemplo: "INSTAGRAM", aceita: FOUND_US },
  { nome: "como_nos_achou_outro", exemplo: "" },
  { nome: "tempo_que_segue", exemplo: "2 anos" },
  { nome: "faixa_investimento", exemplo: "DE_3_A_5K", aceita: INVESTMENT_BANDS },
  { nome: "quer_visita", exemplo: "sim", aceita: ["sim", "nao"] },
  // COMPROU entrou em 28/10/2026. O modelo baixado lista os valores aceitos a
  // partir deste `aceita`, entao a planilha que a Gestao baixa ja o oferece.
  {
    nome: "status",
    exemplo: "APROVADO",
    aceita: ["EM_ANALISE", "APROVADO", "REPROVADO", "CUIDADO", "COMPROU"],
  },
  { nome: "motivo_reprovacao", exemplo: "" },
  { nome: "motivo_cuidado", exemplo: "" },
  // A VENDEDORA DONA da candidatura, por NOME ou e-mail. O cabecalho se chama
  // "atendente" porque e assim que a coluna se chama na planilha que a Gestao
  // tem. Vincula de verdade (`sellerId`), e nao e texto: e esse vinculo que
  // decide quem enxerga a candidatura na lista.
  { nome: "atendente", exemplo: "Mariana Alves" },
  // Texto livre, exibido em maiusculas (decisao 19) — a coluna "Auxiliar" da
  // lista. Nao e usuario do sistema, e por isso nao vincula nada.
  { nome: "auxiliar", exemplo: "" },
  { nome: "decidido_por", exemplo: "gestao@empresa.com" },
  { nome: "data_decisao", exemplo: "20/03/2026" },
] as const;

/** Linha pronta para o `prisma.wholesaleLead.create`, menos o que vem do banco. */
export interface LeadImportado {
  brand: "OKEY" | "LOV_CLUB";
  status: "EM_ANALISE" | "APROVADO" | "REPROVADO" | "CUIDADO" | "COMPROU";
  createdAt: Date | null;
  contactName: string;
  email: string;
  phone: string;
  story: string;
  state: string;
  city: string;
  serviceModel: (typeof SERVICE_MODELS)[number] | null;
  serviceModelOther: string | null;
  instagram: string;
  storeImageKind: "ESPACO_FISICO" | "LOJA_ONLINE" | null;
  marketTime: string;
  teamSize: string;
  brandsCarried: string;
  foundUs: (typeof FOUND_US)[number] | null;
  foundUsOther: string | null;
  followTime: string;
  investmentBand: (typeof INVESTMENT_BANDS)[number] | null;
  wantsVisit: boolean | null;
  cnpj: string;
  rejectionCode: string | null;
  cautionReason: string | null;
  assistantName: string | null;
  decidedAt: Date | null;
  /**
   * Nome OU e-mail de quem a planilha cita. Quem resolve para id é a action,
   * que tem o banco. Nome porque a planilha antiga traz o nome da vendedora e
   * não o login dela; e-mail porque é a saída quando duas pessoas têm o mesmo
   * nome — e aí só ele desempata.
   */
  sellerRef: string | null;
  decidedByRef: string | null;
}

export type LinhaImport = { error: string } | { ok: true; lead: LeadImportado };

/** Cabeçalho normalizado: sem acento, minúsculo, só letras e números. */
function normCabecalho(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Mapa coluna -> índice, lido do cabeçalho do arquivo.
 *
 * Por NOME e não por posição: quem preenche a planilha no Excel reordena,
 * esconde e insere colunas sem perceber que isso importa. Lido por posição, um
 * arrasto de coluna gravaria cidade no campo de CNPJ — e passaria, porque os
 * dois são texto.
 *
 * Devolve `null` quando a primeira linha não tem `marca` e `nome`: aí não é
 * cabeçalho, e importar por posição seria adivinhar.
 */
export function mapearCabecalho(primeiraLinha: string[]): Record<string, number> | null {
  const idx: Record<string, number> = {};
  primeiraLinha.forEach((celula, i) => {
    const alvo = COLUNAS_IMPORT.find((c) => normCabecalho(c.nome) === normCabecalho(celula));
    if (alvo && !(alvo.nome in idx)) idx[alvo.nome] = i;
  });
  return "marca" in idx && "nome" in idx ? idx : null;
}

/**
 * Data em dd/mm/aaaa (como o Excel brasileiro escreve) ou aaaa-mm-dd.
 *
 * Gravada ao MEIO-DIA UTC, não à meia-noite: o contêiner roda em UTC e o país
 * é UTC-3, então meia-noite UTC de 15/03 é 21h de 14/03 em São Paulo — a
 * candidatura apareceria na lista um dia antes do que a planilha diz.
 */
function data(valor: string): Date | "invalida" | null {
  if (!valor) return null;
  const br = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(valor);
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(valor);
  const [a, m, d] = br
    ? [Number(br[3]), Number(br[2]), Number(br[1])]
    : iso
      ? [Number(iso[1]), Number(iso[2]), Number(iso[3])]
      : [0, 0, 0];
  if (!a || m < 1 || m > 12 || d < 1 || d > 31) return "invalida";
  const dt = new Date(Date.UTC(a, m - 1, d, 12));
  // Rejeita 31/02: o Date rola para 03/03 em silêncio.
  return dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? dt : "invalida";
}

/**
 * Converte UMA linha da planilha.
 *
 * `col` vem de `mapearCabecalho`. Célula ausente é lida como vazia — planilha
 * salva pelo Excel corta as colunas vazias do fim da linha, e isso é normal,
 * não erro.
 */
export function converterLinha(
  celulas: string[],
  col: Record<string, number>,
): LinhaImport {
  const ler = (nome: string): string => {
    const i = col[nome];
    const v = i == null ? "" : celulas[i];
    return typeof v === "string" ? v.trim() : "";
  };
  /** Valor fechado: vazio -> null, inválido -> erro, válido -> ele mesmo. */
  const fechado = <T extends string>(
    nome: string,
    aceitos: readonly T[],
  ): T | null | { error: string } => {
    const bruto = ler(nome);
    if (!bruto) return null;
    // Acento FORA antes de comparar, como `normCabecalho` ja fazia com os
    // cabecalhos: quem preenche copia o rotulo da tela ("Em analise", com
    // acento) e nao o nome do enum. Recusar isso seria recusar a grafia certa.
    const v = bruto
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toUpperCase()
      .replace(/[\s-]+/g, "_") as T;
    if (!aceitos.includes(v)) {
      return { error: `${nome} inválido ("${bruto}"). Use: ${aceitos.join(", ")}.` };
    }
    return v;
  };
  const erro = (v: unknown): v is { error: string } =>
    typeof v === "object" && v !== null && "error" in v;

  // --- obrigatórios -------------------------------------------------------
  const marca = fechado("marca", ["OKEY", "LOV_CLUB"] as const);
  if (erro(marca)) return { error: marca.error };
  if (!marca) return { error: "marca é obrigatória (OKEY ou LOV_CLUB)." };

  const contactName = ler("nome");
  if (!contactName) return { error: "nome é obrigatório." };

  // --- valor fechado, todos opcionais ------------------------------------
  const serviceModel = fechado("modelo_atendimento", SERVICE_MODELS);
  if (erro(serviceModel)) return { error: serviceModel.error };
  const foundUs = fechado("como_nos_achou", FOUND_US);
  if (erro(foundUs)) return { error: foundUs.error };
  const investmentBand = fechado("faixa_investimento", INVESTMENT_BANDS);
  if (erro(investmentBand)) return { error: investmentBand.error };
  const status =
    fechado("status", ["EM_ANALISE", "APROVADO", "REPROVADO", "CUIDADO", "COMPROU"] as const) ??
    "EM_ANALISE";
  if (erro(status)) return { error: status.error };

  const visitaBruta = ler("quer_visita").toLowerCase();
  const wantsVisit =
    visitaBruta === "" ? null
    : ["sim", "s", "true", "1", "yes"].includes(visitaBruta) ? true
    : ["nao", "não", "n", "false", "0", "no"].includes(visitaBruta) ? false
    : "invalido";
  if (wantsVisit === "invalido") {
    return { error: `quer_visita inválido ("${ler("quer_visita")}"). Use sim ou nao.` };
  }

  // --- texto validado quando preenchido ----------------------------------
  const email = ler("email");
  if (email && !EMAIL_RE.test(email)) return { error: `e-mail inválido ("${email}").` };

  const telefoneBruto = ler("telefone");
  let phone = "";
  if (telefoneBruto) {
    phone = normalizePhone(telefoneBruto);
    if (!isValidPhone(phone)) return { error: `telefone inválido ("${telefoneBruto}").` };
  }

  const cnpjBruto = ler("cnpj");
  let cnpj = "";
  if (cnpjBruto) {
    cnpj = normalizeCnpj(cnpjBruto);
    if (!isValidCnpj(cnpj)) return { error: `CNPJ inválido ("${cnpjBruto}").` };
  }

  const ufBruta = ler("uf").toUpperCase();
  if (ufBruta && !(UF_LIST as readonly string[]).includes(ufBruta)) {
    return { error: `UF inválida ("${ufBruta}").` };
  }

  const instaBruto = ler("instagram");
  let instagram = "";
  if (instaBruto) {
    instagram = normalizarInstagram(instaBruto);
    if (!GRAMATICA_INSTAGRAM.test(instagram)) {
      return { error: `Instagram inválido ("${instaBruto}").` };
    }
  }

  // --- decisão ------------------------------------------------------------
  // Os 34 codigos sao "01".."34", com zero a esquerda. O Excel trata "01" como
  // NUMERO e salva "1": sem este padding, todo motivo digitado a mao seria
  // recusado, e a Gestao concluiria que a importacao esta quebrada.
  const motivoBruto = ler("motivo_reprovacao").toUpperCase();
  const rejectionCode = (/^\d$/.test(motivoBruto) ? `0${motivoBruto}` : motivoBruto) || null;
  if (rejectionCode && !isValidRejectionCode(rejectionCode)) {
    return { error: `motivo_reprovacao inválido ("${rejectionCode}").` };
  }
  // O motivo só existe em reprovada: num APROVADO ele seria lido pela tela
  // como reprovação, porque é o `rejectionCode` que a lista exibe.
  if (rejectionCode && status !== "REPROVADO") {
    return { error: `motivo_reprovacao só vale com status REPROVADO.` };
  }
  const cautionReason = ler("motivo_cuidado") || null;
  // Exigido pela decisão 8, e o modal não deixa marcar CUIDADO sem ele: um
  // CUIDADO sem justificativa é um alerta que ninguém sabe interpretar.
  if (status === "CUIDADO" && !cautionReason) {
    return { error: "status CUIDADO exige motivo_cuidado." };
  }

  const createdAt = data(ler("data_recebimento"));
  if (createdAt === "invalida") {
    return { error: `data_recebimento inválida ("${ler("data_recebimento")}").` };
  }
  const decidedAt = data(ler("data_decisao"));
  if (decidedAt === "invalida") {
    return { error: `data_decisao inválida ("${ler("data_decisao")}").` };
  }

  return {
    ok: true,
    lead: {
      brand: marca,
      status,
      createdAt,
      contactName,
      email,
      phone,
      story: ler("historia"),
      state: ufBruta,
      city: ler("cidade"),
      serviceModel,
      serviceModelOther: ler("modelo_atendimento_outro") || null,
      instagram,
      // Derivado, como no formulário público: sem modelo de atendimento não há
      // o que derivar, e o rótulo da foto deixa de fazer afirmação.
      storeImageKind: serviceModel ? storeImageKindFor(serviceModel) : null,
      marketTime: ler("tempo_mercado"),
      teamSize: ler("tamanho_equipe"),
      brandsCarried: ler("marcas_que_trabalha"),
      foundUs,
      foundUsOther: ler("como_nos_achou_outro") || null,
      followTime: ler("tempo_que_segue"),
      investmentBand,
      wantsVisit,
      cnpj,
      rejectionCode,
      cautionReason,
      // Maiúsculas como a decisão 19 manda, igual à action da tela.
      assistantName: ler("auxiliar").toUpperCase() || null,
      decidedAt,
      sellerRef: ler("atendente") || null,
      decidedByRef: ler("decidido_por") || null,
    },
  };
}

/**
 * Forma comparável de um nome de pessoa: sem acento, sem maiúscula, com os
 * espaços colapsados.
 *
 * "Mariana  Alves", "MARIANA ALVES" e "Mariana Álves" são a mesma pessoa na
 * planilha e precisam casar com o mesmo usuário. Comparar cru faria a
 * importação recusar o nome certo por causa de um espaço duplo que ninguém vê.
 */
export function normalizarNome(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/** Uma referência a pessoa é e-mail quando tem "@"; senão é nome. */
export const ehEmail = (ref: string): boolean => ref.includes("@");

/**
 * A CHAVE que torna a importação repetível.
 *
 * Reimportar a planilha corrigida tem de ATUALIZAR a candidatura, não criar
 * outra. Como a planilha não traz id, a identidade é derivada do conteúdo:
 * marca + CNPJ, que é o par que identifica uma lojista candidata.
 *
 * O prefixo `planilha:` não é enfeite — é o que garante que a chave só exista
 * em candidatura importada. Quem vem do formulário público fica com `null`, e
 * por isso uma importação nunca sobrescreve um cadastro real, mesmo que o CNPJ
 * coincida (nesse caso entra como candidatura nova, e o aviso de repetição da
 * decisão 9 faz o trabalho dele).
 *
 * SEM CNPJ a identidade cai no telefone e, na falta dele, no nome. É o que
 * permite reimportar linha que a planilha antiga deixou incompleta.
 *
 * shortcut: duas pessoas diferentes, sem CNPJ e sem telefone, com o mesmo nome
 * e a mesma marca, colapsam numa só — a segunda sobrescreve a primeira. Passar
 * a uma coluna de id própria na planilha se isso aparecer de verdade.
 */
export function chaveDeImportacao(lead: {
  brand: string;
  cnpj: string;
  phone: string;
  contactName: string;
}): string {
  const parte =
    lead.cnpj ? `cnpj:${lead.cnpj}`
    : lead.phone ? `tel:${lead.phone}`
    : `nome:${normalizarNome(lead.contactName)}`;
  return `planilha:${lead.brand}:${parte}`;
}

/** O conteúdo do arquivo-modelo: cabeçalho + uma linha de exemplo. */
export function modeloCsv(): string {
  const cab = COLUNAS_IMPORT.map((c) => c.nome).join(";");
  const exemplo = COLUNAS_IMPORT.map((c) => c.exemplo).join(";");
  // BOM: sem ele o Excel em português abre UTF-8 como ANSI e "São" vira "SÃ£o".
  // `;` como separador pelo mesmo motivo — é o que o Excel pt-BR espera.
  return `﻿${cab}\n${exemplo}\n`;
}
