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

  // Correcao 2.1: sem periodo padrao. Sem "de"/"ate" na URL, exibe TODOS os
  // pedidos processados (inclusive legados), independentemente da data.
  const de = searchParams.de?.trim() || "";
  const ate = searchParams.ate?.trim() || "";
  const busca = searchParams.busca?.trim() || "";
  const page = Math.max(1, Number(searchParams.page ?? 1) || 1);

  const createdAt: Prisma.DateTimeFilter = {};
  if (de) createdAt.gte = new Date(de + "T00:00:00");
  if (ate) createdAt.lte = new Date(ate + "T23:59:59");
  const temPeriodo = de !== "" || ate !== "";

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
    ...(temPeriodo ? { createdAt } : {}),
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

  // Fallback (correcao 2.1): registros antigos podem ter relacoes ausentes.
  const items: FinHistItem[] = hist.map((h) => {
    const o = h.order;
    const outcome = outcomeOf(h.status);
    const outcomeLabel =
      outcome === "APROVADO" ? "Aprovado" : outcome === "PAGO" ? "Pago" : (h.note || "Interrompido");
    return {
      id: o.id,
      orderNumber: o.orderNumber ?? "—",
      comandaNumber: o.comandaNumber,
      customerName: o.customer?.name ?? "Cliente não informado",
      sellerName: o.seller?.name ?? "—",
      total: formatBRL((o.total ?? 0).toString()),
      orderValue: formatBRL((o.orderValue ?? 0).toString()),
      freight: formatBRL((o.freight ?? 0).toString()),
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

  const resumoPeriodo = temPeriodo
    ? ` entre ${de ? new Date(de).toLocaleDateString("pt-BR") : "início"} e ${
        ate ? new Date(ate).toLocaleDateString("pt-BR") : "hoje"
      }`
    : " (todos os períodos)";

  return (
    <div className="space-y-6">
      <BackButton href="/financeiro" />
      <h1 className="text-2xl font-bold text-financeiro">Histórico do Financeiro</h1>
      <p className="text-sm text-muted-foreground">
        Todos os pedidos já processados (aprovados, pagos ou interrompidos), com as informações completas.
      </p>

      <FinHistoricoFiltros defaultDe={de} defaultAte={ate} defaultBusca={busca} />

      <p className="text-sm text-muted-foreground">
        {total} pedido(s) processado(s){resumoPeriodo}.
      </p>

      {total === 0 && (
        <Card><CardContent className="py-8 text-center text-muted-foreground">Nenhum pedido processado no período/filtro.</CardContent></Card>
      )}

      <FinHistoricoList orders={items} />

      <Pagination page={page} perPage={PER_PAGE} total={total} label="pedidos" />
    </div>
  );
}
