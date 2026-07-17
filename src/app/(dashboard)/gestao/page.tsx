import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { GestaoTabs } from "./tabs-client";
import { sortOperationsByCode } from "@/lib/utils";

export default async function GestaoPage({
  searchParams,
}: {
  searchParams?: { goalMonth?: string; goalYear?: string };
}) {
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

  const [users, stores, orderTypes, operations, shippingMethods, goals, campaigns, customers, stageLimits] =
    await Promise.all([
      prisma.user.findMany({ orderBy: { name: "asc" } }),
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
    ]);

  const activeCampaigns = campaigns.filter((c) => c.active);

  const sellers = users.filter((u) => u.role === "VENDAS");

  const isCurrentPeriod = goalMonth === curMonth && goalYear === curYear;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Gestão — Parâmetros</h1>
      <GestaoTabs
        users={users.map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, active: u.active, salesModel: u.salesModel }))}
        stores={stores.map((s) => ({ id: s.id, name: s.name, active: s.active }))}
        orderTypes={orderTypes.map((s) => ({ id: s.id, name: s.name, active: s.active }))}
        operations={sortOperationsByCode(operations).map((o) => ({ id: o.id, code: o.code, name: o.name, active: o.active }))}
        shippingMethods={shippingMethods.map((s) => ({ id: s.id, name: s.name, active: s.active }))}
        sellers={sellers.map((u) => ({ id: u.id, name: u.name, salesModel: u.salesModel }))}
        goals={goals.map((g) => ({ id: g.id, userName: g.user.name, amount: Number(g.amount), targetItems: g.targetItems, month: g.month, year: g.year, scope: g.scope, campaignName: g.campaign?.name ?? null }))}
        campaigns={campaigns.map((c) => ({ id: c.id, name: c.name, active: c.active }))}
        activeCampaigns={activeCampaigns.map((c) => ({ id: c.id, name: c.name }))}
        customers={customers.map((c) => ({ id: c.id, code: c.code, name: c.name }))}
        currentMonth={curMonth}
        currentYear={curYear}
        goalPeriodMonth={goalMonth}
        goalPeriodYear={goalYear}
        isCurrentGoalPeriod={isCurrentPeriod}
        stageLimits={stageLimits.map((s) => ({ status: s.status, limitMinutes: s.limitMinutes }))}
      />
    </div>
  );
}
