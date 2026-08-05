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

// Histórico de Comandas Entregues (módulo Logística).
// RBAC: exclusivamente LOGISTICA e GESTAO. Demais perfis não acessam.
export default async function LogisticaEntregasPage({
  searchParams,
}: {
  searchParams: { busca?: string; page?: string };
}) {
  await requireRole(["LOGISTICA", "GESTAO"]);

  const busca = searchParams.busca?.trim() || "";
  const page = Math.max(1, Number(searchParams.page ?? 1) || 1);

  // Comandas com entrega concluída. A verdade da entrega está em
  // Delivery.status = ENTREGUE (não no status do pedido, que pode ter avançado
  // para CONCLUIDO). Busca multi-critério: cliente, comanda ou vendedora.
  const where: Prisma.OrderWhereInput = {
    delivery: { is: { status: "ENTREGUE" } },
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
      orderBy: { delivery: { deliveredAt: "desc" } },
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
    }),
    prisma.order.count({ where }),
  ]);

  const items = orders.map(toEntregaItem);

  return (
    <div className="space-y-6">
      <BackButton href="/logistica" />
      <h1 className="text-2xl font-bold text-distribuicao">Histórico de Entregas</h1>
      <p className="text-sm text-muted-foreground">
        Todas as comandas com entrega concluída. Clique em uma para ver a ficha completa da venda e da entrega.
      </p>

      <EntregasLogFiltros defaultBusca={busca} />

      <p className="text-sm text-muted-foreground">
        {total} entrega(s) encontrada(s){busca ? ` para "${busca}"` : ""}.
      </p>

      {total === 0 && (
        <Card><CardContent className="py-8 text-center text-muted-foreground">Nenhuma entrega encontrada.</CardContent></Card>
      )}

      <EntregasList orders={items} />

      <Pagination page={page} perPage={PER_PAGE} total={total} label="entregas" />
    </div>
  );
}
