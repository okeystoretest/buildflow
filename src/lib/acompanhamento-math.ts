/**
 * ACOMPANHAMENTO GERENCIAL — a grade do ano, sem banco.
 * ---------------------------------------------------------------------------
 * POR QUE ESTE MÓDULO EXISTE
 *
 * A tela de Acompanhamento Gerencial (Comercial) mostra, para uma Loja de
 * Origem, doze meses de meta e realizado — da loja e de cada vendedora — mais
 * P.A. e variação mês a mês. São cinco contas pequenas que erram em silêncio:
 * divisão por zero, mês vazio exibido como `0`, e o realizado discordando do
 * Ranking de Vendas. Aqui elas ficam puras e cobertas por
 * `scripts/checks/acompanhamento-math.ts`.
 *
 * O REALIZADO NÃO É RECALCULADO AQUI. As funções do Ranking
 * (`computeRealizado`, `vendidoDoVendedor`) são reaproveitadas mês a mês, então
 * o ajuste manual incremental e a regra de "quem entra na conta" continuam
 * definidos num lugar só. O recorte de mês usa `janelaDoMes`, a mesma janela
 * ancorada no fuso do negócio que o Ranking usa — sem ela, a venda das últimas
 * três horas do dia 31 cairia no mês seguinte.
 *
 * POPULAÇÃO: as vendedoras cuja LOJA PRINCIPAL é a loja consultada, tenham ou
 * não meta individual no mês. É a diferença deliberada com o Ranking (que só
 * conta quem tem meta): aqui a pergunta é "quanto a loja faturou contra o alvo
 * da loja", e uma venda real cuja meta ninguém cadastrou não pode fazer a loja
 * parecer pior do que foi. A tela diz isso ao usuário.
 *
 * NÃO adicionar "use server": é usado por Server Components.
 */

import { janelaDoMes } from "@/lib/rank-window";
import { computeRealizado, vendidoDoVendedor, type AjusteRank } from "@/lib/rank-math";

/** Um pedido faturado, já reduzido ao que a grade precisa. */
export interface PedidoAcomp {
  sellerId: string;
  /** "Valor Total do Pedido", em reais. Nunca inclui frete. */
  orderValue: number;
  /**
   * Peças do pedido — numerador do P.A.
   *
   * Vem de `Order.pieceCount` (as peças DECLARADAS no pedido), nunca de
   * `Order.itemCount`: aquele conta só o que o pedido contribui para uma
   * CAMPANHA, e vale 0 em todo pedido sem campanha — o P.A. da loja inteira
   * ficaria zerado nos meses sem campanha ativa.
   */
  pecas: number;
  createdAt: Date;
}

/** Uma vendedora da loja (a população da grade). */
export interface VendedoraAcomp {
  id: string;
  nome: string;
}

/** Meta mensal: individual (`userId`) ou da loja (`userId` ausente). */
export interface MetaMes {
  month: number; // 1-12
  amount: number;
  userId?: string;
}

/** Ajuste manual do Ranking, por vendedora e mês. */
export interface AjusteMes extends AjusteRank {
  userId: string;
  month: number; // 1-12
}

/** Uma célula da grade: um mês de uma linha (loja ou vendedora). */
export interface CelulaMes {
  month: number; // 1-12
  /** `null` = nenhuma meta cadastrada no mês. Nunca 0 para "não cadastrada". */
  meta: number | null;
  realizado: number;
  /** Fração (0,93 = 93%). `null` sem meta — não existe % de um alvo que não existe. */
  pct: number | null;
  /** Peças por Atendimento. `null` sem pedido no mês, nunca 0. */
  pa: number | null;
  /** Pedidos faturados no mês — o denominador do P.A., exibido como apoio. */
  pedidos: number;
  /** Peças vendidas no mês — o numerador do P.A., para somar vários meses. */
  pecas: number;
  /** Variação do realizado contra o mês ANTERIOR. `null` quando ele foi zero. */
  vsAnterior: number | null;
}

export interface LinhaVendedora {
  userId: string;
  nome: string;
  /** Sempre 12 células, Janeiro a Dezembro. */
  meses: CelulaMes[];
  totalRealizado: number;
  /** Soma das metas cadastradas no ano (meses sem meta somam 0). */
  totalMeta: number;
  /** true = nenhuma meta individual cadastrada em nenhum mês do ano. */
  semMetaNoAno: boolean;
}

export interface GradeAnual {
  year: number;
  /** As 12 células da LOJA: `meta` é a meta da loja, `realizado` a soma das linhas. */
  loja: CelulaMes[];
  vendedoras: LinhaVendedora[];
  /** Soma das metas individuais por mês — comparável com a meta da loja. */
  somaMetasIndividuais: number[];
  totalMetaLoja: number;
  totalRealizado: number;
  /** Quantas vendedoras da loja não têm meta individual em nenhum mês. */
  vendedorasSemMeta: number;
}

/** Fração do alvo. `null` sem alvo — e nunca uma divisão por zero. */
export function pctDaMeta(realizado: number, meta: number | null): number | null {
  if (meta === null || meta <= 0) return null;
  return realizado / meta;
}

/**
 * Peças por Atendimento do mês.
 *
 * `null` sem pedido, e não 0: "zero peças por atendimento" afirma que a
 * vendedora atendeu e não vendeu, quando a verdade é que não houve atendimento.
 */
export function paDoMes(pecas: number, pedidos: number): number | null {
  if (pedidos <= 0) return null;
  return pecas / pedidos;
}

/**
 * Variação contra o mês anterior.
 *
 * `null` quando o mês anterior foi zero: crescer de 0 para 10.000 não é
 * "+∞%" nem "+100%", é uma comparação que não existe. Janeiro sempre devolve
 * `null` — a grade começa nele e o mês anterior está fora do recorte.
 *
 * ATENÇÃO: a planilha que originou esta tela tem uma coluna chamada
 * "% DE COMPARAÇÃO COM O MÊS ANTERIOR" que calcula `(ATINGIDO - META) / META`,
 * ou seja, progresso da meta — o mesmo número da coluna ao lado, menos 1. Esta
 * função faz o que o nome diz; o progresso da meta é `pctDaMeta`.
 */
export function variacaoMensal(atual: number, anterior: number): number | null {
  if (anterior <= 0) return null;
  return (atual - anterior) / anterior;
}

/** Em que mês (1-12) do ano este instante cai, no fuso do negócio. `null` fora do ano. */
function mesDoAno(d: Date, year: number): number | null {
  for (let m = 1; m <= 12; m++) {
    const { inicio, fim } = janelaDoMes(year, m);
    if (d >= inicio && d < fim) return m;
  }
  return null;
}

/**
 * Monta a grade do ano de UMA loja (ou do conjunto, quando o chamador passa as
 * vendedoras de todas as lojas e as metas de loja somadas).
 *
 * `pedidos` deve vir já filtrado pelo critério de faturado do Ranking
 * (`FATURADO_WHERE`) e pelo ano. Pedido de quem não está em `vendedoras` é
 * ignorado: a soma da loja tem de fechar com a soma das linhas exibidas.
 */
export function montarGrade(args: {
  year: number;
  pedidos: PedidoAcomp[];
  vendedoras: VendedoraAcomp[];
  metasIndividuais: MetaMes[];
  metasLoja: MetaMes[];
  ajustes: AjusteMes[];
}): GradeAnual {
  const { year, pedidos, vendedoras, metasIndividuais, metasLoja, ajustes } = args;

  const daLoja = new Set(vendedoras.map((v) => v.id));
  const MESES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

  // Pedidos por mês, uma passada só: `mesDoAno` roda 12 janelas por pedido e
  // uma grade de 2.000 pedidos não precisa de 24.000 comparações por célula.
  const porMes = new Map<number, PedidoAcomp[]>(MESES.map((m) => [m, []]));
  for (const p of pedidos) {
    if (!daLoja.has(p.sellerId)) continue;
    const m = mesDoAno(p.createdAt, year);
    if (m !== null) porMes.get(m)!.push(p);
  }

  const metaInd = new Map<string, number>();
  for (const g of metasIndividuais) {
    if (!g.userId) continue;
    metaInd.set(`${g.userId}:${g.month}`, (metaInd.get(`${g.userId}:${g.month}`) ?? 0) + g.amount);
  }
  const metaLoja = new Map<number, number>();
  for (const g of metasLoja) metaLoja.set(g.month, (metaLoja.get(g.month) ?? 0) + g.amount);

  // Realizado de cada vendedora em cada mês, pelas funções do Ranking.
  const realizadoMes = new Map<number, Map<string, number>>();
  const totalMes = new Map<number, number>();
  for (const m of MESES) {
    const ajustesDoMes = new Map<string, AjusteRank>(
      ajustes
        .filter((a) => a.month === m && daLoja.has(a.userId))
        .map((a) => [a.userId, { amount: a.amount, corte: a.corte }]),
    );
    const { porVendedor } = computeRealizado({
      pedidos: porMes.get(m)!.map((p) => ({
        sellerId: p.sellerId,
        orderValue: p.orderValue,
        createdAt: p.createdAt,
      })),
      comMeta: daLoja,
      ajustes: ajustesDoMes,
    });
    const linha = new Map<string, number>();
    let total = 0;
    for (const v of vendedoras) {
      const consolidado = porVendedor.get(v.id) ?? { total: 0, posCorte: 0 };
      const valor = vendidoDoVendedor(consolidado, ajustesDoMes.get(v.id));
      linha.set(v.id, valor);
      total += valor;
    }
    realizadoMes.set(m, linha);
    totalMes.set(m, total);
  }

  const celula = (
    month: number,
    meta: number | null,
    realizado: number,
    anterior: number,
    pecas: number,
    pedidosQtd: number,
  ): CelulaMes => ({
    month,
    meta,
    realizado,
    pct: pctDaMeta(realizado, meta),
    pa: paDoMes(pecas, pedidosQtd),
    pedidos: pedidosQtd,
    pecas,
    // Janeiro não tem mês anterior DENTRO da grade: `variacaoMensal(x, 0)` já
    // devolve null, e é por isso que o anterior de Janeiro entra como 0.
    vsAnterior: variacaoMensal(realizado, anterior),
  });

  const linhas: LinhaVendedora[] = vendedoras.map((v) => {
    const meses = MESES.map((m) => {
      const doMes = porMes.get(m)!.filter((p) => p.sellerId === v.id);
      const meta = metaInd.get(`${v.id}:${m}`) ?? null;
      const realizado = realizadoMes.get(m)!.get(v.id) ?? 0;
      const anterior = m === 1 ? 0 : (realizadoMes.get(m - 1)!.get(v.id) ?? 0);
      return celula(
        m,
        meta,
        realizado,
        anterior,
        doMes.reduce((a, p) => a + p.pecas, 0),
        doMes.length,
      );
    });
    return {
      userId: v.id,
      nome: v.nome,
      meses,
      totalRealizado: meses.reduce((a, c) => a + c.realizado, 0),
      totalMeta: meses.reduce((a, c) => a + (c.meta ?? 0), 0),
      semMetaNoAno: meses.every((c) => c.meta === null),
    };
  });

  const loja = MESES.map((m) => {
    const doMes = porMes.get(m)!;
    return celula(
      m,
      metaLoja.get(m) ?? null,
      totalMes.get(m)!,
      m === 1 ? 0 : totalMes.get(m - 1)!,
      doMes.reduce((a, p) => a + p.pecas, 0),
      doMes.length,
    );
  });

  return {
    year,
    loja,
    // Da maior entrega do ano para a menor: a grade é lida de cima para baixo.
    vendedoras: linhas.sort(
      (a, b) => b.totalRealizado - a.totalRealizado || a.nome.localeCompare(b.nome, "pt-BR"),
    ),
    somaMetasIndividuais: MESES.map((m) =>
      linhas.reduce((a, l) => a + (l.meses[m - 1].meta ?? 0), 0),
    ),
    totalMetaLoja: loja.reduce((a, c) => a + (c.meta ?? 0), 0),
    totalRealizado: loja.reduce((a, c) => a + c.realizado, 0),
    vendedorasSemMeta: linhas.filter((l) => l.semMetaNoAno).length,
  };
}
