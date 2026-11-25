"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRoleAction } from "@/lib/auth";
import { actionOk, actionError, type ActionResult } from "@/types/action";
import { AGENDA } from "@/lib/relatorio-semanal-templates";
import { semanaFechada } from "@/lib/relatorio-semanal-math";
import {
  getRelatorioSemanalDetail,
  hojeIso,
  isoDia,
  type WeeklyReportDetail,
} from "@/lib/relatorio-semanal-data";
import { MAX_UPLOAD_MB, processAndSaveImage, validateUpload } from "@/lib/image";
import {
  EM_PORTUGUES,
  bloqueioSchema,
  criarSchema,
  lerDia,
  primeiroErro,
  resumoSchema,
  secaoSchema,
  tarefaSchema,
  moverSchema,
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
  const report = await prisma.weeklyReport.findUnique({
    where: { id: reportId },
    select: { id: true, periodStart: true, periodEnd: true },
  });
  if (!report) return null;

  // A TRANCA MORA AQUI, e não em cada action, porque este é o funil por onde
  // TODA escrita da semana passa (resumo, seções, bloqueios). O quadro Kanban
  // NÃO passa por aqui, de propósito: ele é o estado vivo, movido à mão na
  // reunião, e não o registro daquela semana.
  //
  // `throw` e não valor de retorno: o `catch` que cada action já tem vira a
  // mensagem, igual ao que `requireRoleAction` faz. Devolver `null` diria
  // "Relatório não encontrado", que seria mentira.
  const maisNova = await prisma.weeklyReport.findFirst({
    where: { periodStart: { gt: report.periodStart } },
    select: { id: true },
  });
  if (semanaFechada(isoDia(report.periodEnd), !!maisNova, hojeIso())) {
    throw new Error(
      "Esta semana já fechou: o período dela acabou e a semana seguinte já existe. Cada semana é um planejamento novo.",
    );
  }

  return { id: report.id };
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
  // O DETALHE VOLTA JUNTO: o modal abre os blocos na sequência, e a pauta
  // nasce pronta no servidor — sem isto a tela teria de adivinhar os ids dela
  // ou dar uma segunda volta ao banco para lê-los.
}): Promise<ActionResult<{ id: string; detail: WeeklyReportDetail | null }>> {
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
    return actionOk({ id: criado.id, detail: await getRelatorioSemanalDetail(criado.id) });
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

/* --------------------------------------------- o quadro (abas 7 e 8) */

/**
 * Próximo código do quadro ("K-13").
 *
 * Lido do MAIOR código existente, e não da contagem de cartões: contar daria
 * "K-12" de novo assim que alguém excluísse um cartão do meio, e o código é a
 * forma de citar a tarefa na reunião de sexta — reaproveitá-lo confundiria a
 * ata da semana anterior.
 */
async function proximoCodigo(): Promise<string> {
  const codigos = await prisma.marketingTask.findMany({ select: { code: true } });
  let maior = 0;
  for (const { code } of codigos) {
    const n = Number(code.replace(/^K-/, ""));
    if (Number.isInteger(n) && n > maior) maior = n;
  }
  return `K-${String(maior + 1).padStart(2, "0")}`;
}

export async function salvarTarefa(
  args: z.input<typeof tarefaSchema>,
): Promise<ActionResult<{ id: string }>> {
  try {
    await requireRoleAction(["GESTAO"]);
    const parsed = tarefaSchema.safeParse(args, { errorMap: EM_PORTUGUES });
    if (!parsed.success) return actionError(primeiroErro(parsed.error));

    const d = parsed.data;

    // O id do responsável vem do NAVEGADOR: sem esta conferência, um cartão
    // cairia no nome de alguém desligado, ou num id inventado.
    if (d.assigneeId) {
      const existe = await prisma.user.findFirst({
        where: { id: d.assigneeId, active: true },
        select: { id: true },
      });
      if (!existe) return actionError("Escolha alguém ativo na plataforma.");
    }

    const campos = {
      title: d.title,
      category: d.category,
      priority: d.priority,
      assigneeId: d.assigneeId || null,
      dueDate: d.dueDate ? lerDia(d.dueDate) : null,
      evidence: d.evidence || null,
      note: d.note || null,
    };

    if (d.taskId) {
      const { count } = await prisma.marketingTask.updateMany({
        where: { id: d.taskId },
        data: campos,
      });
      if (count === 0) return actionError("Tarefa não encontrada.");
      revalidatePath(ROTA);
      return actionOk({ id: d.taskId });
    }

    const criado = await prisma.marketingTask.create({
      data: { code: await proximoCodigo(), ...campos },
      select: { id: true },
    });
    revalidatePath(ROTA);
    return actionOk({ id: criado.id });
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao salvar a tarefa.");
  }
}

export async function moverTarefa(
  args: z.input<typeof moverSchema>,
): Promise<ActionResult<void>> {
  try {
    await requireRoleAction(["GESTAO"]);
    const parsed = moverSchema.safeParse(args, { errorMap: EM_PORTUGUES });
    if (!parsed.success) return actionError("Dados inválidos.");
    const { taskId, status } = parsed.data;

    const task = await prisma.marketingTask.findUnique({
      where: { id: taskId },
      select: { id: true, evidence: true, status: true },
    });
    if (!task) return actionError("Tarefa não encontrada.");
    if (task.status === status) return actionOk(undefined);

    // A regra que era uma frase na aba de instruções, que ninguém abria, e
    // aqui é recusa: nada chega a Publicado sem prova.
    if (status === "PUBLICADO" && !task.evidence) {
      return actionError(
        "Toda tarefa precisa de evidência (link ou print) antes de ir para Publicado.",
      );
    }

    await prisma.marketingTask.update({
      where: { id: task.id },
      // Voltar de Publicado LIMPA a data de conclusão: o cartão não está
      // concluído, e a data sobrevivente contaria como entrega no histórico.
      data: { status, doneAt: status === "PUBLICADO" ? new Date() : null },
    });

    revalidatePath(ROTA);
    return actionOk(undefined);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao mover a tarefa.");
  }
}

export async function excluirTarefa(args: { taskId: string }): Promise<ActionResult<void>> {
  try {
    await requireRoleAction(["GESTAO"]);
    const parsed = z
      .object({ taskId: z.string().min(1) })
      .safeParse(args, { errorMap: EM_PORTUGUES });
    if (!parsed.success) return actionError("Dados inválidos.");

    const { count } = await prisma.marketingTask.deleteMany({
      where: { id: parsed.data.taskId },
    });
    if (count === 0) return actionError("Tarefa não encontrada.");

    revalidatePath(ROTA);
    return actionOk(undefined);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao excluir a tarefa.");
  }
}

/**
 * Envia um print como evidência e devolve o CAMINHO público.
 *
 * Server Action, e não a rota `/api/uploads`: aquela existe para dar progresso
 * em arquivo grande, e um print não precisa de barra de progresso.
 *
 * A imagem é reprocessada por `processAndSaveImage` — corrige a orientação do
 * EXIF, redimensiona e converte para .webp. O banco guarda só o caminho, como
 * todo arquivo do sistema; nunca o binário.
 *
 * GRAVA, MAS NÃO ASSOCIA: quem escreve o caminho é `salvarSecao` ou
 * `salvarTarefa`, com o resto do formulário. Separá-los é o que permite trocar
 * a imagem antes de salvar sem deixar a linha apontando para um arquivo
 * descartado.
 */
export async function enviarEvidencia(formData: FormData): Promise<ActionResult<{ path: string }>> {
  try {
    await requireRoleAction(["GESTAO"]);
    const file = formData.get("file");
    if (!(file instanceof File)) return actionError("Nenhuma imagem recebida.");

    const invalido = validateUpload(file, MAX_UPLOAD_MB);
    if (invalido) return actionError(invalido);

    const buffer = Buffer.from(await file.arrayBuffer());
    const processada = await processAndSaveImage(buffer, {
      folder: "relatorio-semanal",
      fileName: `evid_${Date.now()}`,
    });
    return actionOk({ path: processada.filePath });
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao enviar a imagem.");
  }
}
