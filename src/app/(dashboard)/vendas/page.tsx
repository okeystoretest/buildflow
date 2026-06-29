import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatBRL } from "@/lib/utils";
import { VendaRowActions } from "./row-actions";

export default async function VendasPage() {
  const session = await requireRole(["VENDAS", "GESTAO"]);
  const isGestao = session.role === "GESTAO";

  // Restricao de escopo: vendedora so ve os proprios pedidos.
  // Pedidos CONCLUIDO saem daqui e ficam so no Historico.
  const orders = await prisma.order.findMany({
    where: {
      status: { not: "CONCLUIDO" },
      ...(isGestao ? {} : { sellerId: session.userId }),
    },
    include: { customer: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold text-vendas">Vendas</h1>
        <div className="flex gap-2">
          <Button asChild variant="outline"><Link href="/vendas/clientes">Clientes</Link></Button>
          <Button asChild variant="outline"><Link href="/vendas/historico">Histórico</Link></Button>
          <Button asChild variant="vendas"><Link href="/vendas/novo">Novo pedido</Link></Button>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle>Meus pedidos</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b text-left text-muted-foreground">
                <tr>
                  <th className="py-2 pr-4">Pedido</th>
                  <th className="py-2 pr-4">Comanda</th>
                  <th className="py-2 pr-4">Cliente</th>
                  <th className="py-2 pr-4">Total</th>
                  <th className="py-2 pr-4">Status</th>
                  {isGestao && <th className="py-2 pr-4 text-right">Ações</th>}
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id} className="border-b border-border last:border-0 transition-colors hover:bg-secondary/50">
                    <td className="py-2 pr-4 font-data">{o.orderNumber}</td>
                    <td className="py-2 pr-4 font-data">{o.comandaNumber ?? "—"}</td>
                    <td className="py-2 pr-4">{o.customer.name}</td>
                    <td className="py-2 pr-4">{formatBRL(o.total.toString())}</td>
                    <td className="py-2 pr-4"><StatusBadge status={o.status} /></td>
                    {isGestao && (
                      <td className="py-2 pr-4">
                        <VendaRowActions orderId={o.id} orderNumber={o.orderNumber} />
                      </td>
                    )}
                  </tr>
                ))}
                {orders.length === 0 && (
                  <tr><td colSpan={isGestao ? 6 : 5} className="py-6 text-center text-muted-foreground">Nenhum pedido ainda.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
