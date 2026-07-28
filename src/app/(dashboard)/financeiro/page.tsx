import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { formatBRL } from "@/lib/utils";
import { FinanceiroFerramentas } from "./ferramentas-client";
import { AnaliseKanban, type FinanceCard } from "./analise-kanban";
import { PENDING_PAYMENT_STATUS_NAME, PAYMENT_CONFIRMED_NOTE } from "@/lib/finance-constants";

// Janela em que um pedido processado permanece visivel na coluna "Processado".
const PROCESSED_WINDOW_MIN = 15;

export default async function FinanceiroPage() {
  await requireRole(["FINANCEIRO", "GESTAO"]);

  const desde = new Date(Date.now() - PROCESSED_WINDOW_MIN * 60 * 1000);

  const [emAnalise, payStatuses, paymentMethods, banks, cnpjs, processadosHist, pagPendentes] =
    await Promise.all([
      // PENDENTES: aguardando analise. Mais antigos no topo.
      prisma.order.findMany({
        where: { status: "EM_ANALISE" },
        include: {
          customer: true, seller: true, cnpj: true,
          originStore: { select: { simplifiedFlow: true } },
          paymentProofs: { orderBy: { createdAt: "asc" }, select: { id: true, filePath: true } },
          _count: { select: { financeProofs: true } },
          financeProofs: { orderBy: { createdAt: "asc" }, select: { id: true, filePath: true } },
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.paymentStatusOption.findMany({ orderBy: { name: "asc" } }),
      prisma.paymentMethod.findMany({ orderBy: { name: "asc" } }),
      prisma.bank.findMany({ orderBy: { name: "asc" } }),
      prisma.cnpj.findMany({ orderBy: { name: "asc" } }),
      // PROCESSADOS: entradas de historico dos ultimos 15 min que representam a
      // SAIDA de EM_ANALISE (aprovacao ou interrupcao). Traz o pedido junto.
      prisma.orderStatusHistory.findMany({
        where: {
          createdAt: { gte: desde },
          status: { in: ["AGUARDANDO_IMPRESSAO", "ESTORNO", "ESTORNO_PARCIAL", "CANCELADO"] },
        },
        include: { order: { include: { customer: true, seller: true } } },
        orderBy: { createdAt: "desc" },
      }),
      // PAGAMENTO PENDENTE: pedidos aprovados cujo status de pagamento atual e
      // "Liberado (Pendente)" e que ainda NAO possuem o marcador de confirmacao.
      // O pedido ja segue o fluxo normal; aqui e apenas a fila de confirmacao.
      prisma.order.findMany({
        where: {
          paymentStatus: { name: PENDING_PAYMENT_STATUS_NAME },
          history: { none: { note: PAYMENT_CONFIRMED_NOTE } },
          status: { notIn: ["CANCELADO", "ESTORNO", "ESTORNO_PARCIAL"] },
        },
        include: { customer: true, seller: true },
        orderBy: { createdAt: "asc" },
      }),
    ]);

  const statusAtivos = payStatuses
    .filter((p) => p.active)
    .map((p) => ({ id: p.id, name: p.name, disposition: p.disposition }));
  const cnpjsAtivos = cnpjs
    .filter((c) => c.active)
    .map((c) => ({ id: c.id, name: c.name, document: c.document }));
  const formasAtivas = paymentMethods
    .filter((p) => p.active)
    .map((p) => ({ id: p.id, name: p.name }));
  const bancosAtivos = banks
    .filter((b) => b.active)
    .map((b) => ({ id: b.id, name: b.name }));

  // Cartoes da coluna PENDENTE.
  const pendentes: FinanceCard[] = emAnalise.map((o) => ({
    id: o.id,
    orderNumber: o.orderNumber,
    comandaNumber: o.comandaNumber,
    customerName: o.customer.name,
    sellerName: o.seller.name,
    total: formatBRL(o.total.toString()),
    createdAt: o.createdAt.toISOString(),
    // Dados que o modal de auditoria precisa:
    currentCnpjId: o.cnpjId,
    currentPaymentMethodId: o.paymentMethodId,
    currentBankId: o.bankId,
    proof2Count: o._count.financeProofs,
    proof2List: o.financeProofs.map((p) => ({ id: p.id, filePath: p.filePath })),
    // Fluxo simplificado (Loja de Origem): muda o modal para so comprovante + Pago.
    simplifiedFlow: o.originStore?.simplifiedFlow === true,
    paymentProofList: o.paymentProofs.map((p) => ({ id: p.id, filePath: p.filePath })),
    // Observacoes: envio (discreta) + pagamento (destaque, so aqui).
    shippingNotes: o.notes,
    paymentNotes: o.paymentNotes,
    processedAt: null,
    outcome: null,
    // Pendencia ativa = tem texto e ainda nao foi resolvida por Vendas.
    hasActiveIssue: o.financeIssue != null && o.financeIssueResolvedAt == null,
  }));

  // Cartoes da coluna PROCESSADO. Uma entrada por pedido (a mais recente).
  const vistos = new Set<string>();
  const processados: FinanceCard[] = [];
  for (const h of processadosHist) {
    if (vistos.has(h.orderId)) continue;
    vistos.add(h.orderId);
    const o = h.order;
    const aprovado = h.status === "AGUARDANDO_IMPRESSAO";
    processados.push({
      id: o.id,
      orderNumber: o.orderNumber,
      comandaNumber: o.comandaNumber,
      customerName: o.customer.name,
      sellerName: o.seller.name,
      total: formatBRL(o.total.toString()),
      createdAt: o.createdAt.toISOString(),
      currentCnpjId: o.cnpjId,
      currentPaymentMethodId: o.paymentMethodId,
      currentBankId: o.bankId,
      proof2Count: 0,
      proof2List: [],
      simplifiedFlow: false,
      paymentProofList: [],
      shippingNotes: o.notes,
      // paymentNotes NAO e exposto fora da coluna Pendente.
      paymentNotes: null,
      processedAt: h.createdAt.toISOString(),
      outcome: aprovado ? "APROVADO" : "INTERROMPIDO",
      hasActiveIssue: false,
    });
  }

  // Cartoes da coluna PAGAMENTO PENDENTE.
  const pagPendentesCards: FinanceCard[] = pagPendentes.map((o) => ({
    id: o.id,
    orderNumber: o.orderNumber,
    comandaNumber: o.comandaNumber,
    customerName: o.customer.name,
    sellerName: o.seller.name,
    total: formatBRL(o.total.toString()),
    createdAt: o.createdAt.toISOString(),
    currentCnpjId: o.cnpjId,
    currentPaymentMethodId: o.paymentMethodId,
    currentBankId: o.bankId,
    proof2Count: 0,
    proof2List: [],
    simplifiedFlow: false,
    paymentProofList: [],
    shippingNotes: o.notes,
    paymentNotes: null,
    processedAt: null,
    outcome: null,
    hasActiveIssue: false,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Financeiro</h1>
        <p className="text-sm text-muted-foreground">Auditoria, faturamento e liberação de pedidos.</p>
      </div>

      <FinanceiroFerramentas
        paymentMethods={paymentMethods.map((p) => ({ id: p.id, name: p.name, active: p.active }))}
        banks={banks.map((b) => ({ id: b.id, name: b.name, active: b.active }))}
        payStatuses={payStatuses.map((p) => ({ id: p.id, name: p.name, active: p.active, disposition: p.disposition }))}
        cnpjs={cnpjs.map((c) => ({ id: c.id, name: c.name, document: c.document, active: c.active }))}
      />

      <AnaliseKanban
        pendentes={pendentes}
        processados={processados}
        pagPendentes={pagPendentesCards}
        statusOptions={statusAtivos}
        cnpjOptions={cnpjsAtivos}
        paymentMethods={formasAtivas}
        banks={bancosAtivos}
        processedWindowMin={PROCESSED_WINDOW_MIN}
      />
    </div>
  );
}
