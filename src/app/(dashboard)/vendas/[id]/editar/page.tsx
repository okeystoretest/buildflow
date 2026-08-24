import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BackButton } from "@/components/shared/back-button";
import { sortOperationsByCode } from "@/lib/utils";
import { EditarPedidoForm } from "./form";

// Edição de pedido — mesmo formulário do Novo Pedido (completo).
// - GESTAO e FINANCEIRO: editam qualquer pedido.
// - VENDAS: edita apenas os PROPRIOS pedidos (escopo verificado abaixo).
export default async function EditarPedidoPage({ params }: { params: { id: string } }) {
  const session = await requireRole(["GESTAO", "VENDAS", "FINANCEIRO"]);

  const [order, stores, orderTypes, operations, paymentMethods, shippingMethods, banks, campaigns, me, allOriginStores, excursoes] =
    await Promise.all([
      prisma.order.findUnique({
        where: { id: params.id },
        include: {
          customer: true,
          paymentProofs: { orderBy: { createdAt: "asc" } },
          campaignItems: { orderBy: { createdAt: "asc" } },
        },
      }),
      prisma.store.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
      prisma.orderType.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
      prisma.operation.findMany({ where: { active: true } }),
      prisma.paymentMethod.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
      prisma.shippingMethod.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
      prisma.bank.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
      prisma.campaign.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
      prisma.user.findUnique({
        where: { id: session.userId },
        include: { originStores: { where: { active: true }, orderBy: { name: "asc" } } },
      }),
      prisma.originStore.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
      prisma.excursao.findMany({
        where: { active: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true, address: true, cutoffTime: true, operatingDays: true },
      }),
    ]);

  if (!order) notFound();

  // Garante que a excursao atual do pedido apareca no dropdown mesmo se
  // inativada depois (para nao "sumir" o vinculo ao abrir a edicao).
  const excursoesList = [...excursoes];
  if (order.excursaoId && !excursoesList.some((e) => e.id === order.excursaoId)) {
    const atual = await prisma.excursao.findUnique({
      where: { id: order.excursaoId },
      select: { id: true, name: true, address: true, cutoffTime: true, operatingDays: true },
    });
    if (atual) excursoesList.unshift(atual);
  }

  // Paridade com o Novo Pedido: VENDAS vê apenas as lojas de origem atreladas;
  // GESTAO e FINANCEIRO veem todas as ativas. Garante que a de origem do pedido
  // apareça na lista mesmo que não esteja mais atrelada ao usuário.
  const originStoresBase = session.role === "VENDAS" ? (me?.originStores ?? []) : allOriginStores;
  const originStores = [...originStoresBase];
  if (order.originStoreId && !originStores.some((s) => s.id === order.originStoreId)) {
    const atual = allOriginStores.find((s) => s.id === order.originStoreId);
    if (atual) originStores.unshift(atual);
  }

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
              pieceCount: order.pieceCount ?? 0,
              customerId: order.customerId,
              storeId: order.storeId,
              originStoreId: order.originStoreId ?? "",
              orderTypeId: order.orderTypeId,
              operationId: order.operationId,
              paymentMethodId: order.paymentMethodId ?? "",
              shippingMethodId: order.shippingMethodId,
              bankId: order.bankId ?? "",
              orderValue: Number(order.orderValue),
              freight: Number(order.freight),
              notes: order.notes ?? "",
              paymentNotes: order.paymentNotes ?? "",
              shipCep: order.shipCep ?? "",
              shipStreet: order.shipStreet ?? "",
              shipNumber: order.shipNumber ?? "",
              shipDistrict: order.shipDistrict ?? "",
              shipCity: order.shipCity ?? "",
              shipState: order.shipState ?? "",
              excursaoId: order.excursaoId ?? "",
              campaignId: order.campaignId ?? "",
              itemCount: order.itemCount ?? 0,
              campaignDiscount: order.campaignDiscount ?? false,
              campaignItems: order.campaignItems.map((it) => ({
                campaignId: it.campaignId,
                reference: it.reference,
                quantity: it.quantity,
                value: Number(it.value),
              })),
            }}
            existingProofs={order.paymentProofs.map((p) => ({ id: p.id, filePath: p.filePath }))}
            selectedCustomer={order.customer ? { id: order.customer.id, code: order.customer.code, name: order.customer.name } : null}
            stores={stores.map((s) => ({ id: s.id, name: s.name }))}
            originStores={originStores.map((s) => ({ id: s.id, name: s.name }))}
            orderTypes={orderTypes.map((s) => ({ id: s.id, name: s.name }))}
            operations={sortOperationsByCode(operations).map((o) => ({ id: o.id, name: `${o.code} - ${o.name}` }))}
            paymentMethods={paymentMethods.map((p) => ({ id: p.id, name: p.name }))}
            shippingMethods={shippingMethods.map((s) => ({ id: s.id, name: s.name, requiresAddress: s.requiresAddress }))}
            banks={banks.map((b) => ({ id: b.id, name: b.name }))}
            campaigns={campaigns.map((c) => ({ id: c.id, name: c.name }))}
            canEditFinance={session.role === "GESTAO" || session.role === "FINANCEIRO"}
          />
        </CardContent>
      </Card>
    </div>
  );
}
