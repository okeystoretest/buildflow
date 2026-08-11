import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { BackButton } from "@/components/shared/back-button";
import { Pagination } from "@/components/shared/pagination";
import { EntregasList } from "@/components/shared/entregas-list";
import { entregaInclude, toEntregaItem } from "@/components/shared/entrega-map";
import { EntregasLogFiltros } from "./filtros-client";
import type { Prisma } from "@prisma/client";

// Histórico só cresce → paginado no banco.
const PER_PAGE = 20;

export default async function LogisticaEntregasPage({
  searchParams,
}: {
  searchParams: { busca?: string; de?: string; ate?: string; page?: string };
}) {
  await requireRole(["LOGISTICA", "GESTAO"]);

  const busca = searchParams.busca?.trim() || "";
  const de = searchParams.de?.trim() || "";
  const ate = searchParams.ate?.trim() || "";
  const page = Math.max(1, Number(searchParams.page ?? 1) || 1);

  // Intervalo de datas sobre a data de conclusão da entrega (entrada de
  // histórico com status ENTREGUE). Sem período informado, lista todas.
  const entregueDataFilter: Prisma.DateTimeFilter = {};
  if (de) entregueDataFilter.gte = new Date(de + "T00:00:00");
  if (ate) entregueDataFilter.lte = new Date(ate + "T23:59:59");
  const temPeriodo = de !== "" || ate !== "";

  // BUGFIX (truncamento): o histórico listava apenas Order.status === "ENTREGUE".
  // No fluxo do motorista, ao concluir a entrega o pedido avança para CONCLUIDO
  // (a Delivery fica ENTREGUE) — ou seja, TODA entrega realmente concluída por
  // motorista saía da listagem, deixando à mostra só o estado transitório e os
  // pedidos de fluxo simplificado (que terminam em ENTREGUE sem criar Delivery).
  // Isso divergia do Histórico de Vendas, que filtra por CONCLUIDO e exibe o
  // volume correto. Correção: aceitar CONCLUIDO **e** ENTREGUE, cobrindo os dois
  // caminhos (motorista → CONCLUIDO; simplificado → ENTREGUE) numa só query.
  const where: Prisma.OrderWhereInput = {
    status: { in: ["CONCLUIDO", "ENTREGUE"] },
    ...(temPeriodo
      ? { history: { some: { status: "ENTREGUE", createdAt: entregueDataFilter } } }
      : {}),
    ...(busca
      ? {
          OR: [
            { comandaNumber: { contains: busca, mode: "insensitive" } },
            { customer: { name: { contains: busca, mode: "insensitive" } } },
            { seller: { name: { contains: busca, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      include: entregaInclude,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
    }),
    prisma.order.count({ where }),
  ]);

  // Data de conclusão (alteração para ENTREGUE) por pedido, a partir do
  // histórico — cobre também o fluxo simplificado, que não tem Delivery.
  const ids = orders.map((o) => o.id);
  const entregueHist = ids.length
    ? await prisma.orderStatusHistory.findMany({
        where: { orderId: { in: ids }, status: "ENTREGUE" },
        orderBy: { createdAt: "desc" },
        select: { orderId: true, createdAt: true },
      })
    : [];
  const entregueAtById = new Map<string, string>();
  for (const h of entregueHist) {
    if (!entregueAtById.has(h.orderId)) entregueAtById.set(h.orderId, h.createdAt.toISOString());
  }

  const items = orders.map((o) => {
    const item = toEntregaItem(o);
    // Se a entrega não trouxe deliveredAt (fluxo simplificado), usa a data do
    // histórico de mudança para ENTREGUE.
    if (!item.deliveredAt) item.deliveredAt = entregueAtById.get(o.id) ?? null;
    return item;
  });

  const resumoPeriodo = temPeriodo
    ? ` entre ${de ? new Date(de).toLocaleDateString("pt-BR") : "início"} e ${
        ate ? new Date(ate).toLocaleDateString("pt-BR") : "hoje"
      }`
    : "";

  return (
    <div className="space-y-6">
      <BackButton href="/logistica" />
      <h1 className="text-2xl font-bold text-distribuicao">Histórico de Entregas</h1>
      <p className="text-sm text-muted-foreground">
        Pedidos concluídos (entregues). Clique em um para ver a ficha completa da venda e da entrega.
      </p>

      <EntregasLogFiltros defaultBusca={busca} defaultDe={de} defaultAte={ate} />

      <p className="text-sm text-muted-foreground">
        {total} entrega(s) encontrada(s){busca ? ` para "${busca}"` : ""}{resumoPeriodo}.
      </p>

      {total === 0 && (
        <Card><CardContent className="py-8 text-center text-muted-foreground">Nenhuma entrega encontrada.</CardContent></Card>
      )}

      <EntregasList orders={items} />

      <Pagination page={page} perPage={PER_PAGE} total={total} label="entregas" />
    </div>
  );
}
