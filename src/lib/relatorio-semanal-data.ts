import { prisma } from "@/lib/prisma";
import {
  contarEntregas,
  estaAtrasado,
  mediaDasSemanas,
  resumirKanban,
  type AgendaItem,
  type BlockerItem,
  type DeliveryItem,
  type KanbanSummary,
  type MarketingTaskItem,
  type MetricItem,
  type OkrItem,
  type TaskPerson,
} from "@/lib/relatorio-semanal-math";

/**
 * Leitura do Relatório Semanal do Marketing.
 *
 * SEM ESCOPO. No Build.Connect toda consulta carrega o `subsectorId`, porque
 * lá a ferramenta vive em vários subsetores e o id no WHERE é o que impede
 * abrir o relatório de outra área por id colado na URL. Aqui o Marketing é um
 * só: não há outra área de onde o id pudesse vir, e a porta está na página
 * (`requireRole(["GESTAO"])`), não na consulta.
 *
 * Nenhuma conta sai do banco: variação, % da meta, média de 4 semanas e o
 * painel do quadro são calculados aqui na leitura, por
 * `relatorio-semanal-math.ts`.
 */

/** `@db.Date` do Prisma → "yyyy-mm-dd". */
function isoDia(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/** Hoje em "yyyy-mm-dd", em UTC — a mesma régua das colunas `@db.Date`. */
export function hojeIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** O card da lista: o bastante para escolher qual semana abrir. */
export interface WeeklyReportListItem {
  id: string;
  weekNumber: number;
  /** yyyy-mm-dd. */
  periodStart: string;
  periodEnd: string;
  authorName?: string;
  /** A frase que a reunião lê primeiro — o card mostra as duas linhas dela. */
  highlight?: string;
  /** Contadores das entregas, calculados no servidor. */
  onTrack: number;
  attention: number;
  blocked: number;
  /** Entregas sem status: o que ainda falta responder. */
  pending: number;
}

export interface WeeklyReportDetail extends WeeklyReportListItem {
  learning?: string;
  nextPriority?: string;
  deliveries: readonly DeliveryItem[];
  metrics: readonly MetricItem[];
  okrs: readonly OkrItem[];
  blockers: readonly BlockerItem[];
  agenda: readonly AgendaItem[];
}

export interface WeeklyReportData {
  reports: readonly WeeklyReportListItem[];
  tasks: readonly MarketingTaskItem[];
  summary: KanbanSummary;
  /** Quem pode ser responsável por um cartão. */
  people: readonly TaskPerson[];
}

type TaskRow = {
  id: string;
  code: string;
  title: string;
  category: MarketingTaskItem["category"];
  priority: MarketingTaskItem["priority"];
  assignee: { id: string; name: string } | null;
  enteredAt: Date;
  dueDate: Date | null;
  status: MarketingTaskItem["status"];
  evidence: string | null;
  note: string | null;
  doneAt: Date | null;
};

function toTask(row: TaskRow): MarketingTaskItem {
  const task = {
    id: row.id,
    code: row.code,
    title: row.title,
    category: row.category,
    priority: row.priority,
    assignee: row.assignee ? { id: row.assignee.id, name: row.assignee.name } : undefined,
    enteredAt: isoDia(row.enteredAt),
    dueDate: row.dueDate ? isoDia(row.dueDate) : undefined,
    status: row.status,
    evidence: row.evidence ?? undefined,
    note: row.note ?? undefined,
    doneAt: row.doneAt?.toISOString(),
    overdue: false,
  };
  return { ...task, overdue: estaAtrasado(task, hojeIso()) };
}

export async function getRelatorioSemanalData(): Promise<WeeklyReportData> {
  const [reportRows, taskRows, peopleRows] = await Promise.all([
    prisma.weeklyReport.findMany({
      orderBy: { periodStart: "desc" },
      select: {
        id: true,
        weekNumber: true,
        periodStart: true,
        periodEnd: true,
        highlight: true,
        createdBy: { select: { name: true } },
        // Só a saúde: o card mostra os três contadores do rodapé da aba 2, e
        // trazer evidência e observação de 22 linhas por semana para montar
        // uma contagem seria carregar o relatório inteiro para desenhar um
        // card.
        deliveries: { select: { health: true } },
      },
    }),
    prisma.marketingTask.findMany({
      orderBy: [{ status: "asc" }, { priority: "asc" }, { code: "asc" }],
      select: {
        id: true,
        code: true,
        title: true,
        category: true,
        priority: true,
        assignee: { select: { id: true, name: true } },
        enteredAt: true,
        dueDate: true,
        status: true,
        evidence: true,
        note: true,
        doneAt: true,
      },
    }),
    // Quem pode ser responsável: QUALQUER pessoa ativa.
    //
    // No Build.Connect a lista é só quem está lotado no subsetor, para um
    // cartão do Marketing não cair no nome de alguém da Logística. O
    // buildflow não tem lotação por área — só o papel, que diz o setor da
    // pessoa, não em que ela trabalha. Restringir a GESTAO deixaria a lista
    // com uma pessoa; a empresa inteira é o conjunto honesto.
    //
    // A trava que importava continua de pé no outro lado: a action confere no
    // servidor que o id recebido do navegador é de usuário ATIVO, em vez de
    // confiar na lista que a tela mostrou.
    prisma.user.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const reports: WeeklyReportListItem[] = reportRows.map((row) => ({
    id: row.id,
    weekNumber: row.weekNumber,
    periodStart: isoDia(row.periodStart),
    periodEnd: isoDia(row.periodEnd),
    authorName: row.createdBy?.name,
    highlight: row.highlight ?? undefined,
    ...contarEntregas(row.deliveries),
  }));

  const tasks = taskRows.map(toTask);

  return {
    reports,
    tasks,
    summary: resumirKanban(tasks),
    people: peopleRows,
  };
}

export async function getRelatorioSemanalDetail(
  reportId: string,
): Promise<WeeklyReportDetail | null> {
  const row = await prisma.weeklyReport.findUnique({
    where: { id: reportId },
    select: {
      id: true,
      weekNumber: true,
      periodStart: true,
      periodEnd: true,
      highlight: true,
      learning: true,
      nextPriority: true,
      createdBy: { select: { name: true } },
      deliveries: { orderBy: { order: "asc" } },
      metrics: { orderBy: { order: "asc" } },
      okrs: { orderBy: { order: "asc" } },
      blockers: { orderBy: { order: "asc" } },
      agenda: { orderBy: { order: "asc" } },
    },
  });
  if (!row) return null;

  // Média de 4 semanas (o K2 da aba "OKRs Semanais"): as três semanas
  // anteriores mais esta, casando os KRs pelo TEXTO do resultado-chave.
  //
  // Pelo texto, e não por id, porque cada relatório tem as suas próprias
  // linhas de OKR — é o que preserva a história quando o modelo muda. O preço
  // é que renomear um KR reinicia a média dele, e isso é o certo: um KR
  // renomeado mede outra coisa.
  const anteriores = await prisma.weeklyReport.findMany({
    where: { periodStart: { lt: row.periodStart } },
    orderBy: { periodStart: "desc" },
    take: 3,
    select: { okrs: { select: { keyResult: true, achieved: true } } },
  });
  const historico = new Map<string, (number | undefined)[]>();
  for (const okr of row.okrs) {
    historico.set(okr.keyResult, [okr.achieved ?? undefined]);
  }
  for (const anterior of anteriores) {
    for (const okr of anterior.okrs) {
      historico.get(okr.keyResult)?.push(okr.achieved ?? undefined);
    }
  }

  return {
    id: row.id,
    weekNumber: row.weekNumber,
    periodStart: isoDia(row.periodStart),
    periodEnd: isoDia(row.periodEnd),
    authorName: row.createdBy?.name,
    ...contarEntregas(row.deliveries),
    highlight: row.highlight ?? undefined,
    learning: row.learning ?? undefined,
    nextPriority: row.nextPriority ?? undefined,
    deliveries: row.deliveries.map((d) => ({
      id: d.id,
      order: d.order,
      day: d.day,
      block: d.block,
      expected: d.expected,
      health: d.health ?? undefined,
      evidence: d.evidence ?? undefined,
      note: d.note ?? undefined,
    })),
    metrics: row.metrics.map((m) => ({
      id: m.id,
      order: m.order,
      channel: m.channel,
      metric: m.metric,
      previous: m.previous ?? undefined,
      current: m.current ?? undefined,
      target: m.target ?? undefined,
      health: m.health ?? undefined,
      reading: m.reading ?? undefined,
    })),
    okrs: row.okrs.map((o) => ({
      id: o.id,
      order: o.order,
      objective: o.objective,
      keyResult: o.keyResult,
      measure: o.measure,
      goalLabel: o.goalLabel,
      goalValue: o.goalValue ?? undefined,
      achieved: o.achieved ?? undefined,
      monthlyRead: o.monthlyRead,
      health: o.health ?? undefined,
      nextStep: o.nextStep ?? undefined,
      fourWeekAverage: mediaDasSemanas(historico.get(o.keyResult) ?? []),
    })),
    blockers: row.blockers.map((b) => ({
      id: b.id,
      order: b.order,
      title: b.title,
      impact: b.impact ?? undefined,
      needs: b.needs ?? undefined,
      dueDate: b.dueDate ? isoDia(b.dueDate) : undefined,
      health: b.health ?? undefined,
      resolution: b.resolution ?? undefined,
    })),
    agenda: row.agenda.map((a) => ({
      id: a.id,
      order: a.order,
      block: a.block,
      minutes: a.minutes,
      question: a.question,
      answer: a.answer ?? undefined,
    })),
  };
}
