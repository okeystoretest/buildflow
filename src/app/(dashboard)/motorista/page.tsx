import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { EntregaCard, type DriverOrderView } from "./delivery-card";
import { MOTORISTA_COLUMNS, STATUS_LABEL, STATUS_STYLE } from "@/lib/order-flow";
import type { OrderStatus } from "@prisma/client";

export default async function MotoristaPage() {
  const session = await requireRole(["MOTORISTA", "GESTAO"]);

  // Fluxo restrito do motorista: apenas Enviado, Em Rota, Entregue.
  // Motorista vê só as próprias entregas; Gestão vê todas (supervisão).
  const orders = await prisma.order.findMany({
    where: {
      status: { in: [...MOTORISTA_COLUMNS] },
      ...(session.role === "GESTAO" ? {} : { delivery: { driverId: session.userId } }),
    },
    include: { customer: true },
    orderBy: { updatedAt: "desc" },
  });

  const views: DriverOrderView[] = orders.map((o) => ({
    id: o.id,
    status: o.status,
    orderNumber: o.orderNumber,
    comandaNumber: o.comandaNumber,
    customer: o.customer.name,
    customerCode: o.customer.code,
    notes: o.notes,
  }));

  const byStatus = (s: OrderStatus) => views.filter((v) => v.status === s);

  return (
    <div className="mx-auto max-w-md space-y-6 pb-8 sm:max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-motorista">Minhas entregas</h1>
        <p className="text-sm text-muted-foreground">
          Fluxo de entrega: Enviado → Em Rota → Entregue.
        </p>
      </div>

      {/* Colunas do fluxo. Em telas pequenas empilham; no desktop lado a lado. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {MOTORISTA_COLUMNS.map((status) => {
          const list = byStatus(status);
          const s = STATUS_STYLE[status];
          return (
            <div key={status} className="space-y-3">
              <div className={`flex items-center justify-between rounded-lg border px-3 py-2 ${s.header}`}>
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <span className={`h-2 w-2 rounded-full ${s.dot}`} />
                  {STATUS_LABEL[status]}
                </span>
                <span className="font-data rounded-full bg-background/60 px-2 text-xs">{list.length}</span>
              </div>
              <div className="space-y-3">
                {list.map((o, i) => (
                  <EntregaCard key={o.id} order={o} index={i} />
                ))}
                {list.length === 0 && (
                  <div className="rounded-xl border border-dashed border-border/60 py-6 text-center text-sm text-muted-foreground/60">
                    Nenhuma entrega.
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
