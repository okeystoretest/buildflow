import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { formatBRL } from "@/lib/utils";
import { BackButton } from "@/components/shared/back-button";
import { HistoricoFiltros } from "./filtros-client";
import { ComandaList, type ComandaListItem } from "@/components/shared/comanda-list";
import { isAnexoDispensavel } from "@/lib/validations/order";
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
      // So o que o card fechado mostra; a ficha da comanda vem de
      // /api/orders/[id] ao abrir o bloco — e e la que o recorte por papel e
      // aplicado (o motorista nao recebe valores, comprovantes, NF, devolucoes
      // nem itens de campanha).
      include: {
        customer: { select: { name: true, code: true } },
        seller: { select: { name: true } },
        orderType: { select: { name: true } },
        delivery: { select: { id: true } },
        _count: { select: { paymentProofs: true } },
      },
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
    }),
    prisma.order.count({ where }),
  ]);

  const items: ComandaListItem[] = orders.map((o) => ({
    id: o.id,
    status: o.status,
    orderNumber: o.orderNumber,
    comandaNumber: o.comandaNumber,
    customerName: o.customer.name,
    customerCode: o.customer.code,
    sellerName: o.seller?.name ?? "—",
    // O VALOR do pedido nao vai ao card do motorista: o recorte por papel vale
    // tambem para o que a listagem manda ao navegador, nao so para a ficha.
    // Gestao, na mesma tela, ve o valor.
    total: session.role === "MOTORISTA" ? undefined : formatBRL(o.total.toString()),
    approvedByFinance: o.comandaNumber != null,
    hasInvoice: o.invoicePath != null,
    hasPaymentProof: o.paymentProofPath != null || o._count.paymentProofs > 0,
    isExchange: isAnexoDispensavel(o.orderType?.name),
    pickupAtStore: o.pickupAtStore,
    hasTracking: !!o.trackingCode,
    deliveryId: o.delivery?.id ?? null,
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

      {/* driverMode segue o PAPEL, não a tela: o motorista vê a comanda integral
          menos o pacote financeiro (valores, comprovantes, NF) — o mesmo corte
          do Fluxo. Gestão, que também abre esta tela, vê tudo. */}
      <ComandaList
        orders={items}
        editableProofs
        driverMode={session.role === "MOTORISTA"}
      />

      <Pagination page={page} perPage={PER_PAGE} total={total} label="entregas" />
    </div>
  );
}
