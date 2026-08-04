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
  comissao: number; // R$ de comissão da campanha (itens × taxa do escopo)
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
  isCurrent: boolean;     // true = mês/ano corrente (habilita "semana" e auto-refresh)
  metaGeral: number;
  realizadoGeral: number; // soma faturada no período selecionado (base do progresso)
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

// Parametro opcional de periodo. Sem ele, usa o mes/ano corrente.
export interface RankPeriod {
  month?: number; // 1-12
  year?: number;
}

// Calcula todos os dados do Rank de Vendas. Usado pela pagina e pela API.
// Se `period` vier com month/year validos, calcula para aquele mes fechado
// (do dia 1 ao ultimo dia do mes). Sem period, usa o mes corrente com a
// janela de "semana atual" ativa.
export async function computeRankData(period?: RankPeriod): Promise<RankData> {
  // Comissão de campanha por ITEM, conforme o modelo de venda da vendedora E se
  // o pedido foi marcado com desconto ("Possui desconto?" no formulário).
  // Regra de negócio:
  //             │ Sem desconto │ Com desconto
  //   Atacado   │    R$4,00    │    R$2,00
  //   Varejo    │    R$5,00    │    R$2,50
  // A dimensão do desconto é POR PEDIDO (Order.campaignDiscount), então a
  // comissão é apurada pedido a pedido — não dá para aplicar uma taxa única
  // sobre o total de itens do vendedor.
  const COMISSAO_POR_ITEM: Record<"VAREJO" | "ATACADO", { normal: number; desconto: number }> = {
    VAREJO: { normal: 5, desconto: 2.5 },
    ATACADO: { normal: 4, desconto: 2 },
  };
  const taxaItem = (
    scope: "VAREJO" | "ATACADO" | null,
    desconto: boolean,
  ): number => (scope ? (desconto ? COMISSAO_POR_ITEM[scope].desconto : COMISSAO_POR_ITEM[scope].normal) : 0);

  const now = new Date();
  const curMonth = now.getMonth() + 1;
  const curYear = now.getFullYear();

  // Valida e resolve o periodo alvo.
  const month =
    period?.month && period.month >= 1 && period.month <= 12 ? period.month : curMonth;
  const year =
    period?.year && period.year > 2000 && period.year < 3000 ? period.year : curYear;

  const isCurrent = month === curMonth && year === curYear;

  // Janela do mes alvo: [inicioMes, fimMes).
  const inicioMes = new Date(year, month - 1, 1);
  const fimMes = new Date(year, month, 1); // primeiro dia do mes seguinte

  // "Semana" so faz sentido no mes corrente. Em meses passados, a janela de
  // semana vira o mes inteiro (maiorSemana passa a refletir o mes fechado).
  const inicioSemana = new Date(now);
  inicioSemana.setDate(now.getDate() - now.getDay());
  inicioSemana.setHours(0, 0, 0, 0);

  // Base de calculo: TODOS os pedidos faturados (comanda gerada), exceto os
  // interrompidos. Nao ha filtro por campanha aqui de proposito:
  // REGRA DE NEGOCIO -> vendas de itens de CAMPANHA tambem contam no valor
  // total da Meta Geral (e no rank por vendedor). Nao adicionar filtro de
  // campaignId nesta query, senao a meta geral passa a ignorar essas vendas.
  // "Faturado" = pedido efetivamente confirmado como venda:
  //  - Fluxo PADRAO: teve comanda gerada pelo Financeiro (comandaNumber != null).
  //  - Fluxo SIMPLIFICADO: nao gera comanda; e confirmado quando o Financeiro
  //    marca como PAGO. A partir de PAGO (inclui EMBALADO/ENTREGUE) o pedido
  //    conta no ranking. Sem isso, vendas de loja simplificada ficam de fora.
  const faturados = await prisma.order.findMany({
    where: {
      status: { notIn: ["ESTORNO", "ESTORNO_PARCIAL", "CANCELADO"] },
      OR: [
        { comandaNumber: { not: null } },
        {
          originStore: { simplifiedFlow: true },
          status: { in: ["PAGO", "EMBALADO", "ENTREGUE", "CONCLUIDO"] },
        },
      ],
    },
    include: { seller: true },
  });

  // Metas Gerais = apenas as nao vinculadas a campanha (campaignId null).
  const goals = await prisma.salesGoal.findMany({ where: { month, year } });
  const goalsGerais = goals.filter((g) => !g.campaignId);
  const metaGeral = goalsGerais.reduce((a, g) => a + Number(g.amount), 0);

  // Pedidos do mes alvo: entre inicio e fim do mes selecionado.
  const doMes = faturados.filter((o) => {
    const d = new Date(o.createdAt);
    return d >= inicioMes && d < fimMes;
  });
  // "daSemana": no mes corrente = ultima semana; em mes passado = mes inteiro.
  const daSemana = isCurrent
    ? faturados.filter((o) => new Date(o.createdAt) >= inicioSemana)
    : doMes;

  // Progresso da Meta Geral: realizado é o faturado no MÊS selecionado (mesma
  // janela da meta), não o acumulado histórico. Evita % inflado.
  // Inclui os pedidos vinculados a CAMPANHA (regra de negocio): o valor da
  // venda de campanha soma normalmente no realizado da meta geral.
  // REGRA DE NEGÓCIO: o volume de vendas para ranking/metas NÃO inclui o frete.
  // O frete é repasse/custo pago pelo cliente, não receita ganha. Por isso o
  // cálculo usa `orderValue` (valor da mercadoria) e não `total` (= valor +
  // frete). Helper único para manter a regra consistente em todo o rank.
  const receita = (o: { orderValue: unknown }) => Number(o.orderValue);

  const realizadoGeral = doMes.reduce((a, o) => a + receita(o), 0);
  const metaGeralPct = metaGeral > 0 ? Math.round((realizadoGeral / metaGeral) * 100) : 0;
  const maior = (arr: typeof faturados) =>
    arr.reduce<{ total: number; nome: string } | null>((acc, o) => {
      const t = receita(o);
      return !acc || t > acc.total ? { total: t, nome: o.seller.name } : acc;
    }, null);

  // Acumula por vendedor SOMENTE o faturado no mês selecionado, para casar com
  // a meta mensal e o progresso ficar correto.
  const porVendedor = new Map<string, { nome: string; scope: string | null; total: number }>();
  for (const o of doMes) {
    const cur = porVendedor.get(o.sellerId) ?? { nome: o.seller.name, scope: o.seller.salesModel, total: 0 };
    cur.total += receita(o);
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
      orders: {
        where: { comandaNumber: { not: null } },
        include: { seller: true, campaignItems: true },
      },
      goals: { where: { month, year }, include: { user: true } },
    },
    orderBy: { name: "asc" },
  });

  // Filtra pedidos da campanha pelo mes selecionado (mesma janela do rank).
  const noMes = (dt: Date | string) => {
    const d = new Date(dt);
    return d >= inicioMes && d < fimMes;
  };

  const campaigns: CampaignData[] = campaignsRaw.map((c) => {
    const ordersMes = c.orders.filter((o: any) => noMes(o.createdAt));
    return {
      id: c.id,
      name: c.name,
      volume: ordersMes.reduce((a: number, o: any) => a + (o.itemCount ?? 0), 0),
      // Receita da campanha também sem frete (mesma regra do ranking).
      receita: ordersMes.reduce((a: number, o: any) => a + Number(o.orderValue), 0),
    };
  });

  // Performance por campanha (linha por vendedor com meta vinculada ou venda).
  const campaignPerf: CampaignPerf[] = campaignsRaw.map((c: any) => {
    // `comissao` acumula pedido a pedido porque a taxa depende do desconto de
    // CADA pedido (Order.campaignDiscount), não de um valor fixo por vendedor.
    const porVend = new Map<string, { nome: string; scope: "VAREJO" | "ATACADO" | null; meta: number; qtd: number; valor: number; comissao: number }>();
    // inicia pelos vendedores com meta vinculada a esta campanha (meta = itens)
    for (const g of c.goals) {
      const cur = porVend.get(g.userId) ?? { nome: g.user.name, scope: g.user.salesModel ?? null, meta: 0, qtd: 0, valor: 0, comissao: 0 };
      cur.meta += g.targetItems ?? 0;
      porVend.set(g.userId, cur);
    }
    // soma pedidos vinculados a campanha, apenas os do mes selecionado
    for (const o of c.orders) {
      if (!noMes(o.createdAt)) continue;
      const cur = porVend.get(o.sellerId) ?? { nome: o.seller.name, scope: o.seller.salesModel ?? null, meta: 0, qtd: 0, valor: 0, comissao: 0 };
      const qtdPedido = o.itemCount ?? 0;
      cur.qtd += qtdPedido;
      // Comissão do pedido = itens × taxa do escopo da vendedora, aplicando o
      // valor reduzido quando o pedido foi marcado com desconto.
      cur.comissao += qtdPedido * taxaItem(cur.scope, o.campaignDiscount === true);
      // REGRA DE NEGOCIO: a coluna "Valor" NAO usa mais o total do pedido.
      // Agora soma os valores registrados individualmente nos itens de campanha
      // DESTA campanha (CampaignItem.value). Pedidos antigos, sem itens, somam 0.
      const itensDestaCampanha = (o.campaignItems ?? []).filter(
        (it: any) => it.campaignId === c.id,
      );
      cur.valor += itensDestaCampanha.reduce((a: number, it: any) => a + Number(it.value), 0);
      porVend.set(o.sellerId, cur);
    }
    const rows: CampaignPerfRow[] = [...porVend.values()]
      .map((v) => {
        const pct = v.meta > 0 ? Math.round((v.qtd / v.meta) * 100) : 0;
        return { nome: v.nome, meta: v.meta, qtd: v.qtd, valor: v.valor, comissao: v.comissao, pct };
      })
      .sort((a, b) => b.pct - a.pct || b.qtd - a.qtd);
    return { id: c.id, name: c.name, rows };
  });

  return {
    month, year, isCurrent,
    metaGeral, realizadoGeral, metaGeralPct, goalsCount: goalsGerais.length,
    maiorSemana: maior(daSemana), maiorMes: maior(doMes),
    rankGeral: buildRank(null), rankVarejo: buildRank("VAREJO"), rankAtacado: buildRank("ATACADO"),
    campaigns, campaignPerf, updatedAt: new Date().toISOString(),
  };
}
