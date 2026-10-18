/**
 * RODÍZIO DAS CANDIDATURAS QUE CHEGAM PELO LINK GERAL.
 *
 * Duas portas, dois comportamentos:
 *
 *   /atacado/okey?r=<codigo>   dona FIXA — a vendedora que mandou o link
 *   /atacado/okey              entra no RODÍZIO, e passa adiante a cada dia
 *
 * A regra, decidida pelo dono em 17/10/2026: a candidatura passa para a
 * vendedora seguinte a cada dia em que ninguém a avalia, contado **da
 * chegada**, e segue passando **até alguém avaliar** — sem teto de voltas.
 *
 * POR QUE CONTAR DA CHEGADA DEIXA ISTO SER UMA CONTA. Se o prazo corresse a
 * partir de "quando esta vendedora recebeu", a dona dependeria do histórico e
 * precisaria ser gravada a cada passagem, com um relógio batendo para empurrar.
 * Contando da chegada, a dona de qualquer instante é uma função de dois números
 * que já existem — o índice e a idade. Sem relógio, sem corrida, sem estado
 * intermediário.
 *
 * ESTE MÓDULO É PURO. O `sellerId` continua gravado no banco porque
 * `listLeadsFor` filtra por ele dentro do SQL e pagina no banco; dona derivada
 * em JavaScript trocaria uma consulta indexada por uma varredura que cresce com
 * o negócio. Quem concilia o gravado com esta conta é a leitura da fila (ver
 * `reconciliarRodizio` em wholesale-queries.ts) — mesmo padrão do Select.
 */

/** Quanto tempo a candidatura fica com cada vendedora antes de passar adiante. */
export const RODIZIO_PASSO_MS = 24 * 60 * 60 * 1000;

/**
 * Quantas vezes a candidatura já passou adiante desde que chegou.
 *
 * `Math.floor` e não arredondamento: às 23h59 do primeiro dia ela ainda é da
 * primeira vendedora, porque o dia prometido não se completou. Arredondar para
 * cima tiraria o lead das mãos de quem ainda está dentro do prazo.
 *
 * Nunca negativo. `createdAt` no futuro é relógio torto — de servidor ou de
 * banco —, e sem esta guarda viraria índice negativo, que no JavaScript produz
 * `undefined` num array e derrubaria a atribuição em silêncio.
 */
export function voltasDoRodizio(criadoEm: Date, agora: Date): number {
  const decorrido = agora.getTime() - criadoEm.getTime();
  if (!Number.isFinite(decorrido) || decorrido <= 0) return 0;
  return Math.floor(decorrido / RODIZIO_PASSO_MS);
}

/**
 * De quem é a candidatura agora.
 *
 * `ativas` precisa chegar em ordem ESTÁVEL (ordenar por `id`, nunca por nome
 * nem por data de criação): nome muda, e ordem instável faz a mesma conta dar
 * donas diferentes em duas leituras seguidas — a candidatura ficaria trocando
 * de mãos sem nenhum dia ter passado.
 *
 * Devolve `null` quando não há nenhuma vendedora de Atacado ativa. Nesse caso o
 * chamador deixa `sellerId` nulo e mantém o índice gravado: a candidatura é
 * atribuída na primeira leitura depois de alguém ser ativada, em vez de ser
 * recusada. Perder a candidatura seria o pior dos resultados — a lojista já
 * preencheu dezoito campos e mandou duas fotos.
 */
export function donaDoRodizio<T>(indice: number, voltas: number, ativas: readonly T[]): T | null {
  if (ativas.length === 0) return null;
  // `% n` de um número negativo é negativo no JavaScript. `indice` vem de uma
  // SEQUENCE (sempre positivo) e `voltas` é guardado acima, mas a soma é feita
  // aqui e esta linha é o que impede um valor estranho de virar `undefined`.
  const posicao = ((indice + voltas) % ativas.length + ativas.length) % ativas.length;
  return ativas[posicao];
}
