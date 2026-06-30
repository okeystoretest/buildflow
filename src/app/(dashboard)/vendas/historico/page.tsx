import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { formatBRL } from "@/lib/utils";
import { BackButton } from "@/components/shared/back-button";
import { HistoricoFiltros } from "./filtros-client";
import { HistoricoList, type HistoricoItem } from "./historico-list";

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
      <BackButton href="/vendas" />
      <h1 className="text-2xl font-bold text-vendas">Histórico de Pedidos</h1>

      <HistoricoFiltros defaultDe={de} defaultAte={ate} defaultComanda={comanda} />

      <p className="text-sm text-muted-foreground">
        {orders.length} pedido(s) encontrado(s) entre {new Date(de).toLocaleDateString("pt-BR")} e {new Date(ate).toLocaleDateString("pt-BR")}.
      </p>

      {orders.length === 0 && (
        <Card><CardContent className="py-8 text-center text-muted-foreground">Nenhum pedido no período/filtro.</CardContent></Card>
      )}

      <HistoricoList orders={items} />
    </div>
  );
}
