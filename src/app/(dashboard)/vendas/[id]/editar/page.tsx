import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BackButton } from "@/components/shared/back-button";
import { sortOperationsByCode } from "@/lib/utils";
import { EditarPedidoForm } from "./form";

// Edição de pedido — mesmo formulário do Novo Pedido (completo).
// - GESTAO: edita qualquer pedido.
// - VENDAS: edita apenas os PROPRIOS pedidos (escopo verificado abaixo).
export default async function EditarPedidoPage({ params }: { params: { id: string } }) {
  const session = await requireRole(["GESTAO", "VENDAS"]);

  const [order, stores, orderTypes, operations, paymentMethods, shippingMethods, banks, campaigns] =
    await Promise.all([
      prisma.order.findUnique({
        where: { id: params.id },
        include: { customer: true, paymentProofs: { orderBy: { createdAt: "asc" } } },
      }),
      prisma.store.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
      prisma.orderType.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
      prisma.operation.findMany({ where: { active: true } }),
      prisma.paymentMethod.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
      prisma.shippingMethod.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
      prisma.bank.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
      prisma.campaign.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    ]);

  if (!order) notFound();

  if (session.role === "VENDAS" && order.sellerId !== session.userId) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <BackButton />
      <Card>
        <CardHeader><CardTitle>Editar pedido {order.orderNumber}</CardTitle></CardHeader>
        <CardContent>
          <EditarPedidoForm
            order={{
              id: order.id,
              orderNumber: order.orderNumber,
              customerId: order.customerId,
              storeId: order.storeId,
              orderTypeId: order.orderTypeId,
              operationId: order.operationId,
              paymentMethodId: order.paymentMethodId ?? "",
              shippingMethodId: order.shippingMethodId,
              bankId: order.bankId ?? "",
              orderValue: Number(order.orderValue),
              freight: Number(order.freight),
              notes: order.notes ?? "",
              campaignId: order.campaignId ?? "",
              itemCount: order.itemCount ?? 0,
            }}
            existingProofs={order.paymentProofs.map((p) => ({ id: p.id, filePath: p.filePath }))}
            selectedCustomer={order.customer ? { id: order.customer.id, code: order.customer.code, name: order.customer.name } : null}
            stores={stores.map((s) => ({ id: s.id, name: s.name }))}
            orderTypes={orderTypes.map((s) => ({ id: s.id, name: s.name }))}
            operations={sortOperationsByCode(operations).map((o) => ({ id: o.id, name: `${o.code} - ${o.name}` }))}
            paymentMethods={paymentMethods.map((p) => ({ id: p.id, name: p.name }))}
            shippingMethods={shippingMethods.map((s) => ({ id: s.id, name: s.name }))}
            banks={banks.map((b) => ({ id: b.id, name: b.name }))}
            campaigns={campaigns.map((c) => ({ id: c.id, name: c.name }))}
            canEditFinance={session.role === "GESTAO"}
          />
        </CardContent>
      </Card>
    </div>
  );
}
