/**
 * ACOMPANHAMENTO GERENCIAL — as consultas da grade do ano.
 * ---------------------------------------------------------------------------
 * TRES CONSULTAS PARA O ANO INTEIRO, e nao doze chamadas de `computeRankData`:
 * cada uma daquelas carrega os pedidos do mes com o vendedor incluido, mais os
 * contratos Select, mais as campanhas — doze cargas pesadas por abertura de
 * tela, para uma grade que precisa de valor, pecas e data.
 *
 * O criterio de venda confirmada vem de `FATURADO_WHERE` (rank-data.ts) e o
 * recorte do mes de `janelaDoMes` (rank-window.ts). Nada disso e reescrito
 * aqui: e o que mantem esta tela e o Ranking de Vendas falando o mesmo numero.
 *
 * A APURACAO E POR `User.primaryOriginStoreId` — a loja PRINCIPAL da
 * vendedora —, nunca por `Order.originStoreId`. A venda conta na loja dela
 * mesmo quando o pedido foi lancado na segunda loja de origem, que existe so
 * para o acompanhamento de pedidos.
 */

import type { SalesModel } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { FATURADO_WHERE, AJUSTE_CORTE_PADRAO } from "@/lib/rank-data";
import { janelaDoMes, corteLegado } from "@/lib/rank-window";
import { montarGrade, type GradeAnual, type AjusteMes } from "@/lib/acompanhamento-math";

export interface AcompanhamentoFiltro {
  year: number;
  /** "" = todas as lojas somadas. */
  lojaId?: string;
  /** "" = todos os escopos. Recorta a POPULACAO pelo Modelo de Venda. */
  escopo?: SalesModel | "";
}

export interface AcompanhamentoData {
  grade: GradeAnual;
  lojas: { id: string; name: string }[];
  /** As vendedoras que entraram na grade, em ordem alfabetica (para o filtro). */
  vendedoras: { id: string; nome: string }[];
  /**
   * Vendedoras de VENDAS ativas SEM loja principal definida. Elas nao entram em
   * loja nenhuma — o aviso na tela existe para o faturamento delas nao
   * desaparecer em silencio.
   */
  semLojaPrincipal: { id: string; name: string }[];
}

export async function computeAcompanhamento(
  filtro: AcompanhamentoFiltro,
): Promise<AcompanhamentoData> {
  const { year } = filtro;
  const lojaId = filtro.lojaId?.trim() || "";
  const escopo = filtro.escopo || "";

  // Janela do ANO, montada pelas bordas do primeiro e do ultimo mes para herdar
  // o fuso do negocio de `janelaDoMes`.
  const inicio = janelaDoMes(year, 1).inicio;
  const fim = janelaDoMes(year, 12).fim;

  const [lojas, vendedorasDaLoja, semLojaPrincipal] = await Promise.all([
    prisma.originStore.findMany({
      where: { active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    // A POPULACAO: quem tem a loja como principal. Inclui inativas de
    // proposito — uma vendedora desligada em agosto faturou de janeiro a
    // agosto, e tirar a linha dela faria a grade do ano nao fechar.
    prisma.user.findMany({
      where: {
        role: "VENDAS",
        ...(lojaId ? { primaryOriginStoreId: lojaId } : { primaryOriginStoreId: { not: null } }),
        ...(escopo ? { salesModel: escopo } : {}),
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.user.findMany({
      where: { role: "VENDAS", active: true, primaryOriginStoreId: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const ids = vendedorasDaLoja.map((v) => v.id);

  // Sem vendedora na loja nao ha o que consultar: a grade sai zerada, mas a
  // tela ainda abre (e o aviso de "sem loja principal" e o que explica).
  const [pedidos, metas, ajustes, metasLoja] = ids.length
    ? await Promise.all([
        prisma.order.findMany({
          where: { ...FATURADO_WHERE, sellerId: { in: ids }, createdAt: { gte: inicio, lt: fim } },
          // `pieceCount` (peças declaradas no pedido) é o numerador do P.A.;
          // `itemCount` é a contribuição para campanha e seria 0 fora delas.
          select: { sellerId: true, orderValue: true, pieceCount: true, createdAt: true },
        }),
        // Metas GERAIS (campanha e em pecas, nao soma em R$).
        prisma.salesGoal.findMany({
          where: { year, campaignId: null, userId: { in: ids } },
          select: { userId: true, month: true, amount: true },
        }),
        prisma.rankAdjustment.findMany({
          where: { year, userId: { in: ids } },
          select: { userId: true, month: true, amount: true, baselineAt: true },
        }),
        prisma.storeGoal.findMany({
          where: { year, ...(lojaId ? { originStoreId: lojaId } : {}) },
          select: { month: true, amount: true },
        }),
      ])
    : [[], [], [], await prisma.storeGoal.findMany({
        where: { year, ...(lojaId ? { originStoreId: lojaId } : {}) },
        select: { month: true, amount: true },
      })];

  const grade = montarGrade({
    year,
    pedidos: pedidos.map((o) => ({
      sellerId: o.sellerId,
      // Sem frete, como todo numero de meta no sistema (ver rank-data.ts).
      orderValue: Number(o.orderValue),
      pecas: o.pieceCount ?? 0,
      createdAt: new Date(o.createdAt),
    })),
    vendedoras: vendedorasDaLoja.map((v) => ({ id: v.id, nome: v.name })),
    metasIndividuais: metas.map((g) => ({
      userId: g.userId,
      month: g.month,
      amount: Number(g.amount),
    })),
    metasLoja: metasLoja.map((g) => ({ month: g.month, amount: Number(g.amount) })),
    // Mesma resolucao de corte do Ranking: ajuste gravado antes da regra
    // incremental nao tem `baselineAt`, e fora do mes em que o corte padrao foi
    // cravado vale o fim do mes (senao o valor digitado somaria sobre o mes
    // inteiro em vez de substitui-lo).
    ajustes: ajustes.map(
      (a): AjusteMes => ({
        userId: a.userId,
        month: a.month,
        amount: Number(a.amount),
        corte: a.baselineAt
          ? new Date(a.baselineAt)
          : corteLegado(AJUSTE_CORTE_PADRAO, janelaDoMes(year, a.month)),
      }),
    ),
  });

  return {
    grade,
    lojas,
    vendedoras: vendedorasDaLoja.map((v) => ({ id: v.id, nome: v.name })),
    semLojaPrincipal,
  };
}
