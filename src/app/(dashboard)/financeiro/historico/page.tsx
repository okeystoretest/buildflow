import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { formatBRL } from "@/lib/utils";
import { BackButton } from "@/components/shared/back-button";
import { Pagination } from "@/components/shared/pagination";
import { FinHistoricoFiltros } from "./filtros-client";
import { FinHistoricoList, type FinHistItem } from "./historico-list";
import type { OrderStatus, Prisma } from "@prisma/client";

// O historico so cresce, entao paginamos no banco.
const PER_PAGE = 20;

// Status que representam a SAIDA do EM_ANALISE, ou seja, o pedido "processado"
// pelo Financeiro (aprovado no padrao/simplificado ou interrompido).
const PROCESSED_STATUSES: OrderStatus[] = [
  "AGUARDANDO_IMPRESSAO", // aprovado (fluxo padrao)
  "PAGO",                 // pago (fluxo simplificado)
  "ESTORNO",
  "ESTORNO_PARCIAL",
  "CANCELADO",
];

function firstDayOfMonth(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}
function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function outcomeOf(status: OrderStatus): FinHistItem["outcome"] {
  if (status === "AGUARDANDO_IMPRESSAO") return "APROVADO";
  if (status === "PAGO") return "PAGO";
  return "INTERROMPIDO";
}

export default async function FinanceiroHistoricoPage({
  searchParams,
}: {
  searchParams: { busca?: string; de?: string; ate?: string; page?: string };
}) {
  await requireRole(["FINANCEIRO", "GESTAO"]);

  const de = searchParams.de || firstDayOfMonth();
  const ate = searchParams.ate || todayStr();
  const busca = searchParams.busca?.trim() || "";
  const page = Math.max(1, Number(searchParams.page ?? 1) || 1);

  const dataInicio = new Date(de + "T00:00:00");
  const dataFim = new Date(ate + "T23:59:59");

  // Filtro sobre as ENTRADAS de historico que marcam o processamento pelo
  // Financeiro. A data considerada e a do processamento (createdAt do historico).
  const orderFilter: Prisma.OrderWhereInput = busca
    ? {
        OR: [
          { orderNumber: { contains: busca, mode: "insensitive" } },
          { comandaNumber: { contains: busca, mode: "insensitive" } },
          { customer: { name: { contains: busca, mode: "insensitive" } } },
        ],
      }
    : {};

  const where: Prisma.OrderStatusHistoryWhereInput = {
    status: { in: PROCESSED_STATUSES },
    createdAt: { gte: dataInicio, lte: dataFim },
    order: orderFilter,
  };

  const [hist, total] = await Promise.all([
    prisma.orderStatusHistory.findMany({
      where,
      include: {
        order: {
          include: {
            customer: true,
            seller: true,
            cnpj: true,
            paymentMethod: true,
            bank: true,
            paymentStatus: true,
            paymentProofs: { orderBy: { createdAt: "asc" }, select: { id: true, filePath: true } },
            financeProofs: { orderBy: { createdAt: "asc" }, select: { id: true, filePath: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
    }),
    prisma.orderStatusHistory.count({ where }),
  ]);

  const items: FinHistItem[] = hist.map((h) => {
    const o = h.order;
    const outcome = outcomeOf(h.status);
    // Rotulo do desfecho: usa a nota do historico quando util, senao o proprio.
    const outcomeLabel =
      outcome === "APROVADO" ? "Aprovado" : outcome === "PAGO" ? "Pago" : (h.note || "Interrompido");
    return {
      id: o.id,
      orderNumber: o.orderNumber,
      comandaNumber: o.comandaNumber,
      customerName: o.customer.name,
      sellerName: o.seller.name,
      total: formatBRL(o.total.toString()),
      orderValue: formatBRL(o.orderValue.toString()),
      freight: formatBRL(o.freight.toString()),
      processedAt: h.createdAt.toISOString(),
      outcome,
      outcomeLabel,
      cnpjName: o.cnpj?.name ?? null,
      paymentMethodName: o.paymentMethod?.name ?? null,
      bankName: o.bank?.name ?? null,
      paymentStatusName: o.paymentStatus?.name ?? null,
      trackingCode: o.trackingCode,
      paymentNotes: o.paymentNotes,
      shippingNotes: o.notes,
      paymentProofPath: o.paymentProofPath,
      invoicePath: o.invoicePath,
      paymentProofs: o.paymentProofs.map((p) => ({ id: p.id, filePath: p.filePath })),
      financeProofs: o.financeProofs.map((p) => ({ id: p.id, filePath: p.filePath })),
    };
  });

  return (
    <div className="space-y-6">
      <BackButton href="/financeiro" />
      <h1 className="text-2xl font-bold text-financeiro">Histórico do Financeiro</h1>
      <p className="text-sm text-muted-foreground">
        Todos os pedidos já processados (aprovados, pagos ou interrompidos), com as informações completas.
      </p>

      <FinHistoricoFiltros defaultDe={de} defaultAte={ate} defaultBusca={busca} />

      <p className="text-sm text-muted-foreground">
        {total} pedido(s) processado(s) entre {new Date(de).toLocaleDateString("pt-BR")} e {new Date(ate).toLocaleDateString("pt-BR")}.
      </p>

      {total === 0 && (
        <Card><CardContent className="py-8 text-center text-muted-foreground">Nenhum pedido processado no período/filtro.</CardContent></Card>
      )}

      <FinHistoricoList orders={items} />

      <Pagination page={page} perPage={PER_PAGE} total={total} label="pedidos" />
    </div>
  );
}
