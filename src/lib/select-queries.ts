import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isDoacao } from "@/lib/validations/order";
import {
  dayUTC,
  effectiveEnd,
  contractState,
  installmentState,
  cycleWindowFor,
  addMonthsClamped,
  money,
  type ContractState,
  type InstallmentState,
  type CycleWindow,
} from "@/lib/select-contract";

/**
 * SELECT — leitura para a ferramenta do Financeiro.
 *
 * Só consultas: nada aqui escreve. Os estados VENCIDA, PARCIAL, ENCERRADO e
 * AGENDADO não existem como coluna, então a filtragem por eles é traduzida
 * para condições de data — ver `stateWhere` e `financialWhere`.
 */

export type FinancialSituation = "EM_DIA" | "VENCIDAS" | "QUITADO";

export interface SelectListFilters {
  q?: string;
  planId?: string;
  state?: ContractState;
  responsibleId?: string;
  startFrom?: string;
  startTo?: string;
  financial?: FinancialSituation;
  page?: number;
}

export const SELECT_PAGE_SIZE = 10;

/**
 * Traduz o estado DERIVADO para condições de banco.
 *
 * ENCERRADO é o caso que exige cuidado: um contrato que alcançou o fim
 * continua gravado como ATIVO (não há rotina que o vire), então filtrar por
 * `status = ENCERRADO` esconderia justamente os que acabaram sozinhos.
 */
function stateWhere(state: ContractState, hoje: Date): Prisma.SelectContractWhereInput {
  switch (state) {
    case "CANCELADO":
      return { status: "CANCELADO" };
    case "ENCERRADO":
      return {
        OR: [
          { status: "ENCERRADO" },
          { status: "ATIVO", closedAt: { lte: hoje } },
          { status: "ATIVO", closedAt: null, endDate: { lte: hoje } },
        ],
      };
    case "AGENDADO":
      return { status: "ATIVO", startDate: { gt: hoje } };
    case "ATIVO":
      return {
        status: "ATIVO",
        startDate: { lte: hoje },
        OR: [{ closedAt: { gt: hoje } }, { closedAt: null, endDate: { gt: hoje } }],
      };
  }
}

function financialWhere(f: FinancialSituation, hoje: Date): Prisma.SelectContractWhereInput {
  switch (f) {
    case "VENCIDAS":
      return { installments: { some: { status: "PENDENTE", dueDate: { lt: hoje } } } };
    case "QUITADO":
      return { installments: { none: { status: "PENDENTE" } } };
    case "EM_DIA":
      return {
        installments: {
          some: { status: "PENDENTE" },
          none: { status: "PENDENTE", dueDate: { lt: hoje } },
        },
      };
  }
}

export function buildSelectWhere(f: SelectListFilters, hoje: Date): Prisma.SelectContractWhereInput {
  const and: Prisma.SelectContractWhereInput[] = [];

  const q = f.q?.trim();
  if (q) {
    and.push({
      customer: {
        OR: [
          { code: { contains: q, mode: "insensitive" } },
          { name: { contains: q, mode: "insensitive" } },
        ],
      },
    });
  }
  if (f.planId) and.push({ planId: f.planId });
  if (f.responsibleId) and.push({ responsibleId: f.responsibleId });
  if (f.state) and.push(stateWhere(f.state, hoje));
  if (f.financial) and.push(financialWhere(f.financial, hoje));
  if (f.startFrom) and.push({ startDate: { gte: new Date(`${f.startFrom}T00:00:00.000Z`) } });
  if (f.startTo) and.push({ startDate: { lte: new Date(`${f.startTo}T00:00:00.000Z`) } });

  return and.length ? { AND: and } : {};
}

// ---------------------------------------------------------------------------
// Listagem
// ---------------------------------------------------------------------------

export interface SelectListRow {
  id: string;
  customerCode: string;
  customerName: string;
  planName: string;
  responsibleName: string;
  startDate: string;
  endDate: string;
  closedAt: string | null;
  monthlyAmount: number;
  state: ContractState;
  paidInstallments: number;
  totalInstallments: number;
  openAmount: number;
  overdueAmount: number;
}

export interface SelectIndicators {
  /** Soma de mensalidade × validade. O valor dos contratos. */
  contractedAmount: number;
  /** Soma das parcelas geradas e não canceladas. Difere do acima em contrato retroativo. */
  billableAmount: number;
  receivedAmount: number;
  openAmount: number;
  overdueAmount: number;
  count: number;
}

export async function listSelectContracts(f: SelectListFilters): Promise<{
  rows: SelectListRow[];
  indicators: SelectIndicators;
  page: number;
  totalPages: number;
  total: number;
}> {
  const hoje = dayUTC();
  const where = buildSelectWhere(f, hoje);
  const page = Math.max(1, f.page ?? 1);

  const total = await prisma.selectContract.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / SELECT_PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);

  const contratos = await prisma.selectContract.findMany({
    where,
    include: {
      customer: { select: { code: true, name: true } },
      responsible: { select: { name: true } },
      // No máximo `validade` linhas por contrato (12 nos planos atuais): cabe
      // na página sem uma segunda viagem ao banco por contrato.
      installments: { select: { status: true, dueDate: true, amount: true, paidAmount: true } },
    },
    orderBy: { createdAt: "desc" },
    skip: (pageSafe - 1) * SELECT_PAGE_SIZE,
    take: SELECT_PAGE_SIZE,
  });

  const rows: SelectListRow[] = contratos.map((c) => {
    const vivas = c.installments.filter((i) => i.status !== "CANCELADA");
    const aberto = vivas.reduce((s, i) => s + (Number(i.amount) - Number(i.paidAmount)), 0);
    const vencido = c.installments
      .filter((i) => i.status === "PENDENTE" && i.dueDate.getTime() < hoje.getTime())
      .reduce((s, i) => s + (Number(i.amount) - Number(i.paidAmount)), 0);
    return {
      id: c.id,
      customerCode: c.customer.code,
      customerName: c.customer.name,
      planName: c.planNameSnapshot,
      responsibleName: c.responsible.name,
      startDate: c.startDate.toISOString(),
      endDate: c.endDate.toISOString(),
      closedAt: c.closedAt ? c.closedAt.toISOString() : null,
      monthlyAmount: Number(c.monthlyAmount),
      state: contractState(c, hoje),
      paidInstallments: c.installments.filter((i) => i.status === "PAGA").length,
      totalInstallments: vivas.length,
      openAmount: money(aberto),
      overdueAmount: money(vencido),
    };
  });

  // Indicadores: sobre TODO o conjunto filtrado, não só a página — o topo da
  // tela responde "quanto há no filtro", e paginar não muda essa resposta.
  const [contratado, parcelas, vencidas] = await Promise.all([
    prisma.selectContract.aggregate({ where, _sum: { totalAmount: true } }),
    prisma.selectInstallment.aggregate({
      where: { contract: where, status: { not: "CANCELADA" } },
      _sum: { amount: true, paidAmount: true },
    }),
    prisma.selectInstallment.aggregate({
      where: { contract: where, status: "PENDENTE", dueDate: { lt: hoje } },
      _sum: { amount: true, paidAmount: true },
    }),
  ]);

  const cobravel = Number(parcelas._sum.amount ?? 0);
  const recebido = Number(parcelas._sum.paidAmount ?? 0);
  const vencidoTotal = Number(vencidas._sum.amount ?? 0) - Number(vencidas._sum.paidAmount ?? 0);

  return {
    rows,
    indicators: {
      contractedAmount: money(Number(contratado._sum.totalAmount ?? 0)),
      billableAmount: money(cobravel),
      receivedAmount: money(recebido),
      openAmount: money(cobravel - recebido),
      overdueAmount: money(vencidoTotal),
      count: total,
    },
    page: pageSafe,
    totalPages,
    total,
  };
}

// ---------------------------------------------------------------------------
// Detalhe
// ---------------------------------------------------------------------------

export interface SelectPaymentRow {
  id: string;
  paidAt: string;
  amount: number;
  methodName: string | null;
  bankName: string | null;
  cnpjName: string | null;
  proofPath: string | null;
  note: string | null;
  /** Preenchido quando este pagamento é um pedaço de um lançamento que cobriu
   *  mais de uma parcela (adiantamento em cascata). */
  batchId: string | null;
  reversedAt: string | null;
  reversalReason: string | null;
}

export interface SelectInstallmentRow {
  id: string;
  number: number;
  dueDate: string;
  amount: number;
  paidAmount: number;
  state: InstallmentState;
  settledAt: string | null;
  note: string | null;
  payments: SelectPaymentRow[];
}

export interface PurchaseCycle {
  index: number;
  from: string;
  to: string;
  purchased: number;
  minimum: number;
  current: boolean;
}

export interface SelectDetail {
  id: string;
  customerId: string;
  customerCode: string;
  customerName: string;
  planName: string;
  responsibleName: string;
  startDate: string;
  endDate: string;
  closedAt: string | null;
  validityMonths: number;
  monthlyAmount: number;
  totalAmount: number;
  billableAmount: number;
  minMonthlyPurchase: number;
  state: ContractState;
  canceledAt: string | null;
  cancelReason: string | null;
  createdAt: string;
  /** Contrato que este substituiu, e o que substituiu este. */
  replaces: { id: string; planName: string; startDate: string } | null;
  replacedBy: { id: string; planName: string; startDate: string } | null;
  /** Pago referente a período posterior ao encerramento por troca (decisão 3). */
  paidBeyondClosure: number;
  installments: SelectInstallmentRow[];
  cycles: PurchaseCycle[];
}

export async function getSelectDetail(id: string): Promise<SelectDetail | null> {
  const hoje = dayUTC();
  const c = await prisma.selectContract.findUnique({
    where: { id },
    include: {
      customer: { select: { id: true, code: true, name: true } },
      responsible: { select: { name: true } },
      replaces: { select: { id: true, planNameSnapshot: true, startDate: true } },
      replacedBy: { select: { id: true, planNameSnapshot: true, startDate: true } },
      installments: {
        orderBy: { number: "asc" },
        include: {
          payments: {
            orderBy: { createdAt: "asc" },
            include: {
              paymentMethod: { select: { name: true } },
              bank: { select: { name: true } },
              cnpj: { select: { name: true } },
            },
          },
        },
      },
    },
  });
  if (!c) return null;

  const installments: SelectInstallmentRow[] = c.installments.map((i) => ({
    id: i.id,
    number: i.number,
    dueDate: i.dueDate.toISOString(),
    amount: Number(i.amount),
    paidAmount: Number(i.paidAmount),
    state: installmentState(
      { status: i.status, amount: Number(i.amount), paidAmount: Number(i.paidAmount), dueDate: i.dueDate },
      hoje,
    ),
    settledAt: i.settledAt ? i.settledAt.toISOString() : null,
    note: i.note,
    payments: i.payments.map((p) => ({
      id: p.id,
      paidAt: p.paidAt.toISOString(),
      amount: Number(p.amount),
      methodName: p.paymentMethod?.name ?? null,
      bankName: p.bank?.name ?? null,
      cnpjName: p.cnpj?.name ?? null,
      proofPath: p.proofPath,
      note: p.note,
      batchId: p.batchId,
      reversedAt: p.reversedAt ? p.reversedAt.toISOString() : null,
      reversalReason: p.reversalReason,
    })),
  }));

  // Aviso da troca: quanto já foi pago de parcelas cujo vencimento cai depois
  // do encerramento antecipado. Nada é estornado automaticamente — o número
  // existe para o Financeiro decidir por fora.
  const paidBeyondClosure = c.closedAt
    ? money(
        c.installments
          .filter((i) => i.dueDate.getTime() >= c.closedAt!.getTime())
          .reduce((s, i) => s + Number(i.paidAmount), 0),
      )
    : 0;

  return {
    id: c.id,
    customerId: c.customer.id,
    customerCode: c.customer.code,
    customerName: c.customer.name,
    planName: c.planNameSnapshot,
    responsibleName: c.responsible.name,
    startDate: c.startDate.toISOString(),
    endDate: c.endDate.toISOString(),
    closedAt: c.closedAt ? c.closedAt.toISOString() : null,
    validityMonths: c.validityMonths,
    monthlyAmount: Number(c.monthlyAmount),
    totalAmount: Number(c.totalAmount),
    billableAmount: money(
      c.installments.filter((i) => i.status !== "CANCELADA").reduce((s, i) => s + Number(i.amount), 0),
    ),
    minMonthlyPurchase: Number(c.minMonthlyPurchase),
    state: contractState(c, hoje),
    canceledAt: c.canceledAt ? c.canceledAt.toISOString() : null,
    cancelReason: c.cancelReason,
    createdAt: c.createdAt.toISOString(),
    replaces: c.replaces
      ? { id: c.replaces.id, planName: c.replaces.planNameSnapshot, startDate: c.replaces.startDate.toISOString() }
      : null,
    replacedBy: c.replacedBy
      ? { id: c.replacedBy.id, planName: c.replacedBy.planNameSnapshot, startDate: c.replacedBy.startDate.toISOString() }
      : null,
    paidBeyondClosure,
    installments,
    cycles: await purchaseCycles(c, hoje),
  };
}

// ---------------------------------------------------------------------------
// Mínimo de compras: o quanto a cliente comprou em cada ciclo do contrato
// ---------------------------------------------------------------------------

/**
 * Tipos de pedido que NÃO contam como compra. Doação passa pelo Financeiro e
 * é aprovada sem pagamento, sem CNPJ e sem comprovante — contá-la como compra
 * faria o mínimo ser batido por um pedido que ninguém pagou.
 */
async function nonPurchaseOrderTypeIds(): Promise<string[]> {
  const tipos = await prisma.orderType.findMany({ select: { id: true, name: true } });
  return tipos.filter((t) => isDoacao(t.name)).map((t) => t.id);
}

/**
 * Compras da cliente num intervalo, pela régua do mínimo de compras:
 *
 *  - só pedidos APROVADOS pelo Financeiro (`financeApprovedAt` preenchido), e
 *    contados no ciclo da APROVAÇÃO, não no da criação;
 *  - `orderValue`, sem frete — frete é custo logístico, não compra;
 *  - fora os estornados e cancelados: venda desfeita não é compra;
 *  - menos as devoluções desses pedidos.
 */
export async function purchasesInWindow(args: {
  customerId: string;
  from: Date;
  to: Date;
  excludeOrderTypeIds?: string[];
}): Promise<number> {
  const excluir = args.excludeOrderTypeIds ?? (await nonPurchaseOrderTypeIds());

  const where: Prisma.OrderWhereInput = {
    customerId: args.customerId,
    financeApprovedAt: { gte: args.from, lt: args.to },
    status: { notIn: ["ESTORNO", "ESTORNO_PARCIAL", "CANCELADO"] },
    ...(excluir.length ? { orderTypeId: { notIn: excluir } } : {}),
  };

  const [compras, devolucoes] = await Promise.all([
    prisma.order.aggregate({ where, _sum: { orderValue: true } }),
    prisma.orderReturn.aggregate({ where: { order: where }, _sum: { totalValue: true } }),
  ]);

  const bruto = Number(compras._sum.orderValue ?? 0);
  const devolvido = Number(devolucoes._sum.totalValue ?? 0);
  return money(Math.max(0, bruto - devolvido));
}

/** Um registro por ciclo mensal já iniciado do contrato. */
async function purchaseCycles(
  c: { customerId: string; startDate: Date; endDate: Date; closedAt: Date | null; minMonthlyPurchase: Prisma.Decimal; validityMonths: number },
  hoje: Date,
): Promise<PurchaseCycle[]> {
  const atual = cycleWindowFor(c, hoje);
  // Contrato que ainda não começou não tem ciclo; o encerrado tem todos.
  const ultimoIndice = atual
    ? atual.index
    : hoje.getTime() >= effectiveEnd(c).getTime()
      ? (cycleWindowFor(c, new Date(effectiveEnd(c).getTime() - 86400000))?.index ?? 0)
      : 0;
  if (ultimoIndice < 1) return [];

  const excluir = await nonPurchaseOrderTypeIds();
  const minimo = Number(c.minMonthlyPurchase);

  // Um ciclo por mês já iniciado. O primeiro dia de cada ciclo é a própria
  // soma de meses sobre o início, então ele serve de referência para pedir a
  // janela — e o recuo de mês curto vem junto, de graça.
  const janelas: CycleWindow[] = [];
  for (let k = 0; k < ultimoIndice; k++) {
    const w = cycleWindowFor(c, addMonthsClamped(c.startDate, k));
    if (w) janelas.push(w);
  }

  return Promise.all(
    janelas.map(async (w) => ({
      index: w.index,
      from: w.from.toISOString(),
      to: w.to.toISOString(),
      purchased: await purchasesInWindow({
        customerId: c.customerId,
        from: w.from,
        to: w.to,
        excludeOrderTypeIds: excluir,
      }),
      minimum: minimo,
      current: atual?.index === w.index,
    })),
  );
}
