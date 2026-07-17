import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { EntregaCard, type DriverOrderView } from "./delivery-card";
import { MOTORISTA_COLUMNS, STATUS_LABEL, STATUS_STYLE } from "@/lib/order-flow";
import type { OrderStatus } from "@prisma/client";

// Coluna virtual (não é status do enum): pedidos ENVIADO ainda sem motorista,
// disponíveis para qualquer motorista pegar.
const OPEN_COLUMN = "AGUARDANDO_ENTREGADOR" as const;

export default async function MotoristaPage() {
  const session = await requireRole(["MOTORISTA", "GESTAO"]);

  // 1) Pedidos EM ABERTO (ENVIADO sem driver): visíveis a TODOS os motoristas.
  const openOrders = await prisma.order.findMany({
    where: { status: "ENVIADO", delivery: { driverId: null } },
    include: { customer: true },
    orderBy: { updatedAt: "desc" },
  });

  // 2) Entregas do motorista (ou todas, se Gestão) já com dono.
  const myOrders = await prisma.order.findMany({
    where: {
      status: { in: [...MOTORISTA_COLUMNS] },
      delivery: session.role === "GESTAO" ? { isNot: null } : { driverId: session.userId },
    },
    include: { customer: true },
    orderBy: { updatedAt: "desc" },
  });

  const toView = (o: (typeof myOrders)[number], open = false): DriverOrderView => ({
    id: o.id,
    status: o.status,
    orderNumber: o.orderNumber,
    comandaNumber: o.comandaNumber,
    customer: o.customer.name,
    customerCode: o.customer.code,
    notes: o.notes,
    isOpen: open,
  });

  const openViews = openOrders.map((o) => toView(o, true));
  const myViews = myOrders.map((o) => toView(o));

  const byStatus = (s: OrderStatus) => myViews.filter((v) => v.status === s);

  // Colunas exibidas: [Aguardando Entregador] + fluxo normal do motorista.
  const columns: Array<OrderStatus | typeof OPEN_COLUMN> = [OPEN_COLUMN, ...MOTORISTA_COLUMNS];

  return (
    <div className="mx-auto max-w-md space-y-6 pb-8 sm:max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold text-motorista">Minhas entregas</h1>
        <p className="text-sm text-muted-foreground">
          Pegue um pedido em aberto e siga: Enviado → Em Rota → Entregue.
        </p>
      </div>

      {/* Colunas do fluxo. Em telas pequenas empilham; no desktop lado a lado. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {columns.map((col) => {
          const isOpenCol = col === OPEN_COLUMN;
          const list = isOpenCol ? openViews : byStatus(col as OrderStatus);
          const header = isOpenCol
            ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40"
            : STATUS_STYLE[col as OrderStatus].header;
          const dot = isOpenCol ? "bg-amber-500" : STATUS_STYLE[col as OrderStatus].dot;
          const label = isOpenCol ? "Aguardando Entregador" : STATUS_LABEL[col as OrderStatus];
          return (
            <div key={col} className="space-y-3">
              <div className={`flex items-center justify-between rounded-lg border px-3 py-2 ${header}`}>
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <span className={`h-2 w-2 rounded-full ${dot}`} />
                  {label}
                </span>
                <span className="font-data rounded-full bg-background/60 px-2 text-xs">{list.length}</span>
              </div>
              <div className="space-y-3">
                {list.map((o, i) => (
                  <EntregaCard key={o.id} order={o} index={i} />
                ))}
                {list.length === 0 && (
                  <div className="rounded-xl border border-dashed border-border/60 py-6 text-center text-sm text-muted-foreground/60">
                    {isOpenCol ? "Nenhum pedido em aberto." : "Nenhuma entrega."}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
