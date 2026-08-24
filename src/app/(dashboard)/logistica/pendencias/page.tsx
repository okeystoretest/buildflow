import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { BackButton } from "@/components/shared/back-button";
import { Pagination } from "@/components/shared/pagination";
import { montarCiclos, type HistoricoEntrada } from "@/lib/pendencias";
import { PendenciasFiltros } from "./filtros-client";
import { PendenciasList, type PendenciaPedido } from "./pendencias-client";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

const PER_PAGE = 20;

/**
 * LOGÍSTICA > Relatório de Pendências
 * ---------------------------------------------------------------------------
 * Lista TODOS os pedidos que atingiram o status PENDENTE — não apenas os que
 * estão pendentes agora. O critério é a existência de uma entrada de histórico
 * com status PENDENTE, o que preserva o caso comum de pendência já resolvida
 * (o pedido seguiu o fluxo, mas o registro precisa continuar auditável).
 *
 * Para cada pedido, exibe cada ciclo de pendência com a descrição registrada,
 * as tratativas intermediárias e a resolução correspondente.
 */
export default async function RelatorioPendenciasPage({
  searchParams,
}: {
  searchParams?: { busca?: string; de?: string; ate?: string; situacao?: string; page?: string };
}) {
  await requireRole(["LOGISTICA", "GESTAO"]);

  const busca = searchParams?.busca?.trim() || "";
  const de = searchParams?.de?.trim() || "";
  const ate = searchParams?.ate?.trim() || "";
  // "abertas" = pedido parado em PENDENTE agora; "resolvidas" = já saiu de lá.
  const situacao = searchParams?.situacao === "abertas" || searchParams?.situacao === "resolvidas"
    ? searchParams.situacao
    : "todas";
  const page = Math.max(1, Number(searchParams?.page ?? 1) || 1);

  // Intervalo aplicado sobre a DATA DE ABERTURA da pendência.
  const aberturaFilter: Prisma.DateTimeFilter = {};
  if (de) aberturaFilter.gte = new Date(de + "T00:00:00");
  if (ate) aberturaFilter.lte = new Date(ate + "T23:59:59");
  const temPeriodo = de !== "" || ate !== "";

  const where: Prisma.OrderWhereInput = {
    // Critério central: o pedido ATINGIU o status Pendente em algum momento.
    history: {
      some: {
        status: "PENDENTE",
        ...(temPeriodo ? { createdAt: aberturaFilter } : {}),
      },
    },
    ...(situacao === "abertas" ? { status: "PENDENTE" } : {}),
    ...(situacao === "resolvidas" ? { status: { not: "PENDENTE" } } : {}),
    ...(busca
      ? {
          OR: [
            { orderNumber: { contains: busca, mode: "insensitive" } },
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
      select: {
        id: true,
        orderNumber: true,
        comandaNumber: true,
        status: true,
        pieceCount: true,
        createdAt: true,
        financeIssue: true,
        financeIssueAt: true,
        financeIssueResolvedAt: true,
        customer: { select: { name: true, code: true } },
        seller: { select: { name: true } },
        orderType: { select: { name: true } },
        originStore: { select: { name: true } },
        history: {
          orderBy: { createdAt: "asc" },
          select: { id: true, status: true, note: true, changedBy: true, createdAt: true },
        },
      },
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
    }),
    prisma.order.count({ where }),
  ]);

  // Traduz changedBy (id) para NOME numa única consulta.
  const autorIds = Array.from(
    new Set(
      orders.flatMap((o) => o.history.map((h) => h.changedBy)).filter((v): v is string => !!v),
    ),
  );
  const autores = autorIds.length
    ? await prisma.user.findMany({ where: { id: { in: autorIds } }, select: { id: true, name: true } })
    : [];
  const nomePorId = new Map(autores.map((u) => [u.id, u.name]));

  const items: PendenciaPedido[] = orders.map((o) => {
    const historico: HistoricoEntrada[] = o.history.map((h) => ({
      id: h.id,
      status: h.status,
      note: h.note,
      autor: h.changedBy ? nomePorId.get(h.changedBy) ?? null : null,
      createdAt: h.createdAt.toISOString(),
    }));

    return {
      id: o.id,
      orderNumber: o.orderNumber,
      comandaNumber: o.comandaNumber,
      status: o.status,
      pieceCount: o.pieceCount,
      customerName: o.customer.name,
      customerCode: o.customer.code,
      sellerName: o.seller.name,
      orderTypeName: o.orderType.name,
      originStoreName: o.originStore?.name ?? null,
      criadoEm: o.createdAt.toISOString(),
      ciclos: montarCiclos(historico),
      // Pendência do FINANCEIRO ("Qual o problema?") — origem diferente da
      // pendência logística, mas o relatório reúne as duas na mesma ficha.
      financeIssue: o.financeIssue,
      financeIssueAt: o.financeIssueAt ? o.financeIssueAt.toISOString() : null,
      financeIssueResolvedAt: o.financeIssueResolvedAt ? o.financeIssueResolvedAt.toISOString() : null,
    };
  });

  return (
    <div className="space-y-6">
      <BackButton href="/logistica" />
      <div>
        <h1 className="text-2xl font-bold text-distribuicao">Relatório de Pendências</h1>
        <p className="text-sm text-muted-foreground">
          Todos os pedidos que atingiram o status Pendente, com a descrição de cada pendência e o
          respectivo histórico de tratativas e resolução.
        </p>
      </div>

      <PendenciasFiltros defaultBusca={busca} defaultDe={de} defaultAte={ate} defaultSituacao={situacao} />

      <p className="text-sm text-muted-foreground">
        {total} pedido(s) com pendência registrada
        {busca ? ` para "${busca}"` : ""}.
      </p>

      {total === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Nenhuma pendência encontrada com os filtros atuais.
          </CardContent>
        </Card>
      ) : (
        <PendenciasList pedidos={items} />
      )}

      <Pagination page={page} perPage={PER_PAGE} total={total} label="pedidos" />
    </div>
  );
}
