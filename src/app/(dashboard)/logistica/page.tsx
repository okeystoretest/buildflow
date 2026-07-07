import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { DASHBOARD_COLUMNS } from "@/lib/order-flow";
import { KanbanBoard, type KanbanCard } from "@/components/shared/kanban-board";
import { formatBRL } from "@/lib/utils";

// Dashboard de Logística: visual e estrutura iguais ao Fluxo de Pedidos,
// porém com a permissão de AVANÇAR manualmente o status dos pedidos.
export default async function LogisticaPage() {
  const session = await requireRole(["LOGISTICA", "GESTAO"]);

  const [orders, drivers] = await Promise.all([
    prisma.order.findMany({
      include: { customer: true, seller: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.user.findMany({ where: { role: "MOTORISTA", active: true }, select: { id: true, name: true } }),
  ]);

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
        <h1 className="text-2xl font-bold text-distribuicao">Logística</h1>
        <p className="text-sm text-muted-foreground">
          Acompanhe o status dos pedidos e avance manualmente os que estão prontos para entrega.
        </p>
      </div>
      <KanbanBoard cards={cards} columns={DASHBOARD_COLUMNS} advance={{ enabled: true, drivers }} canManage={session.role === "GESTAO"} />
    </div>
  );
}
