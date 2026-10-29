import { prisma } from "@/lib/prisma";
import { WholesaleLeadStatus, type Prisma } from "@prisma/client";
import { canUseWholesaleTool, type WholesaleActor } from "@/lib/wholesale-permissions";
import { filtroDePeriodo, marcaValida } from "@/lib/wholesale-queries";
import { findRejectionCode } from "@/lib/wholesale-rejection-codes";

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
  /** Quantas das candidaturas DELA já compraram. */
  comprou: number;
  /**
   * Compraram ÷ recebidas DELA, em 0–100 — mesma conta de `taxaDeConversao`.
   *
   * Era a taxa de APROVAÇÃO até 29/10/2026. O painel por vendedora passou a
   * falar de conversão a pedido do dono: aprovar é a decisão da analista,
   * converter é a venda acontecer, e é a segunda que o painel acompanha. A taxa
   * de aprovação continua na tela, mas só no total (o cartão do topo).
   */
  conversao: number;
}

/**
 * OS STATUS QUE CONTAM COMO APROVADA.
 *
 * COMPROU está aqui, e esquecê-lo é o defeito mais caro desta tela. O status é
 * um só por candidatura, então quem compra DEIXA de estar em APROVADO. Contar
 * aprovadas como `status === APROVADO` faria a taxa de aprovação CAIR a cada
 * venda fechada — aprovar e vender pioraria o indicador de quem vendeu, e o
 * número ainda pareceria plausível na tela.
 *
 * Quem comprou foi aprovada: o COMPROU é a etapa seguinte do funil, não um
 * desvio dele.
 */
export const APROVADAS: WholesaleLeadStatus[] = [
  WholesaleLeadStatus.APROVADO,
  WholesaleLeadStatus.COMPROU,
];

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

export interface ContagemPorMotivo {
  /** O código dos 34, ou `null` para reprovada antes de ele existir. */
  code: string | null;
  /** "12 — Loja sem vitrine" (ou "Sem código"). */
  rotulo: string;
  total: number;
}

export interface FiltrosDoPainel {
  de?: string;
  ate?: string;
  /** Id da vendedora. Só a Gestão escolhe — ver `resumoDoAtacado`. */
  vendedora?: string;
  /** Marca de origem do cadastro. Texto livre da URL; ver `marcaValida`. */
  marca?: string;
  /**
   * UF e cidade da loja da candidata.
   *
   * Entraram em 29/10/2026, junto do filtro de Cidade. São recortes
   * GEOGRÁFICOS limpos, e por isso alimentam o painel — ao contrário de status,
   * busca e motivo, que o distorceriam (filtrar por "aprovado" deixaria a taxa
   * de aprovação em 100% e a barra de status com uma fatia só).
   *
   * Sem isto, escolher uma cidade mudaria a tabela e deixaria os números acima
   * dela intactos, que lê como defeito e não como recorte.
   */
  estado?: string;
  cidade?: string;
}

export interface ResumoDoAtacado {
  total: number;
  porStatus: ContagemPorStatus[];
  porVendedora: ContagemPorVendedora[];
  entradasPorMes: EntradaNoMes[];
  recentes: CandidaturaRecente[];
  /** As reprovações desta fatia, por motivo, da mais frequente para a menos. */
  porMotivo: ContagemPorMotivo[];
  /**
   * TAXA DE APROVAÇÃO: aprovadas ÷ total recebido, em 0–100.
   *
   * Chamava-se `conversao` até 28/10/2026. Foi renomeada porque a tela passou a
   * ter DUAS taxas — esta e a conversão de verdade (quem comprou ÷ recebidas) —
   * e um campo chamado "conversao" guardando a aprovação seria a troca mais
   * fácil de fazer sem ninguém notar.
   */
  aprovacao: number;
  /** APROVADO + COMPROU — ver `APROVADAS`. */
  aprovadas: number;
  /**
   * TAXA DE CONVERSÃO: quem COMPROU ÷ total recebido, em 0–100.
   *
   * Regra nova de 28/10/2026. Antes, "conversão" era aprovadas ÷ recebidas —
   * que é o que hoje se chama taxa de aprovação. Aprovar é dizer sim; converter
   * é a lojista comprar. São duas perguntas, e a tela passou a mostrar as duas.
   */
  conversao: number;
  /** Quantas já compraram. É o numerador da conversão. */
  comprou: number;
}

const VAZIO: ResumoDoAtacado = {
  total: 0,
  porStatus: [],
  porVendedora: [],
  entradasPorMes: [],
  recentes: [],
  porMotivo: [],
  aprovacao: 0,
  aprovadas: 0,
  conversao: 0,
  comprou: 0,
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
 * Uma contagem ÷ TOTAL RECEBIDO, em 0–100 com uma casa.
 *
 * Serve às DUAS taxas da tela — aprovação (aprovadas ÷ recebidas) e conversão
 * (compraram ÷ recebidas) —, porque é a mesma conta com numeradores
 * diferentes. O nome fala de conversão por ser mais antiga que a distinção; o
 * que importa é o denominador, que é sempre o TOTAL RECEBIDO.
 *
 * Como especificado, e não sobre as decididas: as que ainda estão em análise
 * contam no denominador. Base zero devolve 0, nunca NaN — uma tela nova
 * mostraria "NaN%" no primeiro dia.
 */
export function taxaDeConversao(numerador: number, total: number): number {
  return total === 0 ? 0 : Math.round((numerador / total) * 1000) / 10;
}

/**
 * As linhas (vendedora × status) do `groupBy` viram uma linha por vendedora,
 * com total, quantas compraram e a taxa de conversão dela.
 *
 * PURO e exportado pelo mesmo motivo que `taxaDeConversao`: é a conta que o
 * painel mostra, e conta que nenhum script confere é conta que se perde numa
 * refatoração. Ordenado por VOLUME — quem lê por taxa reordena na tela, e o
 * `lider` ("quem mais recebeu") depende desta ordem.
 */
export function agrupaPorVendedora(
  linhas: { sellerId: string | null; status: WholesaleLeadStatus; _count: { _all: number } }[],
  nomes: Map<string, string>,
): ContagemPorVendedora[] {
  // Chave de string porque `null` (sem dona) também é uma linha do painel.
  const porDona = new Map<string, { total: number; comprou: number }>();
  for (const l of linhas) {
    const chave = l.sellerId ?? "";
    const acc = porDona.get(chave) ?? { total: 0, comprou: 0 };
    acc.total += l._count._all;
    // COMPROU é um status só, e aqui não há a armadilha de `APROVADAS`: quem
    // comprou está em COMPROU e em nenhum outro lugar.
    if (l.status === WholesaleLeadStatus.COMPROU) acc.comprou += l._count._all;
    porDona.set(chave, acc);
  }
  return [...porDona.entries()]
    .map(([chave, { total, comprou }]) => ({
      sellerId: chave || null,
      // Sem dona = chegou pelo link geral sem nenhuma vendedora ativa para
      // receber. É um aviso de operação, e some da lista quando alguém é
      // ativada — por isso aparece nomeado, não escondido.
      nome: chave ? (nomes.get(chave) ?? "Vendedora removida") : "Sem vendedora",
      total,
      comprou,
      conversao: taxaDeConversao(comprou, total),
    }))
    .sort((a, b) => b.total - a.total);
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
/**
 * As reprovações por motivo, da mais frequente para a menos.
 *
 * PURA e exportada pelo mesmo motivo de `agrupaPorVendedora`: é a conta que o
 * painel mostra, e conta que script nenhum confere é conta que se perde numa
 * refatoração silenciosa.
 *
 * Motivo NULO vira "Sem código" em vez de sumir: são as reprovadas de antes de
 * o código ser obrigatório, e escondê-las faria as parcelas não fecharem com o
 * total de reprovações — diferença inexplicada é pior que a linha a mais.
 *
 * O rótulo traz o CÓDIGO junto do texto ("12 — Loja sem vitrine") porque é pelo
 * código que a Gestão filtra a lista, na tela ao lado.
 */
export function agrupaPorMotivo(
  linhas: { rejectionCode: string | null; _count: { _all: number } }[],
): ContagemPorMotivo[] {
  return linhas
    .map(({ rejectionCode, _count }) => {
      const achado = rejectionCode ? findRejectionCode(rejectionCode) : null;
      return {
        code: rejectionCode,
        rotulo:
          !rejectionCode ? "Sem código"
          : achado ? `${rejectionCode} — ${achado.label}`
          // Código gravado que não existe mais na taxonomia: mostrar o código
          // cru é mais honesto que omitir a linha.
          : `${rejectionCode} — motivo desconhecido`,
        total: _count._all,
      };
    })
    .sort((a, b) => b.total - a.total || (a.code ?? "").localeCompare(b.code ?? ""));
}

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
  const marca = marcaValida(filtros.marca);
  const estado = (filtros.estado ?? "").trim();
  const cidade = (filtros.cidade ?? "").trim();
  const where: Prisma.WholesaleLeadWhereInput = {
    // O ESCOPO VEM PRIMEIRO, e o filtro de vendedora só se aplica DEPOIS dele e
    // só para a Gestão — mesma regra de `listLeadsFor`. Para quem é de Vendas o
    // `sellerId` já está fixado no próprio id, e um `?vendedora=<outro>` na
    // barra de endereços não alarga nada, porque a chave seguinte
    // sobrescreveria o escopo. É a diferença entre um filtro e um vazamento.
    ...escopoDoAtor(actor),
    ...(ehGestao && vendedora ? { sellerId: vendedora } : {}),
    // Marca: o painel e a tabela ficam na MESMA tela, lendo os mesmos filtros
    // da URL. Sem esta linha, escolher uma marca mudaria a lista e deixaria os
    // números acima dela intactos — que lê como defeito, não como recorte.
    ...(marca ? { brand: marca } : {}),
    // As MESMAS regras de `listLeadsFor`, e não é coincidência: o painel e a
    // tabela ficam na mesma tela lendo os mesmos filtros, então as duas
    // consultas têm de entender a URL do mesmo jeito. UF em maiúsculas (é
    // assim que a LP grava); cidade sem diferenciar maiúsculas, porque ela é
    // texto livre e a mesma cidade existe na base em duas caixas.
    ...(estado.length === 2 ? { state: estado.toUpperCase() } : {}),
    ...(cidade ? { city: { equals: cidade, mode: "insensitive" as const } } : {}),
    ...filtroDePeriodo(filtros.de, filtros.ate),
  };

  const entradasPorMes = bucketsDeMes(agora, filtros.de, filtros.ate);
  // A janela do gráfico começa no primeiro dia do mês mais antigo MOSTRADO —
  // que, com período longo, é mais recente que o início do período.
  const [anoJanela, mesJanela] = (entradasPorMes[0]?.chave ?? "").split("-");
  const inicioJanela = anoJanela
    ? new Date(Date.UTC(Number(anoJanela), Number(mesJanela) - 1, 1))
    : new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), 1));

  const [total, statusRaw, vendedoraRaw, naJanela, recentesRaw, motivoRaw] = await Promise.all([
    prisma.wholesaleLead.count({ where }),
    prisma.wholesaleLead.groupBy({ by: ["status"], where, _count: { _all: true } }),
    // Agrupado por vendedora E status na MESMA consulta: a conversão dela é
    // aprovadas ÷ recebidas, e separar isso em duas queries daria duas idas ao
    // banco para cruzar números que já vêm juntos.
    //
    // Roda para todo papel, e isso NÃO alarga nada: o `where` acima já começa
    // pelo escopo, então para quem não é Gestão este groupBy só pode devolver a
    // linha do próprio `sellerId`. É o que deixa a vendedora ver a conversão
    // dela sem ver a das colegas.
    prisma.wholesaleLead.groupBy({
      by: ["sellerId", "status"],
      where,
      _count: { _all: true },
    }),
    // Só a janela do gráfico sai do banco, e só a coluna da data: a contagem
    // por mês é feita em memória sobre um recorte limitado, em vez de SQL cru.
    prisma.wholesaleLead.findMany({
      where: { ...where, createdAt: { gte: inicioJanela } },
      select: { createdAt: true },
    }),
    // UMA, nao dez: desde que o painel de "ultimas candidaturas" virou
    // "reprovacoes por motivo", so o KPI da ultima candidatura le isto — e ele
    // usa `recentes[0]`. A lista inteira vive na tela ao lado.
    prisma.wholesaleLead.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 1,
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
    // As reprovações por motivo. Herda o MESMO `where`: o escopo do ator e o
    // período já vêm aplicados, então uma vendedora vê os motivos dela e não
    // os da equipe.
    prisma.wholesaleLead.groupBy({
      by: ["rejectionCode"],
      where: { ...where, status: WholesaleLeadStatus.REPROVADO },
      _count: { _all: true },
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

  const idsComDona = [...new Set(vendedoraRaw.map((v) => v.sellerId))].filter(
    (id): id is string => id != null,
  );
  const nomes = new Map<string, string>();
  if (idsComDona.length > 0) {
    // Inclui as INATIVAS: candidatura antiga continua apontando para quem saiu
    // da equipe, e sem o nome a barra ficaria anônima.
    for (const u of await prisma.user.findMany({
      where: { id: { in: idsComDona } },
      select: { id: true, name: true },
    })) {
      nomes.set(u.id, u.name);
    }
  }
  const porVendedora = agrupaPorVendedora(vendedoraRaw, nomes);

  const indice = new Map(entradasPorMes.map((b, i) => [b.chave, i]));
  for (const { createdAt } of naJanela) {
    const chave = `${createdAt.getUTCFullYear()}-${String(createdAt.getUTCMonth() + 1).padStart(2, "0")}`;
    const i = indice.get(chave);
    if (i != null) entradasPorMes[i].total++;
  }

  // APROVADO + COMPROU: quem comprou foi aprovada, e o status é um só. Sem o
  // COMPROU aqui, fechar uma venda derrubaria a taxa de aprovação.
  const aprovadas = APROVADAS.reduce((n, s) => n + (contagem.get(s) ?? 0), 0);
  const aprovacao = taxaDeConversao(aprovadas, total);
  const comprou = contagem.get(WholesaleLeadStatus.COMPROU) ?? 0;
  const conversao = taxaDeConversao(comprou, total);

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
    porMotivo: agrupaPorMotivo(motivoRaw),
    aprovacao,
    aprovadas,
    conversao,
    comprou,
  };
}
