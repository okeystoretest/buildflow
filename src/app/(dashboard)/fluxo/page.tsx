import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DASHBOARD_COLUMNS } from "@/lib/order-flow";
import { KanbanBoard, type KanbanCard } from "@/components/shared/kanban-board";
import { formatBRL } from "@/lib/utils";

// Fluxo de pedidos GLOBAL: Gestão, Vendas e Financeiro.
// Logística NÃO tem acesso ao fluxo global — usa apenas o painel restrito
// em /logistica (com as operações específicas do setor).
export default async function FluxoPage() {
  const session = await requireRole(["GESTAO", "VENDAS", "FINANCEIRO"]);

  // Restrição de escopo: vendedor(a) vê só os próprios pedidos.
  // Os demais setores (Gestão, Financeiro) veem todos.
  const orders = await prisma.order.findMany({
    where: session.role === "VENDAS" ? { sellerId: session.userId } : {},
    include: { customer: true, seller: true },
    orderBy: { createdAt: "desc" },
  });

  const cards: KanbanCard[] = orders.map((o) => ({
    id: o.id,
    status: o.status,
    orderNumber: o.orderNumber,
    comandaNumber: o.comandaNumber,
    sellerName: o.seller.name,
    customerName: o.customer.name,
    customerCode: o.customer.code,
    total: formatBRL(o.total.toString()),
    approvedByFinance: o.comandaNumber != null,
    hasInvoice: o.invoicePath != null,
    hasPaymentProof: o.paymentProofPath != null,
  }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Fluxo de Pedidos</h1>
        <p className="text-sm text-muted-foreground">Acompanhamento de todos os pedidos por status.</p>
      </div>
      <KanbanBoard cards={cards} columns={DASHBOARD_COLUMNS} canManage={session.role === "GESTAO"} />
    </div>
  );
}
