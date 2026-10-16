/**
 * SELECT — regras puras do contrato de serviço.
 *
 * Sem Prisma e sem rede: tudo aqui é função de entrada → saída, para poder ser
 * verificado por script (scripts/checks/select-contract.ts) sem subir banco.
 * As Server Actions importam daqui; nenhuma delas recalcula data ou parcela
 * por conta própria.
 *
 * DATAS SÃO UTC DE PROPÓSITO. `startDate`, `endDate`, `closedAt` e `dueDate`
 * são colunas DATE no Postgres, e o Prisma as devolve como meia-noite UTC.
 * Fazer a aritmética em horário local faria o contrato que começa dia 1º virar
 * dia 30 no fuso de Brasília — e o "começa no fim do anterior" pararia de
 * fechar por um dia.
 */

/** Meia-noite UTC do dia civil informado (ou de hoje, no fuso do servidor). */
export function dayUTC(d: Date = new Date()): Date {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

/** Meia-noite UTC a partir de "aaaa-mm-dd" (o value de um <input type="date">). */
export function parseDayUTC(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  // Rejeita 31/02 e afins: o Date "corrige" para 03/03 em silêncio.
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) {
    return null;
  }
  return date;
}

/** "aaaa-mm-dd" de uma data UTC (para popular <input type="date">). */
export function toInputDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** "dd/mm/aaaa" de uma data UTC. */
export function formatDayBR(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}

/**
 * Soma MESES DE CALENDÁRIO, recuando para o último dia quando o mês de destino
 * é mais curto: 31/01 + 1 mês = 28/02 (29/02 em ano bissexto), 31/03 + 1 mês =
 * 30/04. Sem esse recuo o Date nativo transborda para o mês seguinte e um
 * contrato assinado dia 31 venceria dia 1º ou 3º.
 */
export function addMonthsClamped(date: Date, months: number): Date {
  const day = date.getUTCDate();
  const alvo = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
  const ultimoDia = new Date(
    Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0),
  ).getUTCDate();
  return new Date(
    Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth(), Math.min(day, ultimoDia)),
  );
}

/**
 * Fim do contrato: INÍCIO + validade em meses de calendário.
 * 01/03/2026 com 12 meses termina em 01/03/2027.
 *
 * O fim é EXCLUSIVO: o dia do fim já não é coberto, e por isso um Select novo
 * pode começar exatamente nele sem sobreposição.
 */
export function contractEndDate(start: Date, validityMonths: number): Date {
  return addMonthsClamped(start, validityMonths);
}

/** Fim efetivo: o encerramento antecipado por troca manda sobre o fim previsto. */
export function effectiveEnd(c: { endDate: Date; closedAt?: Date | null }): Date {
  return c.closedAt ?? c.endDate;
}

export interface InstallmentPlanItem {
  /** Número DENTRO DO CONTRATO (1..validade), não a posição na lista gerada. */
  number: number;
  dueDate: Date;
  amount: number;
}

/**
 * Plano de parcelas de uma adesão.
 *
 * Uma parcela por mês de validade, vencendo no dia do início. As de vencimento
 * JÁ PASSADO não são geradas: um contrato retroativo não nasce cobrando meses
 * que ninguém combinou de cobrar agora.
 *
 * Consequência que a tela precisa respeitar: a soma das parcelas é
 * `mensalidade × meses restantes` e NÃO o valor do contrato. São dois números
 * diferentes, e o painel do Financeiro mostra os dois em linhas separadas.
 */
export function buildInstallmentPlan(args: {
  start: Date;
  validityMonths: number;
  monthlyAmount: number;
  today?: Date;
}): InstallmentPlanItem[] {
  const hoje = args.today ?? dayUTC();
  const itens: InstallmentPlanItem[] = [];
  for (let n = 1; n <= args.validityMonths; n++) {
    const dueDate = addMonthsClamped(args.start, n - 1);
    if (dueDate.getTime() < hoje.getTime()) continue;
    itens.push({ number: n, dueDate, amount: args.monthlyAmount });
  }
  return itens;
}

// ---------------------------------------------------------------------------
// Estados derivados
// ---------------------------------------------------------------------------

export type InstallmentState = "PAGA" | "CANCELADA" | "PARCIAL" | "VENCIDA" | "PENDENTE";

/**
 * Estado de exibição de uma parcela. PARCIAL e VENCIDA não existem no banco:
 * gravá-los exigiria alguém passando todo dia para virar PENDENTE em VENCIDA,
 * e no dia em que esse alguém falhasse a tela mentiria.
 */
export function installmentState(
  inst: { status: "PENDENTE" | "PAGA" | "CANCELADA"; amount: number; paidAmount: number; dueDate: Date },
  today: Date = dayUTC(),
): InstallmentState {
  if (inst.status === "CANCELADA") return "CANCELADA";
  if (inst.status === "PAGA") return "PAGA";
  if (inst.paidAmount > 0) return "PARCIAL";
  if (inst.dueDate.getTime() < today.getTime()) return "VENCIDA";
  return "PENDENTE";
}

export const INSTALLMENT_STATE_LABEL: Record<InstallmentState, string> = {
  PAGA: "Paga",
  CANCELADA: "Cancelada",
  PARCIAL: "Parcial",
  VENCIDA: "Vencida",
  PENDENTE: "Pendente",
};

export type ContractState = "ATIVO" | "AGENDADO" | "ENCERRADO" | "CANCELADO";

/**
 * Estado de exibição de um contrato. AGENDADO é o contrato de início futuro
 * (gravado como ATIVO, como manda a regra 4.7) e ENCERRADO inclui o que
 * alcançou o fim efetivo sem ninguém ter rodado rotina nenhuma.
 */
export function contractState(
  c: { status: "ATIVO" | "CANCELADO" | "ENCERRADO"; startDate: Date; endDate: Date; closedAt?: Date | null },
  today: Date = dayUTC(),
): ContractState {
  if (c.status === "CANCELADO") return "CANCELADO";
  if (c.status === "ENCERRADO") return "ENCERRADO";
  if (today.getTime() >= effectiveEnd(c).getTime()) return "ENCERRADO";
  if (c.startDate.getTime() > today.getTime()) return "AGENDADO";
  return "ATIVO";
}

export const CONTRACT_STATE_LABEL: Record<ContractState, string> = {
  ATIVO: "Ativo",
  AGENDADO: "Agendado",
  ENCERRADO: "Encerrado",
  CANCELADO: "Cancelado",
};

// ---------------------------------------------------------------------------
// Classificação da adesão diante dos contratos já existentes
// ---------------------------------------------------------------------------

export interface ExistingContract {
  id: string;
  startDate: Date;
  endDate: Date;
  closedAt?: Date | null;
  planNameSnapshot: string;
  monthlyAmount: number;
}

export type AdesaoKind =
  /** Nada no caminho: grava direto. */
  | { kind: "NOVO" }
  /** Começa no fim (ou depois) do contrato vigente: grava direto, sem perguntar. */
  | { kind: "RENOVACAO"; previous: ExistingContract }
  /** Começa no meio do contrato vigente: exige confirmação e perfil. */
  | { kind: "TROCA"; current: ExistingContract }
  /** Caminho impedido, com o motivo pronto para a tela. */
  | { kind: "BLOQUEADO"; reason: string; blocking?: ExistingContract };

/**
 * Decide o que a adesão significa diante dos contratos ATIVOS da cliente.
 *
 * O caso que a spec original não cobria: a cliente pode ter DOIS contratos
 * ativos ao mesmo tempo, porque a renovação pode ser cadastrada antes de o
 * atual acabar. Se chega uma troca com início anterior ao começo da renovação,
 * não há resposta boa — encerrar a renovação em cascata apagaria em silêncio um
 * contrato que alguém cadastrou de propósito. Então bloqueia e manda cancelar.
 */
export function classifyAdesao(args: {
  start: Date;
  actives: ExistingContract[];
}): AdesaoKind {
  const { start } = args;

  // Contrato que COBRE a data de início da nova adesão.
  const vigente = args.actives.find(
    (c) =>
      c.startDate.getTime() <= start.getTime() &&
      start.getTime() < effectiveEnd(c).getTime(),
  );

  // Contrato que começa DEPOIS da nova adesão (renovação já agendada).
  const futuro = args.actives
    .filter((c) => c.startDate.getTime() > start.getTime())
    .sort((a, b) => a.startDate.getTime() - b.startDate.getTime())[0];

  if (futuro) {
    return {
      kind: "BLOQUEADO",
      blocking: futuro,
      reason:
        `A cliente já tem um Select com início em ${formatDayBR(futuro.startDate)} ` +
        `(${futuro.planNameSnapshot}). Cancele-o antes de registrar um Select que comece antes dessa data.`,
    };
  }

  if (!vigente) {
    // Pode haver ativos que já terminaram antes desta data: é renovação.
    const anterior = args.actives
      .filter((c) => effectiveEnd(c).getTime() <= start.getTime())
      .sort((a, b) => effectiveEnd(b).getTime() - effectiveEnd(a).getTime())[0];
    return anterior ? { kind: "RENOVACAO", previous: anterior } : { kind: "NOVO" };
  }

  // Início igual ou anterior ao do vigente não é troca: é correção de cadastro,
  // e correção se faz cancelando o errado (regra 4.6), não empilhando contrato.
  if (start.getTime() <= vigente.startDate.getTime()) {
    return {
      kind: "BLOQUEADO",
      blocking: vigente,
      reason:
        `O Select vigente (${vigente.planNameSnapshot}) começa em ${formatDayBR(vigente.startDate)}. ` +
        `Para trocar, o novo precisa começar depois dessa data — se o objetivo é corrigir o contrato, cancele-o e cadastre outro.`,
    };
  }

  return { kind: "TROCA", current: vigente };
}

// ---------------------------------------------------------------------------
// Ciclo mensal (acompanhamento do mínimo de compras)
// ---------------------------------------------------------------------------

export interface CycleWindow {
  /** 1 = primeiro mês do contrato. */
  index: number;
  /** Inclusivo. */
  from: Date;
  /** Exclusivo. */
  to: Date;
}

/**
 * Ciclo mensal do contrato que contém `reference`.
 *
 * O mínimo de compras é contratual, e o contrato começa no dia do início — não
 * no dia 1º. Um Select que começa dia 15 conta de 15 a 14 do mês seguinte.
 * Fora da vigência, devolve null.
 */
export function cycleWindowFor(
  contract: { startDate: Date; endDate: Date; closedAt?: Date | null },
  reference: Date = dayUTC(),
): CycleWindow | null {
  const fim = effectiveEnd(contract);
  if (reference.getTime() < contract.startDate.getTime()) return null;
  if (reference.getTime() >= fim.getTime()) return null;

  // Estimativa pela diferença de meses, depois ajuste de no máximo um passo —
  // o recuo de último dia do mês pode deslocar a conta em um.
  const bruto =
    (reference.getUTCFullYear() - contract.startDate.getUTCFullYear()) * 12 +
    (reference.getUTCMonth() - contract.startDate.getUTCMonth());
  let k = bruto;
  while (k > 0 && addMonthsClamped(contract.startDate, k).getTime() > reference.getTime()) k--;
  while (addMonthsClamped(contract.startDate, k + 1).getTime() <= reference.getTime()) k++;

  const from = addMonthsClamped(contract.startDate, k);
  const to = addMonthsClamped(contract.startDate, k + 1);
  return { index: k + 1, from, to: to.getTime() > fim.getTime() ? fim : to };
}

/** Arredonda para centavos. Evita 0.1 + 0.2 aparecendo como R$ 0,30000000004. */
export function money(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// ---------------------------------------------------------------------------
// Build.Sales
// ---------------------------------------------------------------------------

/**
 * Mensalidade do Build.Sales, embutida na mensalidade de TODO plano Select.
 *
 * `SelectPlan.monthlyAmount` guarda o valor BASE do plano, SEM esta parcela —
 * quem ler a tabela direto precisa saber disso. A soma acontece uma única vez,
 * em `resolveValues`, e vale igual para os quatro planos: nos três de tabela
 * sobre o valor cadastrado, e no negociado sobre o valor digitado na adesão.
 *
 * Por que uma constante e não uma coluna por plano: é o mesmo serviço, pelo
 * mesmo preço, nos quatro. Quatro colunas convidariam os quatro a divergirem,
 * e um reajuste do Build.Sales teria de ser lembrado em quatro lugares.
 *
 * O valor NÃO aparece na lista de benefícios: ele está incorporado à
 * mensalidade, e exibi-lo ali sugeria uma cobrança à parte que não existe.
 */
export const BUILD_SALES_MONTHLY = 67;

/** Mensalidade final da adesão: base do plano (ou negociada) + Build.Sales. */
export function monthlyWithBuildSales(base: number): number {
  return money(base + BUILD_SALES_MONTHLY);
}

// ---------------------------------------------------------------------------
// Rateio de pagamento (adiantamento em cascata)
// ---------------------------------------------------------------------------

export interface AllocationTarget {
  id: string;
  number: number;
  amount: number;
  paidAmount: number;
  status: "PENDENTE" | "PAGA" | "CANCELADA";
}

export interface PaymentAllocation {
  installmentId: string;
  number: number;
  amount: number;
}

export interface AllocationResult {
  allocations: PaymentAllocation[];
  /** O que sobrou depois de encher todas as parcelas em aberto à frente. */
  leftover: number;
  /** Teto aceitável neste lançamento (soma dos saldos alcançáveis). */
  capacity: number;
}

/**
 * Distribui um pagamento a partir de uma parcela, derramando o excedente nas
 * seguintes — a cliente que paga R$ 700 numa mensalidade de R$ 500 adianta
 * R$ 200 da próxima.
 *
 * A cascata anda SÓ PARA A FRENTE, a partir da parcela escolhida. Parcelas
 * anteriores em aberto não são tocadas mesmo que existam: quem registra
 * escolheu aquela parcela de propósito, e deixar o dinheiro pular para trás
 * sozinho tiraria dele o controle do que acabou de lançar.
 *
 * Parcela cancelada e parcela já quitada são puladas (saldo zero).
 *
 * `leftover > 0` significa que o valor passa do que há para cobrar: quem chama
 * recusa o lançamento inteiro em vez de gravar um pedaço.
 */
export function allocatePayment(args: {
  amount: number;
  targetId: string;
  installments: AllocationTarget[];
}): AllocationResult {
  const alvo = args.installments.find((i) => i.id === args.targetId);
  const saldo = (i: AllocationTarget) =>
    i.status === "CANCELADA" ? 0 : Math.max(0, money(i.amount - i.paidAmount));

  const fila = alvo
    ? [
        alvo,
        ...args.installments
          .filter((i) => i.number > alvo.number)
          .sort((a, b) => a.number - b.number),
      ].filter((i) => saldo(i) > 0)
    : [];

  const capacity = money(fila.reduce((s, i) => s + saldo(i), 0));

  let resto = money(args.amount);
  const allocations: PaymentAllocation[] = [];
  for (const parcela of fila) {
    if (resto <= 0) break;
    const aplicado = money(Math.min(resto, saldo(parcela)));
    if (aplicado <= 0) continue;
    allocations.push({ installmentId: parcela.id, number: parcela.number, amount: aplicado });
    resto = money(resto - aplicado);
  }

  return { allocations, leftover: resto, capacity };
}

// ---------------------------------------------------------------------------
// Responsável pela venda
// ---------------------------------------------------------------------------

export interface ResponsibleCandidate {
  id: string;
  role: string;
  active: boolean;
}

/**
 * Decide qual usuário fica como responsável por uma adesão.
 *
 * Esta função existe porque o responsável DEIXOU de sair da sessão: Gestão e
 * Financeiro agora escolhem um vendedor, e a escolha chega pelo navegador.
 * Todo valor que vem do navegador é suspeito, e aqui está a regra inteira —
 * pura, sem banco, para poder ser coberta por checagem.
 *
 * Duas regras, nesta ordem:
 *
 * 1. **Quem é de VENDAS não escolhe.** O responsável é o próprio usuário, e um
 *    `chosenId` enviado no payload é IGNORADO, não recusado. Ignorar em vez de
 *    recusar é de propósito: a tela de Vendas não manda o campo, então um id
 *    chegando ali só pode vir de requisição forjada — e a resposta certa a ela
 *    é gravar a venda no nome de quem está logado, não devolver uma pista.
 *
 * 2. **Gestão e Financeiro escolhem, obrigatoriamente, um vendedor ATIVO.**
 *    Eles próprios não são elegíveis: o perfil deles não é VENDAS, e a regra é
 *    que todo Select pertença a um vendedor.
 *
 * O id devolvido é o da LINHA CARREGADA do banco, nunca o texto recebido. Se os
 * dois divergirem, quem chamou leu o usuário errado e nada é gravado.
 */
export function resolveResponsibleId(args: {
  actorRole: string;
  actorId: string;
  /** O que o navegador mandou. Ausente quando o ator é de Vendas. */
  chosenId?: string;
  /** A linha do banco correspondente a `chosenId`; null se não existe. */
  chosen?: ResponsibleCandidate | null;
}): { responsibleId: string } | { error: string } {
  if (args.actorRole === "VENDAS") {
    return { responsibleId: args.actorId };
  }

  const pedido = (args.chosenId ?? "").trim();
  if (!pedido) {
    return { error: "Selecione o responsável pela venda." };
  }

  const linha = args.chosen ?? null;
  if (!linha || linha.id !== pedido) {
    return { error: "O responsável selecionado não existe." };
  }
  if (!linha.active) {
    return { error: "O responsável selecionado está inativo." };
  }
  if (linha.role !== "VENDAS") {
    return { error: "O responsável tem de ser um usuário de Vendas." };
  }

  return { responsibleId: linha.id };
}

// ---------------------------------------------------------------------------
// Valor digitado
// ---------------------------------------------------------------------------

/**
 * Lê um valor em dinheiro digitado por gente.
 *
 * Mora aqui, e não dentro de uma action, porque três lugares precisam dele
 * (adesão, pagamento e cadastro de plano) e três cópias acabariam divergindo
 * em qual formato aceitam — com a Gestão cadastrando um valor que a adesão lê
 * diferente.
 *
 * As regras, nesta ordem:
 *
 * 1. **Ponto e vírgula juntos** → pt-BR: ponto é milhar, vírgula é decimal.
 *    `"1.297,50"` → 1297.5
 * 2. **Só vírgula** → decimal. `"797,50"` → 797.5
 * 3. **Só ponto** → ambíguo, e é onde estava um defeito de 100×: a versão
 *    anterior apagava TODO ponto, e `"1297.50"` virava 129750 — alguém
 *    registrava R$ 79.750 pensando ter digitado R$ 797,50, sem aviso nenhum.
 *    O desempate é pelo número de casas depois do último ponto: **1 ou 2 casas
 *    é decimal** (`"797.5"` → 797.5), **3 casas é milhar** (`"1.297"` → 1297,
 *    `"10.500"` → 10500). Três casas decimais não existem em dinheiro, e a
 *    leitura pt-BR de `1.297` é mil duzentos e noventa e sete.
 * 4. Mais de um ponto → todos são milhar. `"1.297.500"` → 1297500
 */
export function parseMoney(raw: string | undefined): number | null {
  if (raw == null) return null;
  const limpo = raw.trim().replace(/\s/g, "");
  if (!limpo) return null;

  let normalizado: string;
  if (limpo.includes(",")) {
    // Vírgula presente: ela é o decimal, e todo ponto é milhar.
    normalizado = limpo.replace(/\./g, "").replace(",", ".");
  } else {
    const pontos = limpo.split(".").length - 1;
    const casas = pontos === 1 ? limpo.length - limpo.lastIndexOf(".") - 1 : 0;
    // Um ponto só, com 1 ou 2 dígitos depois: é decimal, preserva.
    normalizado = pontos === 1 && (casas === 1 || casas === 2)
      ? limpo
      : limpo.replace(/\./g, "");
  }

  if (!/^-?\d*\.?\d+$/.test(normalizado)) return null;
  const n = Number(normalizado);
  return Number.isFinite(n) ? n : null;
}

// ---------------------------------------------------------------------------
// Cadastro de plano
// ---------------------------------------------------------------------------

/** Teto do nome do plano. RECUSA o excesso: o nome vira `planNameSnapshot`. */
export const MAX_PLAN_NAME = 120;
/** Teto de cada valor, igual ao da adesão (a coluna é DECIMAL(10,2)). */
const MAX_PLAN_VALUE = 9_999_999;

export interface PlanFormInput {
  name: string;
  /** true: validade, mensalidade e mínimo são digitados em cada adesão. */
  editableValues: boolean;
  validityMonths: string;
  /** Mensalidade BASE, SEM o Build.Sales. */
  monthlyAmount: string;
  minMonthlyPurchase: string;
}

export interface ResolvedPlan {
  name: string;
  editableValues: boolean;
  validityMonths: number;
  /** null no plano negociado: não existe valor de tabela a guardar. */
  monthlyAmount: number | null;
  minMonthlyPurchase: number | null;
}

/**
 * Valida o cadastro de um plano e devolve o que vai ao banco.
 *
 * Por que é uma função própria, e pura: um plano gravado sem valores APARECE na
 * lista do Novo Select e só falha quando alguém clica em Revisar — "O plano não
 * tem valores cadastrados", com o formulário todo preenchido. Os limites daqui
 * são deliberadamente os MESMOS de `resolveValues`; se divergirem, a Gestão
 * cadastra um plano que a adesão recusa.
 *
 * O par (negociado × valores) é decidido junto, nunca em metade:
 *
 * - **Negociado** (`editableValues`): mensalidade e mínimo gravam NULOS, mesmo
 *   que a tela mande números. Guardar um valor de tabela num plano que não tem
 *   tabela deixaria no banco um número que ninguém usa e todo mundo acredita.
 * - **De tabela**: os dois são obrigatórios e positivos.
 *
 * A VALIDADE é obrigatória nos dois casos — no negociado ela é o padrão
 * sugerido na adesão, e a coluna do banco não aceita nulo.
 *
 * A mensalidade é a BASE, sem o Build.Sales: quem cadastra 597 faz a cliente
 * pagar 664. Ver BUILD_SALES_MONTHLY.
 */
export function resolvePlanForm(
  input: PlanFormInput,
): { plan: ResolvedPlan } | { error: string } {
  const name = input.name.trim();
  if (!name) return { error: "Informe o nome do plano." };
  if (name.length > MAX_PLAN_NAME) {
    return { error: `Nome do plano muito longo (máx. ${MAX_PLAN_NAME} caracteres).` };
  }

  const v = Number(input.validityMonths.trim());
  if (!Number.isInteger(v) || v < 1 || v > 120) {
    return { error: "Validade inválida (de 1 a 120 meses)." };
  }

  if (input.editableValues) {
    return {
      plan: {
        name,
        editableValues: true,
        validityMonths: v,
        monthlyAmount: null,
        minMonthlyPurchase: null,
      },
    };
  }

  const mensal = parseMoney(input.monthlyAmount);
  const minimo = parseMoney(input.minMonthlyPurchase);
  if (mensal == null || mensal <= 0) {
    return { error: "Informe a mensalidade (maior que zero)." };
  }
  if (minimo == null || minimo <= 0) {
    return { error: "Informe o mínimo de compras mensal (maior que zero)." };
  }
  if (mensal > MAX_PLAN_VALUE || minimo > MAX_PLAN_VALUE) {
    return { error: "Valor acima do limite permitido." };
  }

  return {
    plan: {
      name,
      editableValues: false,
      validityMonths: v,
      monthlyAmount: money(mensal),
      minMonthlyPurchase: money(minimo),
    },
  };
}
