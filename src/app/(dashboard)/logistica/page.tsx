import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { DASHBOARD_COLUMNS, columnsForFlow } from "@/lib/order-flow";
import { KanbanBoard, type KanbanCard } from "@/components/shared/kanban-board";
import { StorePicker } from "@/components/shared/store-picker";
import { loadStageLimits, loadStatusSince } from "@/lib/stage-limits";
import { isTroca } from "@/lib/validations/order";
import { formatBRL } from "@/lib/utils";

// Dashboard de Logística: visual e estrutura iguais ao Fluxo de Pedidos,
// porém com a permissão de AVANÇAR manualmente o status dos pedidos.
export default async function LogisticaPage({
  searchParams,
}: {
  searchParams?: { loja?: string };
}) {
  // Acesso: LOGISTICA e GESTAO sempre; demais perfis somente se tiverem
  // Loja de Origem atrelada (doc 4.4 — dar andamento aos pedidos da loja).
  const session = await requireRole();
  const podeLogistica =
    session.role === "LOGISTICA" || session.role === "GESTAO"
      ? true
      : (await prisma.user.count({
          where: { id: session.userId, originStores: { some: { active: true } } },
        })) > 0;
  if (!podeLogistica) redirect("/");

  const loja = searchParams?.loja;

  // Lojas do pop-up: GESTAO ve todas as ativas; os demais (LOGISTICA ou perfis
  // com loja atrelada) veem as atreladas ao seu cadastro (doc 4.4).
  const pickerStores =
    session.role === "GESTAO"
      ? await prisma.originStore.findMany({ where: { active: true }, select: { id: true, name: true, simplifiedFlow: true }, orderBy: { name: "asc" } })
      : (await prisma.user.findUnique({
          where: { id: session.userId },
          select: { originStores: { where: { active: true }, select: { id: true, name: true, simplifiedFlow: true }, orderBy: { name: "asc" } } },
        }))?.originStores ?? [];

  if (!loja) {
    return <StorePicker stores={pickerStores} basePath="/logistica" title="Logística" />;
  }

  const scoped = loja !== "all";
  let simplified = false;
  let lojaName = "";
  if (scoped) {
    const store = pickerStores.find((s) => s.id === loja);
    if (!store) {
      return <StorePicker stores={pickerStores} basePath="/logistica" title="Logística" />;
    }
    simplified = store.simplifiedFlow;
    lojaName = store.name;
  }

  const [orders, drivers] = await Promise.all([
    prisma.order.findMany({
      where: scoped ? { originStoreId: loja } : {},
      include: { customer: true, seller: true, orderType: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.user.findMany({ where: { role: "MOTORISTA", active: true }, select: { id: true, name: true } }),
  ]);

  // Momento em que cada pedido entrou em ENTREGUE (para sumir do fluxo após 15 min).
  const entregues = orders.filter((o) => o.status === "ENTREGUE").map((o) => o.id);
  const deliveredHist = entregues.length
    ? await prisma.orderStatusHistory.findMany({
        where: { orderId: { in: entregues }, status: "ENTREGUE" },
        orderBy: { createdAt: "desc" },
      })
    : [];
  const deliveredAtById = new Map<string, string>();
  for (const h of deliveredHist) {
    if (!deliveredAtById.has(h.orderId)) deliveredAtById.set(h.orderId, h.createdAt.toISOString());
  }

  const [stageLimits, statusSince] = await Promise.all([
    loadStageLimits(),
    loadStatusSince(orders.map((o) => ({ id: o.id, status: o.status }))),
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
    isExchange: isTroca(o.orderType?.name),
    deliveredAt: deliveredAtById.get(o.id) ?? null,
    statusSince: statusSince.get(o.id) ?? null,
  }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-distribuicao">
          Logística{scoped ? ` — ${lojaName}` : " — Todas as lojas"}
        </h1>
        <p className="text-sm text-muted-foreground">
          Acompanhe o status dos pedidos e avance manualmente os que estão prontos para entrega.
        </p>
      </div>
      <KanbanBoard
        cards={cards}
        columns={scoped ? columnsForFlow(simplified) : DASHBOARD_COLUMNS}
        advance={{ enabled: true, drivers }}
        canManage={session.role === "GESTAO"}
        userRole={session.role}
        boardTitle={scoped ? lojaName.toUpperCase() : "LOGÍSTICA"}
        titleAccent="distribuicao"
        stageLimits={stageLimits}
      />
    </div>
  );
}
