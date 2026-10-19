import { prisma } from "@/lib/prisma";
import { WholesaleLeadStatus, type Prisma } from "@prisma/client";
import { canUseWholesaleTool, type WholesaleActor } from "@/lib/wholesale-permissions";
import { filtroDePeriodo } from "@/lib/wholesale-queries";

/**
 * DASHBOARD DA ANÁLISE DE CLIENTES — só leitura, nada escreve.
 *
 * O ESCOPO É O MESMO DA LISTA, e pelo mesmo motivo: um painel que soma a base
 * inteira conta à vendedora quantas candidaturas as colegas receberam e
 * aprovaram. Número agregado parece inofensivo, mas "28 candidaturas, 19
 * aprovadas" sobre a equipe é exatamente o que ela não deve ver. Por isso o
 * `where` do escopo é montado aqui dentro, nunca recebido pronto, e a função
 * FALHA FECHADA quando o ator não serve.
 *
 * Não há `reconciliarRodizio()` aqui, ao contrário de `listLeadsFor`: o painel
 * é leitura de conjunto, e disparar a reatribuição do rodízio ao abrir um
 * gráfico faria uma tela de métrica mexer na dona de candidatura. Quem
 * reconcilia é a lista — e é por ela que se trabalha.
 */

/** Meses mostrados no gráfico quando não há período escolhido. */
export const MESES_NO_GRAFICO = 6;

/**
 * Teto de colunas do gráfico quando HÁ período.
 *
 * Um intervalo de cinco anos produziria sessenta colunas de dois pixels, que
 * não é um gráfico — é uma listra. Passando do teto, mostramos os meses mais
 * RECENTES do intervalo: os KPIs continuam somando o período inteiro, e a tela
 * diz que o gráfico está recortado.
 */
export const MAX_MESES_NO_GRAFICO = 12;

export interface ContagemPorStatus {
  status: WholesaleLeadStatus;
  total: number;
}

export interface ContagemPorVendedora {
  sellerId: string | null;
  nome: string;
  total: number;
}

export interface EntradaNoMes {
  /** "2026-10" — chave estável para ordenar. */
  chave: string;
  /** "out/26" — rótulo curto do eixo. */
  rotulo: string;
  total: number;
}

export interface CandidaturaRecente {
  id: string;
  contactName: string;
  city: string;
  state: string;
  status: WholesaleLeadStatus;
  sellerName: string | null;
  createdAtLabel: string;
}

export interface FiltrosDoPainel {
  de?: string;
  ate?: string;
  /** Id da vendedora. Só a Gestão escolhe — ver `resumoDoAtacado`. */
  vendedora?: string;
}

export interface ResumoDoAtacado {
  total: number;
  porStatus: ContagemPorStatus[];
  porVendedora: ContagemPorVendedora[];
  entradasPorMes: EntradaNoMes[];
  recentes: CandidaturaRecente[];
  /** Aprovadas ÷ total recebido, em 0–100. */
  conversao: number;
  aprovadas: number;
}

const VAZIO: ResumoDoAtacado = {
  total: 0,
  porStatus: [],
  porVendedora: [],
  entradasPorMes: [],
  recentes: [],
  conversao: 0,
  aprovadas: 0,
};

const dataCurta = (d: Date) =>
  d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

/**
 * O `where` do escopo — a única coisa que impede uma vendedora de ver o painel
 * da equipe. Exportado e PURO para poder ser conferido por script: é regra de
 * segurança, e regra de segurança que nenhum teste toca é regra que se perde
 * numa refatoração silenciosa.
 */
export function escopoDoAtor(actor: WholesaleActor): Prisma.WholesaleLeadWhereInput {
  return actor.role === "GESTAO" ? {} : { sellerId: actor.userId };
}

/**
 * Aprovadas ÷ TOTAL RECEBIDO, em 0–100 com uma casa.
 *
 * Como especificado, e não aprovadas ÷ (aprovadas + reprovadas): as que ainda
 * estão em análise contam no denominador. Base zero devolve 0, nunca NaN — uma
 * tela nova mostraria "NaN%" no primeiro dia.
 */
export function taxaDeConversao(aprovadas: number, total: number): number {
  return total === 0 ? 0 : Math.round((aprovadas / total) * 1000) / 10;
}

function mesDe(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function bucketDoMes(d: Date): EntradaNoMes {
  return {
    chave: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`,
    rotulo: d
      .toLocaleDateString("pt-BR", { month: "short", year: "2-digit", timeZone: "UTC" })
      .replace(".", ""),
    total: 0,
  };
}

/**
 * As colunas do gráfico, do mês mais antigo ao mais novo, com zero nos vazios.
 *
 * SEM período: os últimos `MESES_NO_GRAFICO` meses. COM período: os meses que
 * ele abrange — é o que faz o gráfico contar a mesma história que os KPIs ao
 * lado. Um gráfico preso em 6 meses junto de indicadores filtrados por outro
 * intervalo são dois números diferentes na mesma tela, e ninguém descobre qual
 * dos dois está certo.
 *
 * Os meses sem candidatura precisam APARECER: um gráfico que só desenha os
 * meses com dado encosta duas colunas distantes lado a lado e some com o mês em
 * que ninguém chegou — justamente o que um painel de entrada existe para
 * mostrar.
 */
export function bucketsDeMes(agora: Date, de?: string, ate?: string): EntradaNoMes[] {
  const fimPedido = (ate ?? "").trim() ? new Date(`${ate}T12:00:00Z`) : agora;
  const fim = mesDe(Number.isNaN(fimPedido.getTime()) ? agora : fimPedido);

  const dePedido = (de ?? "").trim() ? new Date(`${de}T12:00:00Z`) : null;
  const inicioBruto =
    dePedido && !Number.isNaN(dePedido.getTime())
      ? mesDe(dePedido)
      : new Date(Date.UTC(fim.getUTCFullYear(), fim.getUTCMonth() - (MESES_NO_GRAFICO - 1), 1));

  // Período invertido não pode gerar uma lista vazia nem um laço infinito: cai
  // no mês final sozinho, e o filtro já devolve zero candidatura de qualquer
  // forma.
  const inicio = inicioBruto > fim ? fim : inicioBruto;

  const buckets: EntradaNoMes[] = [];
  const cursor = new Date(inicio);
  while (cursor <= fim) {
    buckets.push(bucketDoMes(cursor));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  // Passando do teto, ficam os mais RECENTES: é a ponta que interessa.
  return buckets.slice(-MAX_MESES_NO_GRAFICO);
}

export async function resumoDoAtacado(
  actor: WholesaleActor,
  filtros: FiltrosDoPainel = {},
  agora: Date = new Date(),
): Promise<ResumoDoAtacado> {
  if (!canUseWholesaleTool(actor)) return VAZIO;
  // Falha FECHADA, como em `listLeadsFor`: em Prisma `sellerId: undefined` não
  // filtra nada, então um ator sem id entregaria a base inteira a quem não é
  // Gestão. O tipo impede hoje; esta linha impede também quando alguém montar o
  // ator a partir de um select parcial.
  if (actor.role !== "GESTAO" && !actor.userId) return VAZIO;

  const ehGestao = actor.role === "GESTAO";
  const vendedora = (filtros.vendedora ?? "").trim();
  const where: Prisma.WholesaleLeadWhereInput = {
    // O ESCOPO VEM PRIMEIRO, e o filtro de vendedora só se aplica DEPOIS dele e
    // só para a Gestão — mesma regra de `listLeadsFor`. Para quem é de Vendas o
    // `sellerId` já está fixado no próprio id, e um `?vendedora=<outro>` na
    // barra de endereços não alarga nada, porque a chave seguinte
    // sobrescreveria o escopo. É a diferença entre um filtro e um vazamento.
    ...escopoDoAtor(actor),
    ...(ehGestao && vendedora ? { sellerId: vendedora } : {}),
    ...filtroDePeriodo(filtros.de, filtros.ate),
  };

  const entradasPorMes = bucketsDeMes(agora, filtros.de, filtros.ate);
  // A janela do gráfico começa no primeiro dia do mês mais antigo MOSTRADO —
  // que, com período longo, é mais recente que o início do período.
  const [anoJanela, mesJanela] = (entradasPorMes[0]?.chave ?? "").split("-");
  const inicioJanela = anoJanela
    ? new Date(Date.UTC(Number(anoJanela), Number(mesJanela) - 1, 1))
    : new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), 1));

  const [total, statusRaw, vendedoraRaw, naJanela, recentesRaw] = await Promise.all([
    prisma.wholesaleLead.count({ where }),
    prisma.wholesaleLead.groupBy({ by: ["status"], where, _count: { _all: true } }),
    // Distribuição por vendedora só faz sentido (e só é permitida) para a
    // Gestão: para a vendedora, o escopo já reduz o gráfico a uma barra dela.
    ehGestao
      ? prisma.wholesaleLead.groupBy({ by: ["sellerId"], where, _count: { _all: true } })
      : Promise.resolve([]),
    // Só a janela do gráfico sai do banco, e só a coluna da data: a contagem
    // por mês é feita em memória sobre um recorte limitado, em vez de SQL cru.
    prisma.wholesaleLead.findMany({
      where: { ...where, createdAt: { gte: inicioJanela } },
      select: { createdAt: true },
    }),
    prisma.wholesaleLead.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        contactName: true,
        city: true,
        state: true,
        status: true,
        createdAt: true,
        seller: { select: { name: true } },
      },
    }),
  ]);

  // Todos os status aparecem, inclusive os zerados e o CUIDADO. Mostrar só os
  // três pedidos faria as parcelas não fecharem com o total, e a diferença
  // inexplicada é pior que a linha a mais.
  const contagem = new Map(statusRaw.map((s) => [s.status, s._count._all]));
  const porStatus = (Object.values(WholesaleLeadStatus) as WholesaleLeadStatus[]).map((status) => ({
    status,
    total: contagem.get(status) ?? 0,
  }));

  const nomes = new Map<string, string>();
  const ids = vendedoraRaw.map((v) => v.sellerId).filter((id): id is string => id != null);
  if (ids.length > 0) {
    // Inclui as INATIVAS: candidatura antiga continua apontando para quem saiu
    // da equipe, e sem o nome a barra ficaria anônima.
    for (const u of await prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true },
    })) {
      nomes.set(u.id, u.name);
    }
  }
  const porVendedora: ContagemPorVendedora[] = vendedoraRaw
    .map((v) => ({
      sellerId: v.sellerId,
      // Sem dona = chegou pelo link geral sem nenhuma vendedora ativa para
      // receber. É um aviso de operação, e some da lista quando alguém é
      // ativada — por isso aparece nomeado, não escondido.
      nome: v.sellerId ? (nomes.get(v.sellerId) ?? "Vendedora removida") : "Sem vendedora",
      total: v._count._all,
    }))
    .sort((a, b) => b.total - a.total);

  const indice = new Map(entradasPorMes.map((b, i) => [b.chave, i]));
  for (const { createdAt } of naJanela) {
    const chave = `${createdAt.getUTCFullYear()}-${String(createdAt.getUTCMonth() + 1).padStart(2, "0")}`;
    const i = indice.get(chave);
    if (i != null) entradasPorMes[i].total++;
  }

  const aprovadas = contagem.get("APROVADO") ?? 0;
  const conversao = taxaDeConversao(aprovadas, total);

  return {
    total,
    porStatus,
    porVendedora,
    entradasPorMes,
    recentes: recentesRaw.map((r) => ({
      id: r.id,
      contactName: r.contactName,
      city: r.city,
      state: r.state,
      status: r.status,
      sellerName: r.seller?.name ?? null,
      // Formatada no SERVIDOR: `toLocaleString` no navegador usaria outro fuso
      // e a divergência apareceria como erro de hidratação.
      createdAtLabel: dataCurta(r.createdAt),
    })),
    conversao,
    aprovadas,
  };
}
