import { prisma } from "@/lib/prisma";
import { premiacaoDoItem } from "@/lib/campaign-commission";

export interface RankRow {
  /** Necessário para o ajuste manual (a linha precisa saber a quem pertence). */
  userId: string;
  nome: string;
  /** Valor exibido: o ajuste manual quando existe, senão o consolidado. */
  vendido: number;
  meta: number;
  pct: number;
  /** true = o valor exibido tem um ajuste manual na base. */
  ajustado: boolean;
  /** Consolidado pelo sistema agora — usado para comparar e para restaurar. */
  vendidoSistema: number;
  /** Valor digitado no ajuste (base). null quando não há ajuste. */
  ajusteBase: number | null;
  /** Instante do corte do ajuste (ISO). null quando não há ajuste. */
  ajusteCorte: string | null;
  /**
   * Faturado pelo sistema DEPOIS do corte do ajuste — a parcela que soma sobre
   * a base. 0 quando não há ajuste ou quando nada entrou desde então.
   */
  vendidoAposAjuste: number;
}
export interface CampaignData {
  id: string; name: string; volume: number; receita: number;
}
export interface CampaignPerfRow {
  nome: string;
  meta: number;   // meta de itens do vendedor vinculada a esta campanha
  qtd: number;    // peças vendidas pelo vendedor em pedidos desta campanha
  valor: number;  // R$ gerado por esse vendedor na campanha
  premiacao: number; // R$ de premiação (peças × R$ 5,00)
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
  /** Soma dos ajustes manuais aplicada ao realizado geral (pode ser negativa). */
  ajusteManualTotal: number;
  /** Quantos vendedores estão com valor ajustado no período. */
  ajustesCount: number;
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

/**
 * CORTE PADRAO dos ajustes gravados ANTES da regra incremental (baselineAt
 * nulo). Combinado com o negocio: o valor digitado nesses ajustes responde
 * pelos pedidos criados ate 27/08/2026 as 10:00; tudo criado a partir dai soma.
 * Data em horario LOCAL do servidor, igual as demais janelas deste arquivo.
 */
export const AJUSTE_CORTE_PADRAO = new Date(2026, 7, 27, 10, 0, 0, 0);

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
  // PREMIAÇÃO de campanha: R$ 5,00 por peça, valor único. Não depende mais do
  // modelo de venda nem do desconto do pedido — ver src/lib/campaign-commission.ts.
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

  // AJUSTES MANUAIS do periodo (Ranking > modo de edicao).
  //
  // REGRA DE NEGOCIO (ajuste INCREMENTAL): o valor digitado responde pelo
  // realizado do vendedor SOMENTE ate o instante do corte (`baselineAt`, o
  // momento em que o ajuste foi salvo). Os pedidos criados a partir do corte
  // NAO sao descartados — eles SOMAM sobre o valor digitado. Antes o ajuste
  // substituia o mes inteiro e congelava a linha: qualquer venda registrada
  // depois sumia do ranking.
  //
  // Ajustes gravados antes desta regra nao tem corte; para eles vale o corte
  // padrao (AJUSTE_CORTE_PADRAO). Ver src/lib/actions/rank-adjustments.ts.
  const ajustes = await prisma.rankAdjustment.findMany({ where: { month, year } });
  const ajustePorUser = new Map(
    ajustes.map((a) => [
      a.userId,
      {
        amount: Number(a.amount),
        corte: a.baselineAt ? new Date(a.baselineAt) : AJUSTE_CORTE_PADRAO,
      },
    ]),
  );

  // Metas Gerais = apenas as nao vinculadas a campanha (campaignId null).
  const goals = await prisma.salesGoal.findMany({
    where: { month, year },
    include: { user: { select: { name: true, salesModel: true } } },
  });
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

  const realizadoSistema = doMes.reduce((a, o) => a + receita(o), 0);
  const maior = (arr: typeof faturados) =>
    arr.reduce<{ total: number; nome: string } | null>((acc, o) => {
      const t = receita(o);
      return !acc || t > acc.total ? { total: t, nome: o.seller.name } : acc;
    }, null);

  // Acumula por vendedor SOMENTE o faturado no mês selecionado, para casar com
  // a meta mensal e o progresso ficar correto.
  // `posCorte` acumula, em paralelo, so o que entrou a partir do corte do
  // ajuste daquele vendedor — a parcela que soma sobre o valor digitado.
  const porVendedor = new Map<string, { nome: string; scope: string | null; total: number; posCorte: number }>();
  for (const o of doMes) {
    const cur = porVendedor.get(o.sellerId) ?? { nome: o.seller.name, scope: o.seller.salesModel, total: 0, posCorte: 0 };
    cur.total += receita(o);
    const corte = ajustePorUser.get(o.sellerId)?.corte;
    if (corte && new Date(o.createdAt) >= corte) cur.posCorte += receita(o);
    porVendedor.set(o.sellerId, cur);
  }
  // Vendedor COM meta e SEM pedido registrado no periodo entra na lista com 0.
  //
  // Antes ele simplesmente nao aparecia (a lista nascia dos pedidos), e isso
  // inviabilizaria justamente o caso de uso do ajuste manual: quem vendeu fora
  // da plataforma tem zero pedidos e nao teria linha para ser editada. Como
  // efeito colateral, o ranking passa a mostrar tambem quem esta em 0% — o que
  // e a leitura correta de um quadro que mede progresso contra meta.
  for (const g of goalsGerais) {
    if (porVendedor.has(g.userId)) continue;
    porVendedor.set(g.userId, {
      nome: g.user.name,
      scope: g.user.salesModel ?? g.scope,
      total: 0,
      posCorte: 0,
    });
  }

  // Meta por vendedor: usa as metas Gerais (escopo do vendedor).
  const metaPorVendedor = new Map<string, number>();
  for (const g of goalsGerais) metaPorVendedor.set(g.userId + g.scope, Number(g.amount));

  // O ajuste manual tambem corrige o REALIZADO GERAL: se a venda existiu mas
  // nao foi registrada, ela falta tanto na linha do vendedor quanto no total.
  //
  // Como o ajuste e incremental, ele so substitui o consolidado ATE o corte —
  // a diferenca somada e (manual - consolidado ANTES do corte). O que entrou
  // depois ja esta em `realizadoSistema` e continua valendo.
  //
  // Um ajuste para vendedor SEM pedido no periodo tambem conta: o consolidado
  // ate o corte cai para 0 e a diferenca vira o valor digitado inteiro.
  //
  // maiorSemana / maiorMes NAO sao ajustados de proposito: sao recordes de UM
  // pedido especifico, e um ajuste agregado nao diz qual pedido teria mudado.
  let ajusteManualTotal = 0;
  for (const [userId, aj] of ajustePorUser.entries()) {
    const v = porVendedor.get(userId);
    const consolidadoAteCorte = (v?.total ?? 0) - (v?.posCorte ?? 0);
    ajusteManualTotal += aj.amount - consolidadoAteCorte;
  }

  const realizadoGeral = realizadoSistema + ajusteManualTotal;
  const metaGeralPct = metaGeral > 0 ? Math.round((realizadoGeral / metaGeral) * 100) : 0;

  // REGRA DE NEGOCIO: usuarios SEM meta definida no periodo NAO aparecem no
  // dashboard. O ranking mede progresso contra meta — sem meta cadastrada a
  // linha nao tem leitura possivel ("s/ meta") e apenas polui o telao.
  const buildRank = (scope: "VAREJO" | "ATACADO" | null): RankRow[] =>
    [...porVendedor.entries()]
      .filter(([, v]) => (scope ? v.scope === scope : true))
      .map(([id, v]) => {
        // No painel Geral (scope null), usa a meta do vendedor pelo escopo dele.
        const escopoMeta = scope ?? v.scope;
        const meta = escopoMeta ? (metaPorVendedor.get(id + escopoMeta) ?? 0) : 0;
        // Ajuste manual INCREMENTAL: o valor digitado responde pelo periodo
        // ate o corte e o faturado posterior soma sobre ele.
        const aj = ajustePorUser.get(id);
        const vendido = aj ? aj.amount + v.posCorte : v.total;
        return {
          userId: id,
          nome: v.nome,
          vendido,
          meta,
          pct: meta > 0 ? Math.round((vendido / meta) * 100) : 0,
          ajustado: !!aj,
          vendidoSistema: v.total,
          ajusteBase: aj ? aj.amount : null,
          ajusteCorte: aj ? aj.corte.toISOString() : null,
          vendidoAposAjuste: aj ? v.posCorte : 0,
        };
      })
      // Descarta quem nao tem meta no mes/ano selecionado.
      .filter((r) => r.meta > 0)
      // ORDEM DO RANKING: pelo PROGRESSO DA META (%), nao pelo valor vendido.
      // O quadro mede cumprimento de meta, e metas sao diferentes entre as
      // vendedoras — quem vendeu menos em R$ pode estar a frente por ter
      // batido uma proporcao maior da propria meta.
      //
      // Desempate 1: maior valor realizado (entre dois 100%, quem entregou o
      // numero maior fica na frente). Desempate 2: nome, so para a ordem nao
      // oscilar entre recarregamentos quando tudo mais e igual.
      .sort((a, b) => b.pct - a.pct || b.vendido - a.vendido || a.nome.localeCompare(b.nome, "pt-BR"));

  // Campanhas ativas + pedidos vinculados + metas (SalesGoal) vinculadas.
  // REGRA DE NEGÓCIO (multilojas): itens de campanha vendidos em QUALQUER loja
  // contam no ranking — inclusive nas Lojas de Origem de fluxo SIMPLIFICADO,
  // que NÃO geram comanda. O filtro antigo (comandaNumber != null) excluía
  // essas vendas. Passamos a usar o mesmo critério de "faturado" do rank geral:
  //  - fluxo padrão: comanda gerada (comandaNumber != null); ou
  //  - fluxo simplificado: status PAGO/EMBALADO/ENTREGUE/CONCLUIDO.
  // Também descartamos os pedidos interrompidos (estorno/cancelado).
  const campaignsRaw = await prisma.campaign.findMany({
    where: { active: true },
    include: {
      orders: {
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
    // `premiacao` acumula peça a peça a R$ 5,00 fixos.
    const porVend = new Map<string, { nome: string; scope: "VAREJO" | "ATACADO" | null; meta: number; qtd: number; valor: number; premiacao: number }>();
    // inicia pelos vendedores com meta vinculada a esta campanha (meta = itens)
    for (const g of c.goals) {
      const cur = porVend.get(g.userId) ?? { nome: g.user.name, scope: g.user.salesModel ?? null, meta: 0, qtd: 0, valor: 0, premiacao: 0 };
      cur.meta += g.targetItems ?? 0;
      porVend.set(g.userId, cur);
    }
    // soma pedidos vinculados a campanha, apenas os do mes selecionado
    for (const o of c.orders) {
      if (!noMes(o.createdAt)) continue;
      const cur = porVend.get(o.sellerId) ?? { nome: o.seller.name, scope: o.seller.salesModel ?? null, meta: 0, qtd: 0, valor: 0, premiacao: 0 };
      const qtdPedido = o.itemCount ?? 0;
      cur.qtd += qtdPedido;
      // Premiação do pedido = peças × R$ 5,00, sem qualquer variação.
      cur.premiacao += premiacaoDoItem(qtdPedido);
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
      // Mesma regra do ranking: sem meta de itens vinculada a ESTA campanha, o
      // vendedor nao entra na tabela de performance (mesmo tendo vendido).
      .filter((v) => v.meta > 0)
      .map((v) => {
        const pct = v.meta > 0 ? Math.round((v.qtd / v.meta) * 100) : 0;
        return { nome: v.nome, meta: v.meta, qtd: v.qtd, valor: v.valor, premiacao: v.premiacao, pct };
      })
      .sort((a, b) => b.pct - a.pct || b.qtd - a.qtd);
    return { id: c.id, name: c.name, rows };
  });

  return {
    month, year, isCurrent,
    metaGeral, realizadoGeral, metaGeralPct, goalsCount: goalsGerais.length,
    ajusteManualTotal, ajustesCount: ajustePorUser.size,
    maiorSemana: maior(daSemana), maiorMes: maior(doMes),
    rankGeral: buildRank(null), rankVarejo: buildRank("VAREJO"), rankAtacado: buildRank("ATACADO"),
    campaigns, campaignPerf, updatedAt: new Date().toISOString(),
  };
}
