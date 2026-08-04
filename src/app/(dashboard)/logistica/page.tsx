import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { columnsForFlow } from "@/lib/order-flow";
import { KanbanBoard, type KanbanCard } from "@/components/shared/kanban-board";
import { StorePicker } from "@/components/shared/store-picker";
import { loadStageLimits, loadStatusSince } from "@/lib/stage-limits";
import { isAnexoDispensavel } from "@/lib/validations/order";
import { formatBRL } from "@/lib/utils";

// Nome da loja padrao (default view) da Logistica.
const DEFAULT_STORE_NAME = "OKEY Store (Fábrica)";

// Dashboard de Logística: visual e estrutura iguais ao Fluxo de Pedidos,
// porém com a permissão de AVANÇAR manualmente o status dos pedidos.
export default async function LogisticaPage({
  searchParams,
}: {
  searchParams?: { loja?: string };
}) {
  const session = await requireRole();

  // ------------------------------------------------------------------
  // CONTROLE DE ACESSO AO MODULO DE LOGISTICA
  //  - LOGISTICA e GESTAO: acesso total.
  //  - VENDAS: acesso APENAS se vinculado a loja(s) de FLUXO SIMPLIFICADO.
  //    Vendas de loja de fluxo padrao NAO acessam este modulo.
  //  - Demais perfis: sem acesso.
  // ------------------------------------------------------------------
  const isLogisticaOuGestao = session.role === "LOGISTICA" || session.role === "GESTAO";
  const isVendas = session.role === "VENDAS";

  // Lojas simplificadas atreladas ao usuario (relevante para VENDAS).
  const simplifiedLinked = isVendas
    ? (await prisma.user.findUnique({
        where: { id: session.userId },
        select: {
          originStores: {
            where: { active: true, simplifiedFlow: true },
            select: { id: true, name: true, simplifiedFlow: true },
            orderBy: { name: "asc" },
          },
        },
      }))?.originStores ?? []
    : [];

  const podeLogistica = isLogisticaOuGestao || (isVendas && simplifiedLinked.length > 0);
  if (!podeLogistica) redirect("/");

  // Lojas do pop-up:
  //  - GESTAO/LOGISTICA: todas as ativas.
  //  - VENDAS autorizado: apenas as suas lojas simplificadas.
  const pickerStores = isLogisticaOuGestao
    ? await prisma.originStore.findMany({
        where: { active: true },
        select: { id: true, name: true, simplifiedFlow: true },
        orderBy: { name: "asc" },
      })
    : simplifiedLinked;

  // Ownership: VENDAS so ve/move os PROPRIOS pedidos dentro da Logistica.
  const ownershipWhere = isVendas ? { sellerId: session.userId } : {};

  let loja = searchParams?.loja;

  // DEFAULT VIEW: sem ?loja, abre direto numa loja (sem pop-up), priorizando a
  // "OKEY Store (Fábrica)" quando o usuario tem acesso a ela; senao, a primeira
  // loja acessivel. So cai no pop-up se houver mais de uma opcao e nenhuma for
  // a padrao (cenario raro).
  if (!loja) {
    const fabrica = pickerStores.find((s) => s.name === DEFAULT_STORE_NAME);
    if (fabrica) {
      loja = fabrica.id;
    } else if (pickerStores.length === 1) {
      loja = pickerStores[0].id;
    } else if (pickerStores.length === 0) {
      redirect("/");
    } else {
      return <StorePicker stores={pickerStores} basePath="/logistica" title="Logística" />;
    }
  }

  // Visualizacao SEMPRE escopada por loja (nao ha mais "todas as lojas").
  const store = pickerStores.find((s) => s.id === loja);
  // Fora do escopo permitido (ex.: VENDAS tentando loja nao atrelada, ou
  // ?loja=all forcado na URL) -> picker.
  if (!store) {
    return <StorePicker stores={pickerStores} basePath="/logistica" title="Logística" />;
  }
  const simplified = store.simplifiedFlow;
  const lojaName = store.name;

  const [orders, drivers] = await Promise.all([
    prisma.order.findMany({
      where: {
        ...ownershipWhere,
        originStoreId: loja,
      },
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
    isExchange: isAnexoDispensavel(o.orderType?.name),
    deliveredAt: deliveredAtById.get(o.id) ?? null,
    statusSince: statusSince.get(o.id) ?? null,
  }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-distribuicao">
          Fluxo de Pedidos → Fábrica (LOGÍSTICA) — {lojaName}
        </h1>
        <p className="text-sm text-muted-foreground">
          Acompanhe o status dos pedidos e avance manualmente os que estão prontos para entrega.
        </p>
      </div>
      <KanbanBoard
        cards={cards}
        columns={columnsForFlow(simplified)}
        advance={{ enabled: true, drivers }}
        canManage={session.role === "GESTAO"}
        userRole={session.role}
        boardModule="Fluxo de Pedidos → Fábrica (LOGÍSTICA)"
        boardTitle={lojaName.toUpperCase()}
        titleAccent="distribuicao"
        stageLimits={stageLimits}
        simplified={simplified}
      />
    </div>
  );
}
