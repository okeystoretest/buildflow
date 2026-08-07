"use server";

import { prisma } from "@/lib/prisma";
import { requireRoleAction } from "@/lib/auth";
import { actionOk, actionError, type ActionResult } from "@/types/action";

/**
 * Central de Notificações — mutações. Todas escopadas ao usuário logado:
 * ninguém marca/limpa notificação de outro usuário.
 */

/** Marca como lidas todas as notificações não lidas do usuário. */
export async function markAllNotificationsRead(): Promise<ActionResult<void>> {
  try {
    const session = await requireRoleAction();
    await prisma.notification.updateMany({
      where: { userId: session.userId, read: false },
      data: { read: true },
    });
    return actionOk(undefined);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao marcar notificações.");
  }
}

/** Marca UMA notificação como lida (idempotente; ignora se não for do usuário). */
export async function markNotificationRead(id: string): Promise<ActionResult<void>> {
  try {
    const session = await requireRoleAction();
    if (!id) return actionError("Notificação não informada.");
    await prisma.notification.updateMany({
      where: { id, userId: session.userId },
      data: { read: true },
    });
    return actionOk(undefined);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao marcar notificação.");
  }
}

/** Remove todas as notificações do usuário (limpar a central). */
export async function clearNotifications(): Promise<ActionResult<void>> {
  try {
    const session = await requireRoleAction();
    await prisma.notification.deleteMany({ where: { userId: session.userId } });
    return actionOk(undefined);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao limpar notificações.");
  }
}
