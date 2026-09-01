import Link from "next/link";
import { AlertTriangle, Users, ListTodo, History, Plus, BarChart3, MapPin } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatBRL } from "@/lib/utils";
import { VendaRowActions } from "./row-actions";
import { VendasBusca } from "./busca-client";
import type { Prisma } from "@prisma/client";

const PAGE_SIZE = 10; // exibe apenas as ultimas 10 vendas por pagina

export default async function VendasPage({
  searchParams,
}: {
  searchParams?: { busca?: string; page?: string };
}) {
  const session = await requireRole(["VENDAS", "GESTAO", "FINANCEIRO"]);
  // GESTAO e FINANCEIRO veem TODOS os pedidos; VENDAS ve apenas os proprios.
  const veTudo = session.role === "GESTAO" || session.role === "FINANCEIRO";

  const busca = searchParams?.busca?.trim() || "";
  const page = Math.max(1, Number(searchParams?.page) || 1);
  // Busca por Numero do Pedido OU Comanda (case-insensitive, parcial).
  const buscaFilter: Prisma.OrderWhereInput = busca
    ? {
        OR: [
          { orderNumber: { contains: busca, mode: "insensitive" } },
          { comandaNumber: { contains: busca, mode: "insensitive" } },
        ],
      }
    : {};

  // Restricao de escopo: VENDAS so ve os proprios pedidos; GESTAO/FINANCEIRO
  // veem todos. Pedidos CONCLUIDO saem daqui e ficam so no Historico.
  const where: Prisma.OrderWhereInput = {
    status: { not: "CONCLUIDO" },
    ...(veTudo ? {} : { sellerId: session.userId }),
    ...buscaFilter,
  };

  // Paginacao: 10 por pagina (as ultimas vendas primeiro).
  const totalOrders = await prisma.order.count({ where });
  const totalPages = Math.max(1, Math.ceil(totalOrders / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const orders = await prisma.order.findMany({
    where,
    include: { customer: true },
    orderBy: { createdAt: "desc" },
    skip: (pageSafe - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });

  // Preserva a busca ao paginar.
  const pageHref = (p: number) => {
    const sp = new URLSearchParams();
    if (busca) sp.set("busca", busca);
    if (p > 1) sp.set("page", String(p));
    const qs = sp.toString();
    return qs ? `/vendas?${qs}` : "/vendas";
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold text-vendas">Vendas</h1>
        <div className="flex gap-2">
          <Button asChild variant="outline"><Link href="/vendas/clientes"><Users className="h-4 w-4" /> Cadastro de Clientes</Link></Button>
          <Button asChild variant="outline"><Link href="/vendas/excursoes"><MapPin className="h-4 w-4" /> Cadastrar Excursão</Link></Button>
          <Button asChild variant="outline"><Link href="/vendas/tarefas"><ListTodo className="h-4 w-4" /> Tarefas Diárias</Link></Button>
          <Button asChild variant="outline"><Link href="/vendas/relatorio-campanha"><BarChart3 className="h-4 w-4" /> Relatório de Campanha</Link></Button>
          <Button asChild variant="outline"><Link href="/vendas/historico"><History className="h-4 w-4" /> Histórico de Vendas</Link></Button>
          <Button asChild variant="vendas"><Link href="/vendas/novo"><Plus className="h-4 w-4" /> Novo pedido</Link></Button>
        </div>
      </div>

      <VendasBusca defaultBusca={busca} />

      <Card>
        <CardHeader><CardTitle>{veTudo ? "Pedidos" : "Meus pedidos"}</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b text-left text-muted-foreground">
                <tr>
                  {/* Coluna estreita: o numero do pedido nao precisa de largura
                      flexivel — encolhe para o conteudo e libera espaco. */}
                  <th className="w-px whitespace-nowrap border-r border-border py-2 pr-4">Pedido</th>
                  {/* "N° de Peças no Pedido" — imediatamente ao lado do numero. */}
                  <th className="w-px whitespace-nowrap border-r border-border py-2 pl-4 pr-4 text-right">N° Peças</th>
                  <th className="border-r border-border py-2 pl-4 pr-4">Comanda</th>
                  <th className="border-r border-border py-2 pl-4 pr-4">Cliente</th>
                  <th className="border-r border-border py-2 pl-4 pr-4">Total</th>
                  <th className="border-r border-border py-2 pl-4 pr-4">Status</th>
                  {/* Acoes visiveis para todos: a vendedora pode EDITAR os proprios
                      pedidos (a lista ja e restrita a eles). Excluir segue so na Gestao. */}
                  <th className="py-2 pl-4 pr-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => {
                  // Pendencia ATIVA do Financeiro: texto presente e nao resolvido.
                  const issueAtivo = o.financeIssue && !o.financeIssueResolvedAt ? o.financeIssue : null;
                  return (
                  <tr key={o.id} className={`border-b border-border last:border-0 transition-colors ${
                    issueAtivo ? "bg-destructive/10 hover:bg-destructive/15" : "hover:bg-secondary/50"
                  }`}>
                    <td className="w-px whitespace-nowrap border-r border-border py-2 pr-4 font-data">
                      <span className="flex items-center gap-1.5">
                        {issueAtivo && <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive" />}
                        {o.orderNumber}
                      </span>
                    </td>
                    <td className="w-px whitespace-nowrap border-r border-border py-2 pl-4 pr-4 text-right font-data">
                      {o.pieceCount > 0 ? o.pieceCount : "—"}
                    </td>
                    <td className="border-r border-border py-2 pl-4 pr-4 font-data">{o.comandaNumber ?? "—"}</td>
                    <td className="border-r border-border py-2 pl-4 pr-4">{o.customer.name}</td>
                    <td className="border-r border-border py-2 pl-4 pr-4">{formatBRL(o.total.toString())}</td>
                    <td className="border-r border-border py-2 pl-4 pr-4"><StatusBadge status={o.status} /></td>
                    <td className="py-2 pl-4 pr-4">
                      <VendaRowActions orderId={o.id} orderNumber={o.orderNumber} canDelete={session.role === "GESTAO"} issue={issueAtivo} />
                    </td>
                  </tr>
                  );
                })}
                {orders.length === 0 && (
                  <tr><td colSpan={7} className="py-6 text-center text-muted-foreground">
                    {busca ? `Nenhum pedido encontrado para "${busca}".` : "Nenhum pedido ainda."}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>

          {totalOrders > 0 && (
            <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
              <span>
                Página {pageSafe} de {totalPages} · {totalOrders} pedido{totalOrders === 1 ? "" : "s"}
              </span>
              <div className="flex gap-2">
                {pageSafe > 1 ? (
                  <Button asChild variant="outline" size="sm"><Link href={pageHref(pageSafe - 1)}>Anterior</Link></Button>
                ) : (
                  <Button variant="outline" size="sm" disabled>Anterior</Button>
                )}
                {pageSafe < totalPages ? (
                  <Button asChild variant="outline" size="sm"><Link href={pageHref(pageSafe + 1)}>Próxima</Link></Button>
                ) : (
                  <Button variant="outline" size="sm" disabled>Próxima</Button>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
