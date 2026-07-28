import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BackButton } from "@/components/shared/back-button";
import { sortOperationsByCode } from "@/lib/utils";
import { NovoPedidoForm } from "./form";

export default async function NovoPedidoPage() {

  const session = await requireRole(["VENDAS", "GESTAO"]);

  // NOTA: a lista de clientes NAO e carregada aqui. Com dezenas de milhares
  // de registros isso geraria um HTML gigante. O formulario usa o
  // CustomerCombobox, que busca sob demanda em /api/customers/search.
  const [stores, orderTypes, operations, shippingMethods, campaigns, me, allOriginStores] =
    await Promise.all([
      prisma.store.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
      prisma.orderType.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
      prisma.operation.findMany({ where: { active: true } }),
      prisma.shippingMethod.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
      // Campanhas ativas (qualquer vendedor pode vincular um pedido a elas).
      prisma.campaign.findMany({
        where: { active: true },
        orderBy: { name: "asc" },
      }),
      // Lojas de Origem atreladas ao usuario logado (para VENDAS).
      prisma.user.findUnique({
        where: { id: session.userId },
        select: { originStores: { where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } } },
      }),
      // GESTAO nao tem lojas atreladas; pode escolher qualquer loja ativa.
      prisma.originStore.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    ]);

  // VENDAS ve apenas as lojas atreladas; GESTAO ve todas as ativas.
  const originStores =
    session.role === "GESTAO" ? allOriginStores : (me?.originStores ?? []);

  return (
    <div className="mx-auto max-w-5xl">
      <BackButton href="/vendas" />
      <h1 className="mb-4 text-2xl font-bold text-vendas">Novo pedido</h1>
      <Card>
        <CardHeader><CardTitle>Dados do pedido</CardTitle></CardHeader>
        <CardContent>
          <NovoPedidoForm
            stores={stores.map((s) => ({ id: s.id, name: s.name }))}
            originStores={originStores.map((s) => ({ id: s.id, name: s.name }))}
            orderTypes={orderTypes.map((t) => ({ id: t.id, name: t.name }))}
            operations={sortOperationsByCode(operations).map((o) => ({ id: o.id, name: `${o.code} - ${o.name}` }))}
            shippingMethods={shippingMethods.map((s) => ({ id: s.id, name: s.name }))}
            campaigns={campaigns.map((c) => ({ id: c.id, name: c.name }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
