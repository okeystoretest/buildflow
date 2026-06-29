import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AtribuirMotorista } from "./assign-client";

export default async function DistribuicaoPage() {
  await requireRole(["DISTRIBUICAO", "ADMIN"]);

  const [deliveries, drivers] = await Promise.all([
    prisma.delivery.findMany({
      where: { status: { in: ["AGUARDANDO", "ATRIBUIDA", "EM_ROTA"] } },
      include: { order: { include: { customer: true } }, driver: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.user.findMany({
      where: { role: "MOTORISTA", active: true },
      select: { id: true, name: true },
    }),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-distribuicao">Centro de Distribuicao</h1>

      <Card>
        <CardHeader>
          <CardTitle>Entregas em processamento</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {deliveries.map((d) => (
            <div
              key={d.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
            >
              <div>
                <p className="font-mono text-sm">{d.order.code}</p>
                <p className="text-sm text-muted-foreground">
                  {d.order.customer.name}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant="distribuicao">{d.status}</Badge>
                {d.status === "AGUARDANDO" ? (
                  <AtribuirMotorista deliveryId={d.id} drivers={drivers} />
                ) : (
                  <span className="text-sm">
                    {d.driver ? `Motorista: ${d.driver.name}` : "—"}
                  </span>
                )}
              </div>
            </div>
          ))}
          {deliveries.length === 0 && (
            <p className="text-center text-muted-foreground">
              Nenhuma entrega em aberto.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
