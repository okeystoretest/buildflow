/**
 * JANELAS DE TEMPO DO RANKING — ancoradas no fuso do NEGÓCIO, não no do servidor.
 * ---------------------------------------------------------------------------
 * POR QUE ESTE MÓDULO EXISTE
 *
 * As janelas de mês e semana eram construídas com `new Date(year, month-1, 1)`,
 * que resolve no fuso LOCAL do processo. O contêiner roda em UTC (`node:20-slim`
 * sem `TZ` no Dockerfile) e o negócio opera em horário de Brasília (UTC-3).
 * A virada do mês acontecia, portanto, às 21:00 do último dia — e toda venda
 * registrada entre 21:00 e 23:59 caía no mês seguinte.
 *
 * O `TZ` também passou a ser definido no Dockerfile, mas isso sozinho não basta:
 * qualquer servidor que rode a aplicação fora de contêiner voltaria a errar em
 * silêncio. Aqui o fuso é explícito e o cálculo não depende do ambiente.
 *
 * Sem dependência externa: o deslocamento sai do próprio `Intl`, então uma
 * eventual volta do horário de verão passa a valer sem mudar código.
 *
 * NÃO adicionar "use server": é usado por Server Components e por módulos
 * server-side comuns.
 */

/** Fuso em que o negócio opera. Toda janela do ranking é ancorada nele. */
export const FUSO_NEGOCIO = "America/Sao_Paulo";

export interface Janela {
  /** Primeiro instante incluído. */
  inicio: Date;
  /** Primeiro instante JÁ FORA da janela (exclusivo). */
  fim: Date;
}

/**
 * Quanto o relógio de parede do fuso está adiantado em relação ao UTC, em ms,
 * NAQUELE instante. Positivo a leste de Greenwich; no Brasil, negativo.
 */
function deslocamentoMs(instante: Date, fuso: string): number {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: fuso,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instante);

  const campo = (tipo: string) => Number(partes.find((p) => p.type === tipo)?.value ?? 0);
  // `hour` volta como 24 na meia-noite em alguns runtimes; 24 % 24 = 0.
  const comoUtc = Date.UTC(
    campo("year"),
    campo("month") - 1,
    campo("day"),
    campo("hour") % 24,
    campo("minute"),
    campo("second"),
  );
  return comoUtc - instante.getTime();
}

/**
 * Instante UTC correspondente a um horário de PAREDE no fuso do negócio.
 * Ex.: `instanteNoFuso(2026, 9, 1)` = 01/09/2026 00:00 em Brasília.
 *
 * Duas passadas: a primeira estima o deslocamento, a segunda o confirma no
 * instante já corrigido. É o que mantém a conta certa nas bordas de horário
 * de verão, quando o deslocamento muda no meio do próprio dia.
 */
export function instanteNoFuso(
  ano: number,
  mes: number,
  dia: number,
  hora = 0,
  minuto = 0,
  segundo = 0,
  fuso: string = FUSO_NEGOCIO,
): Date {
  const parede = Date.UTC(ano, mes - 1, dia, hora, minuto, segundo);
  const primeira = parede - deslocamentoMs(new Date(parede), fuso);
  const segunda = parede - deslocamentoMs(new Date(primeira), fuso);
  return new Date(segunda);
}

/** Janela [início, fim) do mês informado, no fuso do negócio. */
export function janelaDoMes(ano: number, mes: number, fuso: string = FUSO_NEGOCIO): Janela {
  return {
    inicio: instanteNoFuso(ano, mes, 1, 0, 0, 0, fuso),
    // Mês 13 normaliza para janeiro do ano seguinte dentro do próprio Date.UTC.
    fim: instanteNoFuso(mes === 12 ? ano + 1 : ano, mes === 12 ? 1 : mes + 1, 1, 0, 0, 0, fuso),
  };
}

/** Componentes de calendário de um instante, lidos no fuso do negócio. */
function dataNoFuso(instante: Date, fuso: string): { ano: number; mes: number; dia: number } {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: fuso,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instante);
  const campo = (tipo: string) => Number(partes.find((p) => p.type === tipo)?.value ?? 0);
  return { ano: campo("year"), mes: campo("month"), dia: campo("day") };
}

/**
 * Domingo 00:00 (no fuso do negócio) da semana que contém `agora`.
 *
 * O dia da semana sai do calendário já convertido ao fuso — não de
 * `getDay()`, que responderia pelo fuso do servidor e viraria a semana
 * três horas antes.
 */
export function inicioDaSemana(agora: Date, fuso: string = FUSO_NEGOCIO): Date {
  const { ano, mes, dia } = dataNoFuso(agora, fuso);
  const diaDaSemana = new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay(); // 0 = domingo
  return instanteNoFuso(ano, mes, dia - diaDaSemana, 0, 0, 0, fuso);
}

/**
 * Janela da semana corrente RECORTADA pelo mês exibido.
 *
 * Sem o recorte, a semana que começa no domingo do mês anterior faz o KPI
 * "Maior Venda Semanal" exibir uma venda de outro mês sob o painel do mês
 * atual. O limite superior fecha junto com o mês pelo mesmo motivo.
 */
export function janelaDaSemana(
  agora: Date,
  ano: number,
  mes: number,
  fuso: string = FUSO_NEGOCIO,
): Janela {
  const mesJanela = janelaDoMes(ano, mes, fuso);
  const semana = inicioDaSemana(agora, fuso);
  return {
    inicio: semana > mesJanela.inicio ? semana : mesJanela.inicio,
    fim: mesJanela.fim,
  };
}

/**
 * CORTE dos ajustes manuais LEGADOS (`RankAdjustment.baselineAt` nulo).
 *
 * A constante de corte é um instante único, cravado na migração que introduziu
 * o ajuste incremental. Ela só descreve o mês em que foi criada. Aplicada a
 * qualquer outro mês ela produz conta errada: num mês inteiramente posterior,
 * TODO pedido vira "pós-corte", o consolidado até o corte zera e o valor
 * digitado passa a SOMAR sobre o mês inteiro em vez de substituí-lo — o
 * realizado da vendedora dobra.
 *
 * Fora da janela, o corte cai para o fim do mês. Isso devolve a semântica
 * original do ajuste legado (o valor digitado responde pelo mês inteiro) e
 * elimina a contagem dobrada. Dentro da janela, a constante é preservada
 * exatamente como está hoje.
 */
export function corteLegado(constante: Date, janela: Janela): Date {
  const dentro = constante >= janela.inicio && constante < janela.fim;
  return dentro ? constante : janela.fim;
}
