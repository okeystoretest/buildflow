import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { formatBRL } from "@/lib/utils";
import { BackButton } from "@/components/shared/back-button";
import { HistoricoFiltros } from "./filtros-client";
import { HistoricoList, type HistoricoItem } from "./historico-list";
import { Pagination } from "@/components/shared/pagination";
import type { Prisma } from "@prisma/client";

// Itens por pagina. O historico so cresce (todo pedido concluido fica aqui),
// entao a consulta e paginada no banco em vez de trazer tudo.
const PER_PAGE = 20;

export default async function HistoricoPage({
  searchParams,
}: {
  searchParams: { comanda?: string; de?: string; ate?: string; page?: string };
}) {
  const session = await requireRole(["VENDAS", "GESTAO", "FINANCEIRO"]);

  // IMPORTANTE (correcao 2.1): NAO ha mais filtro de data padrao. Antes o
  // periodo caia no "mes atual", o que ocultava silenciosamente todos os
  // pedidos legados/anteriores. Agora, sem "de"/"ate" na URL, o historico
  // exibe TODOS os pedidos concluidos, independentemente da data. O filtro de
  // periodo so e aplicado quando o usuario o define explicitamente.
  const de = searchParams.de?.trim() || "";
  const ate = searchParams.ate?.trim() || "";
  const comanda = searchParams.comanda?.trim() || "";
  const page = Math.max(1, Number(searchParams.page ?? 1) || 1);

  // Intervalo de data condicional: so entra no filtro se informado.
  const updatedAt: Prisma.DateTimeFilter = {};
  if (de) updatedAt.gte = new Date(de + "T00:00:00");
  if (ate) updatedAt.lte = new Date(ate + "T23:59:59");
  const temPeriodo = de !== "" || ate !== "";

  // O mesmo filtro serve para listar a pagina e para contar o total.
  const where: Prisma.OrderWhereInput = {
    status: "CONCLUIDO",
    // GESTAO/FINANCEIRO veem tudo; VENDAS ve apenas os proprios pedidos.
    ...(session.role === "GESTAO" || session.role === "FINANCEIRO"
      ? {}
      : { sellerId: session.userId }),
    ...(temPeriodo ? { updatedAt } : {}),
    ...(comanda
      ? { comandaNumber: { contains: comanda, mode: "insensitive" } }
      : {}),
  };

  // As duas consultas correm em paralelo.
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

  // Fallback (correcao 2.1): registros antigos podem ter campos ausentes
  // (customer nulo, total nulo). Blindamos a montagem para nunca quebrar a
  // renderizacao nem ocultar o item.
  const items: HistoricoItem[] = orders.map((o) => ({
    id: o.id,
    orderNumber: o.orderNumber ?? "—",
    comandaNumber: o.comandaNumber,
    customerName: o.customer?.name ?? "Cliente não informado",
    total: formatBRL((o.total ?? 0).toString()),
    driverName: o.delivery?.driver?.name ?? null,
    paymentProofPath: o.paymentProofPath,
    invoicePath: o.invoicePath,
    trackingCode: o.trackingCode,
    proofs: (o.delivery?.proofs ?? []).map((p) => ({ id: p.id, filePath: p.filePath })),
  }));

  const resumoPeriodo = temPeriodo
    ? ` entre ${de ? new Date(de).toLocaleDateString("pt-BR") : "início"} e ${
        ate ? new Date(ate).toLocaleDateString("pt-BR") : "hoje"
      }`
    : " (todos os períodos)";

  return (
    <div className="space-y-6">
      <BackButton href="/vendas" />
      <h1 className="text-2xl font-bold text-vendas">Histórico de Pedidos</h1>

      <HistoricoFiltros defaultDe={de} defaultAte={ate} defaultComanda={comanda} />

      <p className="text-sm text-muted-foreground">
        {total} pedido(s) encontrado(s){resumoPeriodo}.
      </p>

      {total === 0 && (
        <Card><CardContent className="py-8 text-center text-muted-foreground">Nenhum pedido no período/filtro.</CardContent></Card>
      )}

      {/* Exclusão definitiva do pedido: perfis Gestão e Financeiro. */}
      <HistoricoList
        orders={items}
        canDelete={session.role === "GESTAO" || session.role === "FINANCEIRO"}
      />

      <Pagination page={page} perPage={PER_PAGE} total={total} label="pedidos" />
    </div>
  );
}
