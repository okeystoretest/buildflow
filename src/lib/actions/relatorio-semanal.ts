"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRoleAction } from "@/lib/auth";
import { actionOk, actionError, type ActionResult } from "@/types/action";
import { AGENDA } from "@/lib/relatorio-semanal-templates";
import {
  EM_PORTUGUES,
  bloqueioSchema,
  criarSchema,
  lerDia,
  primeiroErro,
  resumoSchema,
  secaoSchema,
} from "@/lib/relatorio-semanal-schemas";

/**
 * Escritas do Relatório Semanal do Marketing.
 *
 * SEM MÓDULO DE GUARDAS. No Build.Connect existe um `guards.ts` que resolve o
 * subsetor pelo slug e confere o acesso à área — aqui não há subsetor e só
 * GESTAO entra, então a guarda é o `requireRoleAction(["GESTAO"])` que o resto
 * da casa já usa. Um módulo para não decidir nada seria uma camada a manter.
 *
 * TODA ENTRADA PASSA POR `zod`, e isso não é formalidade: estas actions são a
 * fronteira de confiança. O que chega aqui vem do navegador, onde nada do que
 * a tela validou continua valendo.
 *
 * A ORDEM DAS LINHAS NUNCA VEM DO CLIENTE — ela é a posição no array. É o que
 * impede buraco (0, 1, 3) e empate (0, 1, 1) na seção.
 */

const ROTA = "/marketing/relatorio-semanal";

/** O relatorio existe? E o preambulo de toda escrita em cima dele. */
async function abrirRelatorio(reportId: string) {
  return prisma.weeklyReport.findUnique({
    where: { id: reportId },
    select: { id: true },
  });
}

/* ------------------------------------------------------------ a semana */

/**
 * Cria a semana.
 *
 * SÓ A PAUTA NASCE PRONTA. Entregas, métricas e OKRs eram listas fixas da
 * planilha e não vieram: uma semana que abre com 50 linhas vazias é um
 * formulário, não um relatório. A pauta fica porque é o roteiro da conversa,
 * e vai numa escrita aninhada só — transação implícita do Prisma, que é o que
 * impede um relatório nascer sem ela.
 */
export async function criarRelatorio(args: {
  weekNumber: number;
  periodStart: string;
  periodEnd: string;
}): Promise<ActionResult<{ id: string }>> {
  try {
    const sessao = await requireRoleAction(["GESTAO"]);
    const parsed = criarSchema.safeParse(args, { errorMap: EM_PORTUGUES });
    if (!parsed.success) return actionError(primeiroErro(parsed.error));

    const { weekNumber, periodStart, periodEnd } = parsed.data;
    if (periodEnd < periodStart) {
      return actionError("O fim do período não pode ser antes do início.");
    }

    const jaExiste = await prisma.weeklyReport.findUnique({
      where: { periodStart: lerDia(periodStart) },
      select: { id: true },
    });
    if (jaExiste) return actionError("Já existe um relatório para esta semana.");

    const criado = await prisma.weeklyReport.create({
      data: {
        createdById: sessao.userId,
        weekNumber,
        periodStart: lerDia(periodStart),
        periodEnd: lerDia(periodEnd),
        agenda: { create: AGENDA.map((a, order) => ({ order, ...a })) },
      },
      select: { id: true },
    });

    revalidatePath(ROTA);
    return actionOk({ id: criado.id });
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao criar a semana.");
  }
}

/** O cabeçalho da semana e os três campos longos do resumo. */
export async function salvarResumo(
  args: z.input<typeof resumoSchema>,
): Promise<ActionResult<void>> {
  try {
    await requireRoleAction(["GESTAO"]);
    const parsed = resumoSchema.safeParse(args, { errorMap: EM_PORTUGUES });
    if (!parsed.success) return actionError(primeiroErro(parsed.error));

    const d = parsed.data;
    if (d.periodEnd < d.periodStart) {
      return actionError("O fim do período não pode ser antes do início.");
    }

    const report = await abrirRelatorio(d.reportId);
    if (!report) return actionError("Relatório não encontrado.");

    // O período é único: mover a semana para cima de outra tem de recusar, e
    // não estourar o erro cru do banco na cara de quem preenche.
    const ocupada = await prisma.weeklyReport.findUnique({
      where: { periodStart: lerDia(d.periodStart) },
      select: { id: true },
    });
    if (ocupada && ocupada.id !== report.id) {
      return actionError("Já existe um relatório para esta semana.");
    }

    await prisma.weeklyReport.update({
      where: { id: report.id },
      data: {
        weekNumber: d.weekNumber,
        periodStart: lerDia(d.periodStart),
        periodEnd: lerDia(d.periodEnd),
        highlight: d.highlight || null,
        learning: d.learning || null,
        nextPriority: d.nextPriority || null,
      },
    });

    revalidatePath(ROTA);
    return actionOk(undefined);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao salvar o resumo.");
  }
}

/* --------------------------------------------- as seções de linhas */

/**
 * Uma seção inteira, substituída numa transação.
 *
 * As quatro na mesma action porque o ato é o mesmo — gravar as linhas de um
 * relatório já conferido. Quatro actions seriam quatro cópias do mesmo
 * preâmbulo, e o preâmbulo é a parte que não pode divergir.
 *
 * A SEÇÃO INTEIRA, e não linha a linha, porque é assim que se preenche: abre-se
 * a seção, mexe-se em várias linhas e salva-se. Vinte linhas em vinte chamadas
 * deixariam a tela num estado que não existe no banco se a décima falhasse.
 *
 * ENTREGAS, MÉTRICAS e OKRs são APAGADOS E RECRIADOS: a semana monta as
 * próprias linhas, então criar, editar, reordenar e excluir são o mesmo gesto
 * — mandar a lista como ela ficou. Os ids mudam a cada salvamento e ninguém
 * aponta para eles: a média de 4 semanas casa os OKRs pelo TEXTO do
 * resultado-chave, justamente por isso.
 *
 * A PAUTA é a exceção: roteiro fixo, só a RESPOSTA é gravada. Deixar o bloco e
 * a pergunta editáveis apagaria a diferença entre "não respondi" e "mudei a
 * pergunta".
 */
export async function salvarSecao(
  args: z.input<typeof secaoSchema>,
): Promise<ActionResult<void>> {
  try {
    await requireRoleAction(["GESTAO"]);
    const parsed = secaoSchema.safeParse(args, { errorMap: EM_PORTUGUES });
    if (!parsed.success) return actionError(primeiroErro(parsed.error));

    const data = parsed.data;
    const report = await abrirRelatorio(data.reportId);
    if (!report) return actionError("Relatório não encontrado.");

    // A pauta é roteiro fixo: só a resposta muda, e cada linha é conferida
    // contra ESTE relatório antes de ser tocada.
    if (data.kind === "agenda") {
      const validos = await prisma.weeklyReportAgendaItem.findMany({
        where: { reportId: report.id },
        select: { id: true },
      });
      const conhecidos = new Set(validos.map((r) => r.id));
      if (data.rows.some((r) => !conhecidos.has(r.id))) {
        return actionError("Esta seção mudou. Recarregue a página e tente de novo.");
      }
      await prisma.$transaction(
        data.rows.map((r) =>
          prisma.weeklyReportAgendaItem.update({
            where: { id: r.id },
            data: { answer: r.answer || null },
          }),
        ),
      );
      revalidatePath(ROTA);
      return actionOk(undefined);
    }

    // As demais: apaga e recria dentro de UMA transação. A `order` vem da
    // posição no array, nunca do cliente.
    const ops: Prisma.PrismaPromise<unknown>[] = [];
    if (data.kind === "delivery") {
      ops.push(prisma.weeklyReportDelivery.deleteMany({ where: { reportId: report.id } }));
      ops.push(
        prisma.weeklyReportDelivery.createMany({
          data: data.rows.map((r, order) => ({
            reportId: report.id,
            order,
            day: r.day || "",
            block: r.block || "",
            expected: r.expected,
            health: r.health ?? null,
            evidence: r.evidence || null,
            note: r.note || null,
          })),
        }),
      );
    } else if (data.kind === "metric") {
      ops.push(prisma.weeklyReportMetric.deleteMany({ where: { reportId: report.id } }));
      ops.push(
        prisma.weeklyReportMetric.createMany({
          data: data.rows.map((r, order) => ({
            reportId: report.id,
            order,
            channel: r.channel,
            metric: r.metric,
            previous: r.previous ?? null,
            current: r.current ?? null,
            target: r.target || null,
            health: r.health ?? null,
            reading: r.reading || null,
          })),
        }),
      );
    } else {
      ops.push(prisma.weeklyReportOkr.deleteMany({ where: { reportId: report.id } }));
      ops.push(
        prisma.weeklyReportOkr.createMany({
          data: data.rows.map((r, order) => ({
            reportId: report.id,
            order,
            objective: r.objective || "",
            keyResult: r.keyResult,
            measure: r.measure || "",
            goalLabel: r.goalLabel || "",
            goalValue: r.goalValue ?? null,
            monthlyRead: r.monthlyRead ?? false,
            achieved: r.achieved ?? null,
            health: r.health ?? null,
            nextStep: r.nextStep || null,
          })),
        }),
      );
    }

    await prisma.$transaction(ops);
    revalidatePath(ROTA);
    return actionOk(undefined);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao salvar a seção.");
  }
}

/* ------------------------------- bloqueios: a seção sem modelo fixo */

/**
 * Cada bloqueio nasce, salva e morre por conta própria — é a exceção à regra
 * da seção inteira. A linha só se registra quando já dá para salvá-la: sem
 * título, o servidor recusa.
 */
export async function salvarBloqueio(
  args: z.input<typeof bloqueioSchema>,
): Promise<ActionResult<{ id: string }>> {
  try {
    await requireRoleAction(["GESTAO"]);
    const parsed = bloqueioSchema.safeParse(args, { errorMap: EM_PORTUGUES });
    if (!parsed.success) return actionError(primeiroErro(parsed.error));

    const d = parsed.data;
    const report = await abrirRelatorio(d.reportId);
    if (!report) return actionError("Relatório não encontrado.");

    const campos = {
      title: d.title,
      impact: d.impact || null,
      needs: d.needs || null,
      dueDate: d.dueDate ? lerDia(d.dueDate) : null,
      health: d.health ?? null,
      resolution: d.resolution || null,
    };

    if (d.blockerId) {
      // `updateMany` com o `reportId` no WHERE: é o que impede editar o
      // bloqueio de outra semana com um id colado.
      const { count } = await prisma.weeklyReportBlocker.updateMany({
        where: { id: d.blockerId, reportId: report.id },
        data: campos,
      });
      if (count === 0) return actionError("Bloqueio não encontrado.");
      revalidatePath(ROTA);
      return actionOk({ id: d.blockerId });
    }

    const ultimo = await prisma.weeklyReportBlocker.findFirst({
      where: { reportId: report.id },
      orderBy: { order: "desc" },
      select: { order: true },
    });
    const criado = await prisma.weeklyReportBlocker.create({
      data: { reportId: report.id, order: (ultimo?.order ?? -1) + 1, ...campos },
      select: { id: true },
    });

    revalidatePath(ROTA);
    return actionOk({ id: criado.id });
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao salvar o bloqueio.");
  }
}

export async function excluirBloqueio(args: {
  reportId: string;
  blockerId: string;
}): Promise<ActionResult<void>> {
  try {
    await requireRoleAction(["GESTAO"]);
    const parsed = z
      .object({ reportId: z.string().min(1), blockerId: z.string().min(1) })
      .safeParse(args, { errorMap: EM_PORTUGUES });
    if (!parsed.success) return actionError("Dados inválidos.");

    const report = await abrirRelatorio(parsed.data.reportId);
    if (!report) return actionError("Relatório não encontrado.");

    const { count } = await prisma.weeklyReportBlocker.deleteMany({
      where: { id: parsed.data.blockerId, reportId: report.id },
    });
    if (count === 0) return actionError("Bloqueio não encontrado.");

    revalidatePath(ROTA);
    return actionOk(undefined);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao excluir o bloqueio.");
  }
}

/* ------------------------------------------------------ excluir a semana */

/** As linhas vão junto por `onDelete: Cascade` no schema. */
export async function excluirRelatorio(args: {
  reportId: string;
}): Promise<ActionResult<void>> {
  try {
    await requireRoleAction(["GESTAO"]);
    const parsed = z
      .object({ reportId: z.string().min(1) })
      .safeParse(args, { errorMap: EM_PORTUGUES });
    if (!parsed.success) return actionError("Dados inválidos.");

    const { count } = await prisma.weeklyReport.deleteMany({
      where: { id: parsed.data.reportId },
    });
    if (count === 0) return actionError("Relatório não encontrado.");

    revalidatePath(ROTA);
    return actionOk(undefined);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao excluir a semana.");
  }
}
