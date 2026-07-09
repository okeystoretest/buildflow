"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRoleAction } from "@/lib/auth";
import { actionOk, actionError, type ActionResult } from "@/types/action";
import { createTaskSchema, updateTaskSchema, moveTaskSchema } from "@/lib/validations/task";

const TASKS_PATH = "/vendas/tarefas";

/**
 * Verifica se o usuario da sessao pode mexer na tarefa alvo.
 * - GESTAO: pode tudo.
 * - VENDAS: apenas as PROPRIAS tarefas.
 * Retorna a tarefa (se existir e permitida) ou null.
 */
async function getOwnedTask(taskId: string, userId: string, role: string) {
  const task = await prisma.dailyTask.findUnique({ where: { id: taskId } });
  if (!task) return null;
  if (role !== "GESTAO" && task.userId !== userId) return null;
  return task;
}

/** Cria uma tarefa diaria para a vendedora logada (ou Gestao para si). */
export async function createTask(raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await requireRoleAction(["VENDAS", "GESTAO"]);
    const parsed = createTaskSchema.safeParse(raw);
    if (!parsed.success) {
      return actionError("Dados inválidos.", parsed.error.flatten().fieldErrors);
    }
    const d = parsed.data;

    // Nova tarefa entra no topo da coluna "A Fazer" (menor position).
    const min = await prisma.dailyTask.aggregate({
      where: { userId: session.userId, status: "A_FAZER" },
      _min: { position: true },
    });
    const position = (min._min.position ?? 0) - 1;

    const task = await prisma.dailyTask.create({
      data: {
        userId: session.userId,
        title: d.title,
        startTime: d.startTime,
        endTime: d.endTime,
        category: d.category,
        notes: d.notes,
        status: "A_FAZER",
        position,
      },
      select: { id: true },
    });
    revalidatePath(TASKS_PATH);
    return actionOk(task);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao criar tarefa.");
  }
}

/** Edita os campos de uma tarefa existente (dona ou Gestao). */
export async function updateTask(raw: unknown): Promise<ActionResult<void>> {
  try {
    const session = await requireRoleAction(["VENDAS", "GESTAO"]);
    const parsed = updateTaskSchema.safeParse(raw);
    if (!parsed.success) {
      return actionError("Dados inválidos.", parsed.error.flatten().fieldErrors);
    }
    const d = parsed.data;
    const owned = await getOwnedTask(d.id, session.userId, session.role);
    if (!owned) return actionError("Tarefa não encontrada ou sem permissão.");

    await prisma.dailyTask.update({
      where: { id: d.id },
      data: {
        title: d.title,
        startTime: d.startTime,
        endTime: d.endTime,
        category: d.category,
        notes: d.notes,
      },
    });
    revalidatePath(TASKS_PATH);
    return actionOk(undefined);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao editar tarefa.");
  }
}

/** Move a tarefa para outra coluna (A_FAZER / FAZENDO / CONCLUIDA). */
export async function moveTask(raw: unknown): Promise<ActionResult<void>> {
  try {
    const session = await requireRoleAction(["VENDAS", "GESTAO"]);
    const parsed = moveTaskSchema.safeParse(raw);
    if (!parsed.success) return actionError("Dados inválidos.");
    const { id, status } = parsed.data;

    const owned = await getOwnedTask(id, session.userId, session.role);
    if (!owned) return actionError("Tarefa não encontrada ou sem permissão.");

    // Entra no topo da coluna destino (menor position).
    const min = await prisma.dailyTask.aggregate({
      where: { userId: owned.userId, status },
      _min: { position: true },
    });
    const position = (min._min.position ?? 0) - 1;

    await prisma.dailyTask.update({ where: { id }, data: { status, position } });
    revalidatePath(TASKS_PATH);
    return actionOk(undefined);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao mover tarefa.");
  }
}

/** Exclui uma tarefa (dona ou Gestao). */
export async function deleteTask(id: string): Promise<ActionResult<void>> {
  try {
    const session = await requireRoleAction(["VENDAS", "GESTAO"]);
    const owned = await getOwnedTask(id, session.userId, session.role);
    if (!owned) return actionError("Tarefa não encontrada ou sem permissão.");

    await prisma.dailyTask.delete({ where: { id } });
    revalidatePath(TASKS_PATH);
    return actionOk(undefined);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao excluir tarefa.");
  }
}
