import { FOLLOWUP_STATUSES, type FollowUpKindValue } from "@/lib/validations/followup";

/**
 * A matemática do quadro de Acompanhamento — tudo PURO, nada de banco.
 *
 * Mora fora dos componentes porque é aqui que a checagem
 * (`scripts/checks/followup-kanban.ts`) alcança as duas regras da
 * especificação de 27/11/2026 que erram EM SILÊNCIO: somar o tempo no status
 * errado, e a volta a um status anterior apagando o tempo da primeira
 * passagem em vez de somar. As duas compilam, desenham e mostram números
 * plausíveis.
 *
 * O MODELO: a trilha de movimentação é a medição. Uma linha de
 * `FollowUpMovement` diz "saiu de X para Y, por Fulano, às 14:30" e, no mesmo
 * lugar, "e ficou 1h20 em X" (`elapsedMs`). Daí sai tudo, sem acumulador:
 * tempo em X é a soma das linhas cujo `fromStatus` é X.
 */

export type FollowUpStatusValue = (typeof FOLLOWUP_STATUSES)[number];

/**
 * A bolinha do cabeçalho da coluna, em hexadecimal (o `style` inline do
 * cabeçalho não aceita classe do Tailwind), nos mesmos tons já escolhidos para
 * os selos: VERMELHO só em "Precisa de Revisão", porque é o único status que
 * pede ação de quem passa os olhos no quadro, e um vermelho repartido entre
 * três status não aponta mais nada. "Em Espera" é âmbar porque parou sem ser
 * problema, e "Não Iniciado" fica neutro de propósito — ele é a AUSÊNCIA de
 * evolução, e cinco cores competindo pela atenção é o mesmo que nenhuma.
 */
export const FOLLOWUP_STATUS_COLOR: Record<FollowUpStatusValue, string> = {
  NAO_INICIADO: "#94a3b8",
  EM_ANDAMENTO: "#0ea5e9",
  PRECISA_REVISAO: "#f43f5e",
  EM_ESPERA: "#f59e0b",
  ENTREGUE: "#10b981",
};

/**
 * O selo de status, em classes do Tailwind. Veio de `followups-client.tsx`,
 * onde era `COR_DO_STATUS`, para ficar ao lado do hexadecimal da bolinha: são
 * o mesmo tom dito de dois jeitos, e separados eles divergiam no primeiro
 * ajuste.
 *
 * `outline` + par de tons, e não as variantes do Badge: aquelas são as cores de
 * SETOR do sistema, e usar "vendas" para "Entregue" amarraria o significado do
 * status à identidade do Comercial.
 *
 * Tom 800 no claro e 300 no escuro: são os que passam os 4.5:1 da WCAG AA
 * contra o fundo /15 do próprio selo.
 */
export const FOLLOWUP_STATUS_BADGE: Record<FollowUpStatusValue, string> = {
  NAO_INICIADO: "border-border text-muted-foreground",
  EM_ANDAMENTO: "border-sky-500/40 bg-sky-500/15 text-sky-700 dark:text-sky-300",
  PRECISA_REVISAO: "border-rose-500/40 bg-rose-500/15 text-rose-700 dark:text-rose-300",
  EM_ESPERA: "border-amber-500/40 bg-amber-500/15 text-amber-800 dark:text-amber-300",
  ENTREGUE: "border-emerald-500/40 bg-emerald-500/15 text-emerald-800 dark:text-emerald-300",
};

// ---------------------------------------------------------------------------
// OS TIPOS DA TELA
//
// Moram aqui, e não no componente, porque desde 27/11/2026 três arquivos de
// tela os compartilham (o quadro, o modal do formulário e a ficha). Com eles
// declarados em `followups-client.tsx`, os outros dois importariam de lá e
// `followups-client` importaria os componentes de volta — um ciclo que o
// TypeScript tolera em tipos e que nenhum leitor tolera.
// ---------------------------------------------------------------------------

/** Uma linha da trilha, como a tela a recebe (datas já em texto ISO). */
export interface MovementItem {
  id: string;
  /** Status de ONDE o card saiu — a chave pela qual o tempo é somado. */
  fromStatus: FollowUpStatusValue | null;
  toStatus: FollowUpStatusValue;
  changedByName: string;
  /** Milissegundos contados no `fromStatus`; nulo = ninguém cronometrava. */
  elapsedMs: number | null;
  createdAt: string;
}

/** Um registro de acompanhamento, como a tela o recebe. */
export interface FollowUpRow {
  id: string;
  kind: FollowUpKindValue;
  collaboratorId: string;
  collaboratorName: string;
  managerName: string;
  /** "YYYY-MM-DD" — já no fuso do negócio, formatado no servidor. */
  heldOn: string;
  strengths: string;
  improvement: string;
  collaboratorView: string;
  actionPlan: string;
  notes: string | null;
  performance: string | null;
  status: FollowUpStatusValue | null;
  topic: string | null;
  support: string | null;
  reviewOn: string | null;
  /** Instante ISO em que a contagem foi acionada; nulo = parada. */
  timerStartedAt: string | null;
  /** A trilha inteira do registro, em ordem cronológica. */
  movements: MovementItem[];
}

export interface ColaboradorOpt {
  id: string;
  name: string;
  /** Rótulo auxiliar na lista (papel / modelo de venda). */
  detalhe: string;
}

/** Tarefa do gestor já em andamento hoje, para o cronômetro do plano retomar. */
export interface TarefaAtiva {
  id: string;
  title: string;
  /** "HH:MM" de quando foi iniciada. */
  startTime: string | null;
}

/**
 * A coluna em que um registro cai.
 *
 * `status` nulo é NÃO INICIADO, e não uma sexta coluna: todo registro
 * quinzenal gravado antes de 17/11/2026 tem nulo, e sem esta tradução eles
 * desapareceriam do quadro — a tela não daria erro, só mostraria menos cards
 * do que existem. É também o motivo de a migração não ter feito UPDATE nesses
 * nulos: a leitura resolve, e o `OR` de `filtroDeSituacao` continua precisando
 * deles de qualquer forma.
 */
export const colunaDe = (status: FollowUpStatusValue | null): FollowUpStatusValue =>
  status ?? "NAO_INICIADO";

/**
 * Quanto tempo o registro passou em CADA status.
 *
 * Soma por `fromStatus` — o tempo decorrido pertence ao status de onde o card
 * saiu, não ao de destino. Somar por `toStatus` atribuiria cada trecho ao
 * status seguinte, o que compila e desenha.
 *
 * SOMA, nunca atribui: é isto que faz "voltou a um status anterior e a
 * contagem prossegue de onde parou" funcionar sem nenhum código próprio.
 *
 * `elapsedMs` nulo é IGNORADO, não somado como zero: nulo significa "não foi
 * cronometrado", e zero afirmaria uma medição que deu nada.
 */
export function tempoPorStatus(
  movs: readonly MovementItem[],
): Record<FollowUpStatusValue, number> {
  const por = Object.fromEntries(FOLLOWUP_STATUSES.map((s) => [s, 0])) as Record<
    FollowUpStatusValue,
    number
  >;
  for (const m of movs) {
    if (m.elapsedMs === null) continue;
    por[colunaDe(m.fromStatus)] += m.elapsedMs;
  }
  return por;
}

/**
 * A duração de execução da atividade: os trechos já fechados mais o que está
 * correndo agora.
 *
 * `agora` ENTRA POR PARÂMETRO para a checagem poder fixar o instante, e porque
 * no card ele é o relógio que avança de segundo em segundo.
 *
 * O piso em zero não é zelo: `timerStartedAt` vem do relógio do SERVIDOR e
 * `agora` é o do navegador. Um cliente atrasado produziria uma duração
 * negativa correndo para trás ao lado do cronômetro.
 */
export function tempoTotal(
  movs: readonly MovementItem[],
  timerStartedAt: string | null,
  agora: number,
): number {
  let total = 0;
  for (const m of movs) total += m.elapsedMs ?? 0;
  if (timerStartedAt) total += Math.max(0, agora - Date.parse(timerStartedAt));
  return total;
}

/**
 * Duração para leitura humana.
 *
 * Zero é "—", não "0min": zero afirmaria que houve medição e ela deu nada,
 * quando o caso real é "ninguém cronometrou este registro". Abaixo de um
 * minuto é "<1min" pelo mesmo motivo — arredondar para 0min diria o mesmo que
 * não ter contado.
 *
 * Os minutos vêm com dois dígitos ("2h05") para a coluna de cards não dançar
 * de largura a cada card.
 */
export function formatarDuracao(ms: number): string {
  if (ms <= 0) return "—";
  if (ms < 60_000) return "<1min";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}min`;
  if (ms < 86_400_000) {
    const h = Math.floor(ms / 3_600_000);
    const m = Math.floor((ms % 3_600_000) / 60_000);
    return `${h}h${String(m).padStart(2, "0")}`;
  }
  const d = Math.floor(ms / 86_400_000);
  return `${d}d ${Math.floor((ms % 86_400_000) / 3_600_000)}h`;
}

export interface FollowUpSummary {
  total: number;
  emAndamento: number;
  precisaRevisao: number;
  emEspera: number;
  entregues: number;
  reavaliacaoVencida: number;
  /**
   * Quantos registros há em cada coluna NO FILTRO — o "de 11" do topo da
   * coluna. Sai do mesmo resumo, e não de um `groupBy` à parte, para que o
   * cabeçalho da coluna e os KPIs nunca contem conjuntos diferentes.
   */
  porStatus: Record<FollowUpStatusValue, number>;
}

/**
 * Os números do topo do quadro.
 *
 * RECEBE O CONJUNTO DO FILTRO, nunca a página. O dono escolheu manter a
 * paginação de cinco no quadro (27/11/2026); se estes números contassem a
 * página, o topo da tela diria "Total de registros: 5" num ano com trinta.
 *
 * `reavaliacaoVencida` compara as datas como TEXTO "YYYY-MM-DD": nesse formato
 * a ordem alfabética é a ordem cronológica, e é assim que `reviewOn` chega da
 * página, já formatado no fuso do negócio. Comparar `Date` aqui reintroduziria
 * o fuso do servidor, que é o erro que `instanteNoFuso` existe para evitar.
 * O prazo de HOJE não está vencido — vence depois que o dia passa. E
 * ENTREGUE nunca vence: a reavaliação já não é cobrança.
 */
export function resumirFollowUps(
  rows: readonly { status: FollowUpStatusValue | null; reviewOn: string | null }[],
  hoje: string,
): FollowUpSummary {
  const porStatus = Object.fromEntries(FOLLOWUP_STATUSES.map((s) => [s, 0])) as Record<
    FollowUpStatusValue,
    number
  >;
  // `colunaDe` e não `r.status`: o nulo dos quinzenais antigos tem de contar na
  // coluna em que o quadro o desenha, senão o cabeçalho diria "0 de 0" numa
  // coluna com cartões dentro.
  for (const r of rows) porStatus[colunaDe(r.status)] += 1;

  return {
    total: rows.length,
    emAndamento: porStatus.EM_ANDAMENTO,
    precisaRevisao: porStatus.PRECISA_REVISAO,
    emEspera: porStatus.EM_ESPERA,
    entregues: porStatus.ENTREGUE,
    reavaliacaoVencida: rows.filter(
      (r) => r.reviewOn !== null && r.reviewOn < hoje && r.status !== "ENTREGUE",
    ).length,
    porStatus,
  };
}

/**
 * O número no topo da coluna.
 *
 * Existe por causa da paginação que o dono manteve no quadro: com cinco cards
 * por página, "3" num status que tem 11 registros no filtro é a tela mentindo
 * sobre o que existe. Quando a página mostra tudo, o "de N" só seria ruído.
 */
export const rotuloDaColuna = (naPagina: number, noFiltro: number): string =>
  naPagina === noFiltro ? String(naPagina) : `${naPagina} de ${noFiltro}`;

/**
 * O que vai para a trilha quando alguém move o card ou pausa a contagem — ou
 * `null` quando não há nada a gravar.
 *
 * PARTE PURA das actions, e está aqui porque é por onde tempo errado entraria
 * numa trilha de auditoria. `agora` é SEMPRE o relógio do servidor: o cliente
 * não envia duração, senão um navegador adiantado gravaria tempo falso.
 *
 * Mover para o MESMO status não é movimento (é o arrasto que termina na
 * própria coluna) — mas a PAUSA é exatamente uma linha de mesmo status, que é
 * o único jeito de registrar o trecho contado sem mexer no card. São perguntas
 * diferentes, por isso o `pausa`.
 */
export function decidirMovimento(
  atual: FollowUpStatusValue | null,
  destino: FollowUpStatusValue,
  timerStartedAt: string | null,
  agora: number,
  opts?: { pausa?: boolean },
): { fromStatus: FollowUpStatusValue; toStatus: FollowUpStatusValue; elapsedMs: number | null } | null {
  const de = colunaDe(atual);
  const decorrido = timerStartedAt ? Math.max(0, agora - Date.parse(timerStartedAt)) : null;

  if (opts?.pausa) {
    // Sem contagem aberta não há trecho: pausar duas vezes não pode gravar uma
    // linha vazia na trilha.
    if (decorrido === null) return null;
    return { fromStatus: de, toStatus: de, elapsedMs: decorrido };
  }

  if (de === destino) return null;
  return { fromStatus: de, toStatus: destino, elapsedMs: decorrido };
}
