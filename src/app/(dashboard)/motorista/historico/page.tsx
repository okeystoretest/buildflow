import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { formatBRL } from "@/lib/utils";
import { BackButton } from "@/components/shared/back-button";
import { HistoricoFiltros } from "./filtros-client";
import { HistoricoList, type HistoricoItem } from "@/app/(dashboard)/vendas/historico/historico-list";
import { Pagination } from "@/components/shared/pagination";
import type { Prisma } from "@prisma/client";

// Itens por pagina. O historico so cresce, entao paginamos no banco.
const PER_PAGE = 20;

function firstDayOfMonth(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}
function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

// Histórico de entregas do motorista: todos os pedidos CONCLUÍDOS entregues por
// ele (delivery.driverId == usuário). Gestão vê o histórico de todos.
export default async function MotoristaHistoricoPage({
  searchParams,
}: {
  searchParams: { busca?: string; de?: string; ate?: string; page?: string };
}) {
  const session = await requireRole(["MOTORISTA", "GESTAO"]);

  const de = searchParams.de || firstDayOfMonth();
  const ate = searchParams.ate || todayStr();
  const busca = searchParams.busca?.trim() || "";
  const page = Math.max(1, Number(searchParams.page ?? 1) || 1);

  const dataInicio = new Date(de + "T00:00:00");
  const dataFim = new Date(ate + "T23:59:59");

  const where: Prisma.OrderWhereInput = {
    status: "CONCLUIDO",
    updatedAt: { gte: dataInicio, lte: dataFim },
    // Motorista vê só as próprias entregas; Gestão vê todas as concluídas.
    delivery: session.role === "GESTAO" ? { isNot: null } : { driverId: session.userId },
    ...(busca
      ? {
          OR: [
            { comandaNumber: { contains: busca, mode: "insensitive" } },
            { customer: { name: { contains: busca, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      include: {
        customer: true,
        delivery: { include: { proofs: true, driver: true } },
      },
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
    }),
    prisma.order.count({ where }),
  ]);

  const items: HistoricoItem[] = orders.map((o) => ({
    id: o.id,
    orderNumber: o.orderNumber,
    comandaNumber: o.comandaNumber,
    customerName: o.customer.name,
    total: formatBRL(o.total.toString()),
    driverName: o.delivery?.driver?.name ?? null,
    paymentProofPath: o.paymentProofPath,
    invoicePath: o.invoicePath,
    trackingCode: o.trackingCode,
    proofs: (o.delivery?.proofs ?? []).map((p) => ({ id: p.id, filePath: p.filePath })),
  }));

  return (
    <div className="space-y-6">
      <BackButton href="/motorista" />
      <h1 className="text-2xl font-bold text-motorista">Histórico de Entregas</h1>

      <HistoricoFiltros defaultDe={de} defaultAte={ate} defaultBusca={busca} />

      <p className="text-sm text-muted-foreground">
        {total} entrega(s) encontrada(s) entre {new Date(de).toLocaleDateString("pt-BR")} e {new Date(ate).toLocaleDateString("pt-BR")}.
      </p>

      {total === 0 && (
        <Card><CardContent className="py-8 text-center text-muted-foreground">Nenhuma entrega no período/filtro.</CardContent></Card>
      )}

      <HistoricoList orders={items} />

      <Pagination page={page} perPage={PER_PAGE} total={total} label="entregas" />
    </div>
  );
}
