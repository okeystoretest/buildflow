import { prisma } from "@/lib/prisma";

export interface RankRow {
  nome: string;
  vendido: number;
  meta: number;
  pct: number;
}
export interface CampaignData {
  id: string; name: string; volume: number; receita: number;
}
export interface CampaignPerfRow {
  nome: string;
  meta: number;   // meta de itens do vendedor vinculada a esta campanha
  qtd: number;    // peças vendidas pelo vendedor em pedidos desta campanha
  valor: number;  // R$ gerado por esse vendedor na campanha
  pct: number;    // % da meta de itens (qtd / meta)
}
export interface CampaignPerf {
  id: string;
  name: string;
  rows: CampaignPerfRow[];
}
export interface RankData {
  month: number;
  year: number;
  metaGeral: number;
  realizadoGeral: number; // soma faturada no MÊS corrente (base do progresso)
  metaGeralPct: number;   // progresso da meta geral (realizadoGeral / metaGeral)
  goalsCount: number;
  maiorSemana: { total: number; nome: string } | null;
  maiorMes: { total: number; nome: string } | null;
  rankGeral: RankRow[];
  rankVarejo: RankRow[];
  rankAtacado: RankRow[];
  campaigns: CampaignData[];
  campaignPerf: CampaignPerf[];
  updatedAt: string;
}

// Calcula todos os dados do Rank de Vendas. Usado pela pagina e pela API.
export async function computeRankData(): Promise<RankData> {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const inicioMes = new Date(year, now.getMonth(), 1);
  const inicioSemana = new Date(now);
  inicioSemana.setDate(now.getDate() - now.getDay());
  inicioSemana.setHours(0, 0, 0, 0);

  const faturados = await prisma.order.findMany({
    where: {
      comandaNumber: { not: null },
      status: { notIn: ["ESTORNO", "ESTORNO_PARCIAL", "CANCELADO"] },
    },
    include: { seller: true },
  });

  // Metas Gerais = apenas as nao vinculadas a campanha (campaignId null).
  const goals = await prisma.salesGoal.findMany({ where: { month, year } });
  const goalsGerais = goals.filter((g) => !g.campaignId);
  const metaGeral = goalsGerais.reduce((a, g) => a + Number(g.amount), 0);

  const doMes = faturados.filter((o) => new Date(o.createdAt) >= inicioMes);
  const daSemana = faturados.filter((o) => new Date(o.createdAt) >= inicioSemana);
  // Progresso da Meta Geral: realizado é o faturado no MÊS corrente (mesma
  // janela da meta), não o acumulado histórico. Evita % inflado.
  const realizadoGeral = doMes.reduce((a, o) => a + Number(o.total), 0);
  const metaGeralPct = metaGeral > 0 ? Math.round((realizadoGeral / metaGeral) * 100) : 0;
  const maior = (arr: typeof faturados) =>
    arr.reduce<{ total: number; nome: string } | null>((acc, o) => {
      const t = Number(o.total);
      return !acc || t > acc.total ? { total: t, nome: o.seller.name } : acc;
    }, null);

  // Acumula por vendedor SOMENTE o faturado no mês corrente, para casar com a
  // meta mensal e o progresso ficar correto.
  const porVendedor = new Map<string, { nome: string; scope: string | null; total: number }>();
  for (const o of doMes) {
    const cur = porVendedor.get(o.sellerId) ?? { nome: o.seller.name, scope: o.seller.salesModel, total: 0 };
    cur.total += Number(o.total);
    porVendedor.set(o.sellerId, cur);
  }
  // Meta por vendedor: usa as metas Gerais (escopo do vendedor).
  const metaPorVendedor = new Map<string, number>();
  for (const g of goalsGerais) metaPorVendedor.set(g.userId + g.scope, Number(g.amount));

  const buildRank = (scope: "VAREJO" | "ATACADO" | null): RankRow[] =>
    [...porVendedor.entries()]
      .filter(([, v]) => (scope ? v.scope === scope : true))
      .map(([id, v]) => {
        // No painel Geral (scope null), usa a meta do vendedor pelo escopo dele.
        const escopoMeta = scope ?? v.scope;
        const meta = escopoMeta ? (metaPorVendedor.get(id + escopoMeta) ?? 0) : 0;
        return { nome: v.nome, vendido: v.total, meta, pct: meta > 0 ? Math.round((v.total / meta) * 100) : 0 };
      })
      .sort((a, b) => b.vendido - a.vendido);

  // Campanhas ativas + pedidos vinculados + metas (SalesGoal) vinculadas.
  const campaignsRaw = await prisma.campaign.findMany({
    where: { active: true },
    include: {
      orders: { where: { comandaNumber: { not: null } }, include: { seller: true } },
      goals: { where: { month, year }, include: { user: true } },
    },
    orderBy: { name: "asc" },
  });

  const campaigns: CampaignData[] = campaignsRaw.map((c) => ({
    id: c.id,
    name: c.name,
    volume: c.orders.reduce((a: number, o: any) => a + (o.itemCount ?? 0), 0),
    receita: c.orders.reduce((a: number, o: any) => a + Number(o.total), 0),
  }));

  // Performance por campanha (linha por vendedor com meta vinculada ou venda).
  const campaignPerf: CampaignPerf[] = campaignsRaw.map((c: any) => {
    const porVend = new Map<string, { nome: string; meta: number; qtd: number; valor: number }>();
    // inicia pelos vendedores com meta vinculada a esta campanha (meta = itens)
    for (const g of c.goals) {
      const cur = porVend.get(g.userId) ?? { nome: g.user.name, meta: 0, qtd: 0, valor: 0 };
      cur.meta += g.targetItems ?? 0;
      porVend.set(g.userId, cur);
    }
    // soma pedidos vinculados a campanha
    for (const o of c.orders) {
      const cur = porVend.get(o.sellerId) ?? { nome: o.seller.name, meta: 0, qtd: 0, valor: 0 };
      cur.qtd += o.itemCount ?? 0;
      cur.valor += Number(o.total);
      porVend.set(o.sellerId, cur);
    }
    const rows: CampaignPerfRow[] = [...porVend.values()]
      .map((v) => {
        const pct = v.meta > 0 ? Math.round((v.qtd / v.meta) * 100) : 0;
        return { nome: v.nome, meta: v.meta, qtd: v.qtd, valor: v.valor, pct };
      })
      .sort((a, b) => b.pct - a.pct || b.qtd - a.qtd);
    return { id: c.id, name: c.name, rows };
  });

  return {
    month, year, metaGeral, realizadoGeral, metaGeralPct, goalsCount: goalsGerais.length,
    maiorSemana: maior(daSemana), maiorMes: maior(doMes),
    rankGeral: buildRank(null), rankVarejo: buildRank("VAREJO"), rankAtacado: buildRank("ATACADO"),
    campaigns, campaignPerf, updatedAt: new Date().toISOString(),
  };
}
