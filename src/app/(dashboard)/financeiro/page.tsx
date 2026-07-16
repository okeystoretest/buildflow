import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { formatBRL } from "@/lib/utils";
import { FinanceiroFerramentas } from "./ferramentas-client";
import { AnaliseKanban, type FinanceCard } from "./analise-kanban";

// Janela em que um pedido processado permanece visivel na coluna "Processado".
const PROCESSED_WINDOW_MIN = 15;

export default async function FinanceiroPage() {
  await requireRole(["FINANCEIRO", "GESTAO"]);

  const desde = new Date(Date.now() - PROCESSED_WINDOW_MIN * 60 * 1000);

  const [emAnalise, payStatuses, paymentMethods, banks, cnpjs, processadosHist] =
    await Promise.all([
      // PENDENTES: aguardando analise. Mais antigos no topo.
      prisma.order.findMany({
        where: { status: "EM_ANALISE" },
        include: {
          customer: true, seller: true, cnpj: true,
          _count: { select: { financeProofs: true } },
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
    processedAt: null,
    outcome: null,
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
      processedAt: h.createdAt.toISOString(),
      outcome: aprovado ? "APROVADO" : "INTERROMPIDO",
    });
  }

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
        statusOptions={statusAtivos}
        cnpjOptions={cnpjsAtivos}
        paymentMethods={formasAtivas}
        banks={bancosAtivos}
        processedWindowMin={PROCESSED_WINDOW_MIN}
      />
    </div>
  );
}
