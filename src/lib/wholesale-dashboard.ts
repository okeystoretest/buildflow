import { prisma } from "@/lib/prisma";
import { WholesaleLeadStatus, WholesalePurchaseState, type Prisma } from "@prisma/client";
import {
  canUseWholesaleTool,
  STATUS_VIVOS,
  type WholesaleActor,
} from "@/lib/wholesale-permissions";
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

export interface ContagemPorUf {
  /** UF em maiúsculas, ou "—" quando a candidata não informou. */
  uf: string;
  total: number;
  /** Quantas candidaturas daquela UF já compraram. */
  comprou: number;
  /** Compraram ÷ recebidas DAQUELA UF, em 0–100 — `taxaDeConversao`. */
  conversao: number;
}

/**
 * Dias de espera em que uma candidatura em análise passa a ser "parada".
 *
 * Sete dias, e não um número redondo maior: a lojista preencheu um formulário
 * esperando resposta, e uma semana é o limite em que ela ainda lembra de ter
 * mandado. Mexer aqui muda o cartão da tela E a linha do PDF de uma vez.
 */
export const DIAS_PARADA = 7;

const MS_POR_DIA = 24 * 60 * 60 * 1000;

export interface TempoDeResposta {
  /**
   * Média de dias entre chegar e ser decidida, só das JÁ DECIDIDAS do recorte.
   *
   * As pendentes ficam FORA da média de propósito: elas não têm duração ainda,
   * e contá-las com a idade atual faria o tempo médio subir todo dia sem
   * ninguém ter demorado mais. O que elas têm é `paradas` e `maisAntigaDias`.
   */
  mediaDias: number;
  /** Quantas decisões entraram na média — o denominador dela. */
  decididas: number;
  /** Em análise há mais de `DIAS_PARADA` dias. É o número que cobra ação. */
  paradas: number;
  /** Idade em dias da mais antiga ainda em análise. 0 quando não há nenhuma. */
  maisAntigaDias: number;
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

/**
 * O recorte em palavras, para a capa do relatório.
 *
 * O PDF SAI DA MESMA URL DA TELA, então sem esta linha dois arquivos com o
 * mesmo título trazem números diferentes e ninguém descobre por quê — é a
 * mesma razão pela qual o relatório de vendas imprime os filtros aplicados.
 *
 * "Todo o histórico" quando não há período, e não um intervalo inventado: a
 * tela abre sem recorte desde 03/11/2026, e um PDF que anunciasse o mês vigente
 * estaria mentindo sobre o que somou.
 *
 * `nomeVendedora` chega resolvido de fora (quem consulta o nome é quem tem o
 * banco à mão); o id sozinho não diz nada a quem lê o papel.
 */
export function descreverRecorte(
  filtros: FiltrosDoPainel,
  nomeVendedora?: string | null,
): string {
  const de = (filtros.de ?? "").trim();
  const ate = (filtros.ate ?? "").trim();
  const br = (iso: string) => iso.split("-").reverse().join("/");

  const partes: string[] = [
    de && ate ? `de ${br(de)} a ${br(ate)}`
    : de ? `desde ${br(de)}`
    : ate ? `até ${br(ate)}`
    : "todo o histórico",
  ];
  if (nomeVendedora) partes.push(`vendedora: ${nomeVendedora}`);
  const marca = marcaValida(filtros.marca);
  if (marca) partes.push(`marca: ${marca}`);
  const estado = (filtros.estado ?? "").trim();
  if (estado.length === 2) partes.push(`UF: ${estado.toUpperCase()}`);
  const cidade = (filtros.cidade ?? "").trim();
  if (cidade) partes.push(`cidade: ${cidade}`);
  return partes.join(" · ");
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
   * Volume e conversão por UF da loja, da que mais recebeu para a que menos.
   *
   * É a pergunta "onde vale investir" — a única do relatório gerencial que a
   * tela não respondia: UF e cidade já eram FILTRO desde 29/10/2026, mas a
   * Gestão tinha de adivinhar qual escolher para achar a praça que converte.
   */
  porUf: ContagemPorUf[];
  /** Quanto a equipe demora para decidir, e o que está parado. */
  tempo: TempoDeResposta;
  /**
   * TAXA DE APROVAÇÃO: aprovadas ÷ total recebido, em 0–100.
   *
   * Chamava-se `conversao` até 28/10/2026. Foi renomeada porque a tela passou a
   * ter DUAS taxas — esta e a conversão de verdade (quem comprou ÷ recebidas) —
   * e um campo chamado "conversao" guardando a aprovação seria a troca mais
   * fácil de fazer sem ninguém notar.
   */
  aprovacao: number;
  /**
   * Quantas estão em APROVADO.
   *
   * Era `APROVADO + COMPROU` até 30/10/2026, somados à mão por uma constante
   * `APROVADAS`, porque quem comprava deixava de estar em APROVADO e esquecer a
   * soma fazia a taxa de aprovação CAIR a cada venda fechada. Com a compra em
   * eixo próprio a armadilha deixou de existir: aprovada continua aprovada
   * depois de comprar, e a contagem é direta.
   */
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
  porUf: [],
  tempo: { mediaDias: 0, decididas: 0, paradas: 0, maisAntigaDias: 0 },
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
 * As linhas (vendedora × estado de compra) do `groupBy` viram uma linha por
 * vendedora, com total, quantas compraram e a taxa de conversão dela.
 *
 * AGRUPA POR `purchaseState`, E NÃO POR `status`: a compra saiu do eixo do
 * status em 30/10/2026. O `total` segue correto porque TODA candidatura tem um
 * `purchaseState` (a coluna é NOT NULL com default), então somar as linhas de
 * uma vendedora ainda dá tudo que ela recebeu — inclusive o que nem foi
 * analisado.
 *
 * PURO e exportado pelo mesmo motivo que `taxaDeConversao`: é a conta que o
 * painel mostra, e conta que nenhum script confere é conta que se perde numa
 * refatoração. Ordenado por VOLUME — quem lê por taxa reordena na tela, e o
 * `lider` ("quem mais recebeu") depende desta ordem.
 */
export function agrupaPorVendedora(
  linhas: {
    sellerId: string | null;
    purchaseState: WholesalePurchaseState;
    _count: { _all: number };
  }[],
  nomes: Map<string, string>,
): ContagemPorVendedora[] {
  // Chave de string porque `null` (sem dona) também é uma linha do painel.
  const porDona = new Map<string, { total: number; comprou: number }>();
  for (const l of linhas) {
    const chave = l.sellerId ?? "";
    const acc = porDona.get(chave) ?? { total: 0, comprou: 0 };
    acc.total += l._count._all;
    if (l.purchaseState === WholesalePurchaseState.COMPROU) acc.comprou += l._count._all;
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

/**
 * As linhas (UF × estado de compra) do `groupBy` viram uma linha por UF, com
 * total, quantas compraram e a conversão da praça.
 *
 * Mesma forma de `agrupaPorVendedora`, e pelo mesmo motivo: é a conta que a
 * tela e o PDF mostram, e conta que script nenhum confere é conta que se perde
 * numa refatoração.
 *
 * UF VAZIA vira "—" em vez de sumir: a LP grava `state` como texto e cadastro
 * antigo chegou sem ele. Escondendo a linha, as parcelas não fechariam com o
 * total recebido, e diferença inexplicada é pior que a linha a mais.
 *
 * Ordenado por VOLUME — a Gestão lê "de onde vem gente" antes de "onde
 * converte", e a conversão de uma UF com uma candidatura só seria 0% ou 100%
 * no topo de uma lista ordenada por taxa.
 */
export function agrupaPorUf(
  linhas: {
    state: string;
    purchaseState: WholesalePurchaseState;
    _count: { _all: number };
  }[],
): ContagemPorUf[] {
  const porUf = new Map<string, { total: number; comprou: number }>();
  for (const l of linhas) {
    const chave = (l.state ?? "").trim().toUpperCase() || "—";
    const acc = porUf.get(chave) ?? { total: 0, comprou: 0 };
    acc.total += l._count._all;
    if (l.purchaseState === WholesalePurchaseState.COMPROU) acc.comprou += l._count._all;
    porUf.set(chave, acc);
  }
  return [...porUf.entries()]
    .map(([uf, { total, comprou }]) => ({
      uf,
      total,
      comprou,
      conversao: taxaDeConversao(comprou, total),
    }))
    .sort((a, b) => b.total - a.total || a.uf.localeCompare(b.uf, "pt-BR"));
}

/**
 * Tempo de resposta do recorte: média das decididas, e o que está parado.
 *
 * DOIS GRUPOS, nunca misturados. A média olha para trás (quanto demorou de
 * fato) e só conta quem tem `decidedAt`. O que está parado olha para agora
 * (quem espera há mais de `DIAS_PARADA` dias) e só conta quem está em
 * EM_ANALISE — CUIDADO é uma decisão tomada, e tratá-lo como fila faria o
 * número cobrar ação sobre candidatura já julgada.
 *
 * `decidedAt` ausente numa decidida é ignorado em silêncio: são as decisões de
 * antes da coluna existir, e somá-las como zero dia puxaria a média para baixo
 * exatamente onde ela precisa ser confiável.
 *
 * PURA e exportada para poder ser conferida por script, como as demais contas
 * do painel. `agora` entra por parâmetro pelo mesmo motivo — teste de tempo
 * com `new Date()` dentro da função não existe.
 */
export function tempoDeResposta(
  linhas: { createdAt: Date; decidedAt: Date | null; status: WholesaleLeadStatus }[],
  agora: Date,
): TempoDeResposta {
  let somaDias = 0;
  let decididas = 0;
  let paradas = 0;
  let maisAntigaDias = 0;

  for (const l of linhas) {
    if (l.decidedAt) {
      // Negativo não existe em dado são (decidir antes de chegar), mas um
      // `decidedAt` importado errado jogaria a média para baixo sem aviso.
      const dias = Math.max(0, (l.decidedAt.getTime() - l.createdAt.getTime()) / MS_POR_DIA);
      somaDias += dias;
      decididas++;
      continue;
    }
    if (l.status !== WholesaleLeadStatus.EM_ANALISE) continue;
    const idade = Math.max(0, (agora.getTime() - l.createdAt.getTime()) / MS_POR_DIA);
    if (idade > DIAS_PARADA) paradas++;
    if (idade > maisAntigaDias) maisAntigaDias = idade;
  }

  return {
    mediaDias: decididas === 0 ? 0 : Math.round((somaDias / decididas) * 10) / 10,
    decididas,
    paradas,
    maisAntigaDias: Math.floor(maisAntigaDias),
  };
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

  const [
    total,
    statusRaw,
    vendedoraRaw,
    naJanela,
    recentesRaw,
    motivoRaw,
    comprou,
    ufRaw,
    prazos,
  ] = await Promise.all([
    prisma.wholesaleLead.count({ where }),
    prisma.wholesaleLead.groupBy({ by: ["status"], where, _count: { _all: true } }),
    // Agrupado por vendedora E estado de COMPRA na MESMA consulta: a conversão
    // dela é compraram ÷ recebidas, e separar isso em duas queries daria duas
    // idas ao banco para cruzar números que já vêm juntos.
    //
    // Roda para todo papel, e isso NÃO alarga nada: o `where` acima já começa
    // pelo escopo, então para quem não é Gestão este groupBy só pode devolver a
    // linha do próprio `sellerId`. É o que deixa a vendedora ver a conversão
    // dela sem ver a das colegas.
    prisma.wholesaleLead.groupBy({
      by: ["sellerId", "purchaseState"],
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
    // O numerador da conversão TOTAL, no eixo da compra.
    //
    // Consulta própria em vez de sair do `groupBy` por status: são eixos
    // diferentes desde 30/10/2026, e espremer os dois num `groupBy` de duas
    // colunas só para economizar uma contagem daria uma matriz
    // status × purchaseState que ninguém mais usa.
    prisma.wholesaleLead.count({
      where: { ...where, purchaseState: WholesalePurchaseState.COMPROU },
    }),
    // UF × compra na MESMA consulta, como o groupBy por vendedora: a conversão
    // da praça é compraram ÷ recebidas dali, e separar em duas queries daria
    // duas idas ao banco para cruzar números que já vêm juntos.
    //
    // Herda o `where`, escopo incluído: a vendedora vê as praças DELA, não o
    // mapa de onde a equipe vende.
    prisma.wholesaleLead.groupBy({
      by: ["state", "purchaseState"],
      where,
      _count: { _all: true },
    }),
    // As DATAS do recorte, para o tempo de resposta. Três colunas pequenas e a
    // conta em memória (`tempoDeResposta`), em vez de SQL cru: um AVG em
    // `$queryRaw` obrigaria a reescrever este `where` à mão em SQL, e ele é o
    // escopo de segurança — duplicá-lo é como se perde o escopo de verdade.
    //
    // shortcut: traz uma linha de 3 campos por candidatura do recorte, e sem
    // período o recorte é a base inteira. Na ordem de grandeza desta fila
    // (milhares) é barato; passando de ~50 mil candidaturas, troque por
    // contagens agregadas com um corte de data.
    prisma.wholesaleLead.findMany({
      where,
      select: { createdAt: true, decidedAt: true, status: true },
    }),
  ]);

  // Todos os status VIVOS aparecem, inclusive os zerados e o CUIDADO. Mostrar
  // só os três pedidos faria as parcelas não fecharem com o total, e a
  // diferença inexplicada é pior que a linha a mais.
  //
  // `STATUS_VIVOS` e não `Object.values(WholesaleLeadStatus)`: o enum ainda
  // carrega o COMPROU legado, que entraria aqui como balde eternamente zerado.
  const contagem = new Map(statusRaw.map((s) => [s.status, s._count._all]));
  const porStatus = STATUS_VIVOS.map((status) => ({
    status: status as WholesaleLeadStatus,
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

  // Contagem DIRETA de APROVADO. Até 30/10/2026 era preciso somar
  // APROVADO + COMPROU à mão porque comprar tirava a candidatura de APROVADO, e
  // esquecer a soma derrubava esta taxa a cada venda fechada. A compra virou
  // eixo próprio: aprovada continua aprovada, e a armadilha não existe mais.
  const aprovadas = contagem.get(WholesaleLeadStatus.APROVADO) ?? 0;
  const aprovacao = taxaDeConversao(aprovadas, total);
  // `comprou` vem da sua própria contagem, no eixo da compra.
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
    porUf: agrupaPorUf(ufRaw),
    tempo: tempoDeResposta(prazos, agora),
    aprovacao,
    aprovadas,
    conversao,
    comprou,
  };
}
