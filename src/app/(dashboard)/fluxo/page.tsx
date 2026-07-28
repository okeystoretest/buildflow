import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DASHBOARD_COLUMNS, columnsForFlow } from "@/lib/order-flow";
import { KanbanBoard, type KanbanCard } from "@/components/shared/kanban-board";
import { StorePicker } from "@/components/shared/store-picker";
import { loadStageLimits, loadStatusSince } from "@/lib/stage-limits";
import { isTroca } from "@/lib/validations/order";
import { formatBRL } from "@/lib/utils";

// Fluxo de pedidos GLOBAL: Gestão, Vendas e Financeiro.
// Logística NÃO tem acesso ao fluxo global — usa apenas o painel restrito
// em /logistica (com as operações específicas do setor).
export default async function FluxoPage({
  searchParams,
}: {
  searchParams?: { loja?: string };
}) {
  const session = await requireRole(["GESTAO", "VENDAS", "FINANCEIRO"]);

  const loja = searchParams?.loja;

  // Lojas que o usuario pode escolher no pop-up: VENDAS ve so as atreladas;
  // GESTAO/FINANCEIRO veem todas as ativas.
  const pickerStores =
    session.role === "VENDAS"
      ? (await prisma.user.findUnique({
          where: { id: session.userId },
          select: { originStores: { where: { active: true }, select: { id: true, name: true, simplifiedFlow: true }, orderBy: { name: "asc" } } },
        }))?.originStores ?? []
      : await prisma.originStore.findMany({ where: { active: true }, select: { id: true, name: true, simplifiedFlow: true }, orderBy: { name: "asc" } });

  // Sem parametro: exibe o pop-up de selecao de loja (doc 4.2).
  if (!loja) {
    return <StorePicker stores={pickerStores} basePath="/fluxo" title="Fluxo de Pedidos" />;
  }

  // Loja especifica (nao "all"): valida acesso e resolve o tipo de fluxo.
  const scoped = loja !== "all";
  let simplified = false;
  let lojaName = "";
  if (scoped) {
    const store = pickerStores.find((s) => s.id === loja);
    // VENDAS so acessa lojas atreladas; se nao estiver na lista, bloqueia.
    if (!store) {
      return <StorePicker stores={pickerStores} basePath="/fluxo" title="Fluxo de Pedidos" />;
    }
    simplified = store.simplifiedFlow;
    lojaName = store.name;
  }

  // Restrição de escopo: vendedor(a) vê só os próprios pedidos.
  // Os demais setores (Gestão, Financeiro) veem todos. Filtro por loja quando aplicavel.
  const orders = await prisma.order.findMany({
    where: {
      ...(session.role === "VENDAS" ? { sellerId: session.userId } : {}),
      ...(scoped ? { originStoreId: loja } : {}),
    },
    include: { customer: true, seller: true, orderType: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });

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

  // Prazos por etapa (Gestão > Etapas) + momento de entrada no status atual.
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
        <h1 className="text-2xl font-bold">
          Fluxo de Pedidos{scoped ? ` — ${lojaName}` : " — Todas as lojas"}
        </h1>
        <p className="text-sm text-muted-foreground">Acompanhamento de todos os pedidos por status.</p>
      </div>
      <KanbanBoard
        cards={cards}
        columns={scoped ? columnsForFlow(simplified) : DASHBOARD_COLUMNS}
        canManage={session.role === "GESTAO"}
        userRole={session.role}
        boardTitle={scoped ? lojaName.toUpperCase() : "GERAL"}
        stageLimits={stageLimits}
        simplified={scoped && simplified}
      />
    </div>
  );
}
