import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BackButton } from "@/components/shared/back-button";
import { sortOperationsByCode } from "@/lib/utils";
import { NovoPedidoForm } from "./form";

export default async function NovoPedidoPage() {

  await requireRole(["VENDAS", "GESTAO"]);

  const [customers, stores, orderTypes, operations, paymentMethods, shippingMethods, banks, campaigns] =
    await Promise.all([
      prisma.customer.findMany({ orderBy: { name: "asc" } }),
      prisma.store.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
      prisma.orderType.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
      prisma.operation.findMany({ where: { active: true } }),
      prisma.paymentMethod.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
      prisma.shippingMethod.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
      prisma.bank.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
      // Campanhas ativas (qualquer vendedor pode vincular um pedido a elas).
      prisma.campaign.findMany({
        where: { active: true },
        orderBy: { name: "asc" },
      }),
    ]);

  return (
    <div className="mx-auto max-w-5xl">
      <BackButton href="/vendas" />
      <h1 className="mb-4 text-2xl font-bold text-vendas">Novo pedido</h1>
      <Card>
        <CardHeader><CardTitle>Dados do pedido</CardTitle></CardHeader>
        <CardContent>
          <NovoPedidoForm
            customers={customers.map((c) => ({ id: c.id, name: c.name }))}
            stores={stores.map((s) => ({ id: s.id, name: s.name }))}
            orderTypes={orderTypes.map((t) => ({ id: t.id, name: t.name }))}
            operations={sortOperationsByCode(operations).map((o) => ({ id: o.id, name: `${o.code} - ${o.name}` }))}
            paymentMethods={paymentMethods.map((p) => ({ id: p.id, name: p.name }))}
            shippingMethods={shippingMethods.map((s) => ({ id: s.id, name: s.name }))}
            banks={banks.map((b) => ({ id: b.id, name: b.name }))}
            campaigns={campaigns.map((c) => ({ id: c.id, name: c.name }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
