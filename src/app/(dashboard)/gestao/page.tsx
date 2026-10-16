import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { GestaoTabs } from "./tabs-client";
import { sortOperationsByCode } from "@/lib/utils";

export default async function GestaoPage(
  props: {
    searchParams?: Promise<{ goalMonth?: string; goalYear?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  await requireRole(["GESTAO"]);

  const now = new Date();
  const curMonth = now.getMonth() + 1;
  const curYear = now.getFullYear();

  // Periodo das metas exibidas. Vem da URL (?goalMonth&goalYear) para permitir
  // consultar historico de meses passados. Sem parametro, usa o mes corrente.
  const gm = Number(searchParams?.goalMonth);
  const gy = Number(searchParams?.goalYear);
  const goalMonth = gm >= 1 && gm <= 12 ? gm : curMonth;
  const goalYear = gy > 2000 && gy < 3000 ? gy : curYear;

  const [users, stores, orderTypes, operations, shippingMethods, goals, campaigns, customers, stageLimits, originStores, selectPlans] =
    await Promise.all([
      prisma.user.findMany({ orderBy: { name: "asc" }, include: { originStores: { select: { id: true } } } }),
      prisma.store.findMany({ orderBy: { name: "asc" } }),
      prisma.orderType.findMany({ orderBy: { name: "asc" } }),
      prisma.operation.findMany({}),
      prisma.shippingMethod.findMany({ orderBy: { name: "asc" } }),
      prisma.salesGoal.findMany({
        where: { month: goalMonth, year: goalYear },
        include: { user: true, campaign: true },
        orderBy: [{ user: { name: "asc" } }, { campaignId: "asc" }],
      }),
      prisma.campaign.findMany({ orderBy: { createdAt: "desc" } }),
      // Base tem dezenas de milhares de clientes: aqui carregamos apenas uma
      // amostra. A gestao completa (com busca e paginacao) fica em /vendas/clientes.
      prisma.customer.findMany({ orderBy: { name: "asc" }, take: 20 }),
      prisma.stageTimeLimit.findMany(),
      prisma.originStore.findMany({ orderBy: { name: "asc" } }),
      // Planos do Select. Vem TODOS (inclusive inativos): esta e a tela que
      // reativa um plano retirado de circulacao. A contagem de contratos
      // acompanha porque e ela que diz se o plano pode ser excluido — e que
      // avisa quem edita que contrato vendido nao se reescreve.
      prisma.selectPlan.findMany({
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        include: {
          benefits: { orderBy: { sortOrder: "asc" }, select: { text: true } },
          _count: { select: { contracts: true } },
        },
      }),
    ]);

  const activeCampaigns = campaigns.filter((c) => c.active);

  const sellers = users.filter((u) => u.role === "VENDAS");

  const isCurrentPeriod = goalMonth === curMonth && goalYear === curYear;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Gestão — Parâmetros</h1>
      <GestaoTabs
        users={users.map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, active: u.active, salesModel: u.salesModel, originStoreIds: u.originStores.map((s) => s.id), pixKey: u.pixKey ?? null, phone: u.phone ?? null }))}
        stores={stores.map((s) => ({ id: s.id, name: s.name, active: s.active }))}
        originStores={originStores.map((s) => ({ id: s.id, name: s.name, active: s.active, simplifiedFlow: s.simplifiedFlow }))}
        orderTypes={orderTypes.map((s) => ({ id: s.id, name: s.name, active: s.active }))}
        operations={sortOperationsByCode(operations).map((o) => ({ id: o.id, code: o.code, name: o.name, active: o.active }))}
        shippingMethods={shippingMethods.map((s) => ({ id: s.id, name: s.name, active: s.active }))}
        sellers={sellers.map((u) => ({ id: u.id, name: u.name, salesModel: u.salesModel }))}
        goals={goals.map((g) => ({ id: g.id, userName: g.user.name, amount: Number(g.amount), targetItems: g.targetItems, month: g.month, year: g.year, scope: g.scope, campaignName: g.campaign?.name ?? null }))}
        campaigns={campaigns.map((c) => ({ id: c.id, name: c.name, active: c.active }))}
        activeCampaigns={activeCampaigns.map((c) => ({ id: c.id, name: c.name }))}
        customers={customers.map((c) => ({
          id: c.id, code: c.code, name: c.name,
          cep: c.cep, street: c.street, district: c.district,
          city: c.city, state: c.state, contact: c.contact,
        }))}
        currentMonth={curMonth}
        currentYear={curYear}
        goalPeriodMonth={goalMonth}
        goalPeriodYear={goalYear}
        isCurrentGoalPeriod={isCurrentPeriod}
        stageLimits={stageLimits.map((s) => ({ status: s.status, limitMinutes: s.limitMinutes }))}
        selectPlans={selectPlans.map((p) => ({
          id: p.id,
          name: p.name,
          validityMonths: p.validityMonths,
          monthlyAmount: p.monthlyAmount == null ? null : Number(p.monthlyAmount),
          minMonthlyPurchase: p.minMonthlyPurchase == null ? null : Number(p.minMonthlyPurchase),
          editableValues: p.editableValues,
          active: p.active,
          benefits: p.benefits.map((b) => b.text),
          contractCount: p._count.contracts,
        }))}
      />
    </div>
  );
}
