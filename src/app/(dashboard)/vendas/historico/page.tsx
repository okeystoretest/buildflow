import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatBRL } from "@/lib/utils";
import { BackButton } from "@/components/shared/back-button";
import { HistoricoFiltros } from "./filtros-client";

function firstDayOfMonth(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}
function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export default async function HistoricoPage({
  searchParams,
}: {
  searchParams: { comanda?: string; de?: string; ate?: string };
}) {
  const session = await requireRole(["VENDAS", "GESTAO"]);

  // Padrao: mes atual.
  const de = searchParams.de || firstDayOfMonth();
  const ate = searchParams.ate || todayStr();
  const comanda = searchParams.comanda?.trim() || "";

  const dataInicio = new Date(de + "T00:00:00");
  const dataFim = new Date(ate + "T23:59:59");

  const orders = await prisma.order.findMany({
    where: {
      status: "CONCLUIDO",
      ...(session.role === "GESTAO" ? {} : { sellerId: session.userId }),
      updatedAt: { gte: dataInicio, lte: dataFim },
      ...(comanda ? { comandaNumber: { contains: comanda, mode: "insensitive" } } : {}),
    },
    include: {
      customer: true,
      delivery: { include: { proofs: true, driver: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <BackButton href="/vendas" />
      <h1 className="text-2xl font-bold text-vendas">Histórico de Pedidos</h1>

      <HistoricoFiltros defaultDe={de} defaultAte={ate} defaultComanda={comanda} />

      <p className="text-sm text-muted-foreground">
        {orders.length} pedido(s) encontrado(s) entre {new Date(de).toLocaleDateString("pt-BR")} e {new Date(ate).toLocaleDateString("pt-BR")}.
      </p>

      {orders.length === 0 && (
        <Card><CardContent className="py-8 text-center text-muted-foreground">Nenhum pedido no período/filtro.</CardContent></Card>
      )}

      {orders.map((o) => (
        <Card key={o.id} className="animate-fade-in-up">
          <CardHeader>
            <CardTitle className="text-base">
              Pedido {o.orderNumber}{o.comandaNumber && ` · Comanda ${o.comandaNumber}`} — {o.customer.name}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="font-data">Total: {formatBRL(o.total.toString())}</p>
            <p>Motorista: {o.delivery?.driver?.name ?? "—"}</p>
            <div className="flex flex-wrap gap-4">
              {o.paymentProofPath && <a href={o.paymentProofPath} target="_blank" rel="noreferrer" className="text-primary underline">Comprovante pagamento</a>}
              {o.invoicePath && <a href={o.invoicePath} target="_blank" rel="noreferrer" className="text-primary underline">Nota Fiscal</a>}
            </div>
            {o.delivery && o.delivery.proofs.length > 0 && (
              <div>
                <p className="mb-1 font-medium">Comprovante de entrega:</p>
                <div className="flex gap-2">
                  {o.delivery.proofs.map((p: { id: string; filePath: string }) => (
                    <a key={p.id} href={p.filePath} target="_blank" rel="noreferrer">
                      <img src={p.filePath} alt="entrega" className="h-28 w-28 rounded-lg object-cover" />
                    </a>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
