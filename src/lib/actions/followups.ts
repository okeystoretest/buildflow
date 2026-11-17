"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRoleAction } from "@/lib/auth";
import { actionOk, actionError, type ActionResult } from "@/types/action";
import { followUpSchema, updateFollowUpSchema } from "@/lib/validations/followup";
import { instanteNoFuso } from "@/lib/rank-window";

const PATH = "/vendas/acompanhamento";

/**
 * Data de um `<input type="date">` como instante do NEGOCIO.
 *
 * `new Date("2026-11-13")` e meia-noite UTC — 21:00 do dia 12 em Brasilia. Num
 * servidor em UTC a tela mostraria o dia ANTERIOR ao escolhido, e o "Prazo de
 * Reavaliacao" venceria um dia antes do combinado.
 */
function dataDoNegocio(iso: string): Date {
  const [ano, mes, dia] = iso.split("-").map(Number);
  return instanteNoFuso(ano, mes, dia);
}

/**
 * Campos gravados por tipo de formulario.
 *
 * Os exclusivos do OUTRO tipo vao a NULL de proposito: trocar o tipo de um
 * registro ja gravado nao pode deixar para tras um "Tema Central" invisivel na
 * tela de One-on-One, que voltaria a aparecer se o tipo fosse trocado de volta.
 */
function dadosDoTipo(d: ReturnType<typeof followUpSchema.parse>) {
  const comuns = {
    kind: d.kind,
    collaboratorId: d.collaboratorId,
    heldOn: dataDoNegocio(d.heldOn),
    strengths: d.strengths,
    improvement: d.improvement,
    collaboratorView: d.collaboratorView,
    actionPlan: d.actionPlan,
    notes: d.notes ?? null,
    // "Nao Iniciado" e o padrao ate alteracao manual (planilha).
    //
    // NOS DOIS TIPOS desde 17/11/2026: e o campo que o filtro "Situacao" e o
    // historico da lista leem, e enquanto ele era nulo no Quinzenal o filtro
    // "Concluidos" daquela aba nao tinha como achar nada.
    status: d.status ?? "NAO_INICIADO",
  };
  if (d.kind === "ONE_ON_ONE") {
    return {
      ...comuns,
      performance: d.performance ?? null,
      topic: null,
      support: null,
      reviewOn: null,
    };
  }
  return {
    ...comuns,
    performance: null,
    topic: d.topic ?? null,
    support: d.support ?? null,
    reviewOn: d.reviewOn ? dataDoNegocio(d.reviewOn) : null,
  };
}

export async function createFollowUp(raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    // Só GESTAO: o registro traz pontos de desenvolvimento e falas do
    // colaborador. Decisão do dono em 13/11/2026.
    const session = await requireRoleAction(["GESTAO"]);
    const parsed = followUpSchema.safeParse(raw);
    if (!parsed.success) {
      return actionError("Dados inválidos.", parsed.error.flatten().fieldErrors);
    }
    const d = parsed.data;

    const colaborador = await prisma.user.findUnique({ where: { id: d.collaboratorId } });
    if (!colaborador) return actionError("Colaborador não encontrado.");

    const registro = await prisma.followUp.create({
      data: {
        ...dadosDoTipo(d),
        // "Gestor Responsavel pelo Suporte": quem preencheu, nunca digitado.
        managerId: session.userId,
      },
      select: { id: true },
    });

    revalidatePath(PATH);
    return actionOk({ id: registro.id });
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao salvar o acompanhamento.");
  }
}

export async function updateFollowUp(raw: unknown): Promise<ActionResult<void>> {
  try {
    await requireRoleAction(["GESTAO"]);
    const parsed = updateFollowUpSchema.safeParse(raw);
    if (!parsed.success) {
      return actionError("Dados inválidos.", parsed.error.flatten().fieldErrors);
    }
    const { id, ...d } = parsed.data;

    const existe = await prisma.followUp.findUnique({ where: { id }, select: { id: true } });
    if (!existe) return actionError("Acompanhamento não encontrado.");

    // O GESTOR NAO E REESCRITO na edicao: ele registra quem CONDUZIU a
    // conversa, não quem corrigiu uma vírgula depois.
    await prisma.followUp.update({ where: { id }, data: dadosDoTipo(d) });

    revalidatePath(PATH);
    return actionOk(undefined);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao editar o acompanhamento.");
  }
}

export async function deleteFollowUp(id: string): Promise<ActionResult<void>> {
  try {
    await requireRoleAction(["GESTAO"]);
    await prisma.followUp.delete({ where: { id } });
    revalidatePath(PATH);
    return actionOk(undefined);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao excluir o acompanhamento.");
  }
}
