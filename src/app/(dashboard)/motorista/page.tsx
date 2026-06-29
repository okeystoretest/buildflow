import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { EntregaCard } from "./delivery-card";
import { MOTORISTA_VISIBLE } from "@/lib/order-flow";

export default async function MotoristaPage() {
  const session = await requireRole(["MOTORISTA", "GESTAO"]);

  // Restricao de dashboard: motorista so ve Processando, Enviado, Em Rota, Entregue.
  const orders = await prisma.order.findMany({
    where: {
      status: { in: [...MOTORISTA_VISIBLE] },
      ...(session.role === "GESTAO" ? {} : { delivery: { driverId: session.userId } }),
    },
    include: { customer: true, delivery: true },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div className="mx-auto max-w-md space-y-6">
      <h1 className="text-2xl font-bold text-motorista">Minhas entregas</h1>
      <div className="space-y-4">
        {orders.map((o, i) => (
          <EntregaCard key={o.id} index={i} order={{
            id: o.id,
            status: o.status,
            orderNumber: o.orderNumber,
            comandaNumber: o.comandaNumber,
            customer: o.customer.name,
            address: "—",
            city: "",
            deliveryStatus: o.delivery?.status ?? "AGUARDANDO",
          }} />
        ))}
        {orders.length === 0 && (
          <Card><CardContent className="py-8 text-center text-muted-foreground">Nenhuma entrega no momento.</CardContent></Card>
        )}
      </div>
    </div>
  );
}
