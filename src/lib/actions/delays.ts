"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRoleAction } from "@/lib/auth";
import { loadStageLimits, loadStatusSince } from "@/lib/stage-limits";
import {
  DELAY_REASON_THRESHOLD_MIN,
  STATUS_SETOR,
  overdueMinutes,
} from "@/lib/order-flow";
import { actionOk, actionError, type ActionResult } from "@/types/action";

// Tamanho maximo do texto do motivo. Curto de proposito: e uma justificativa
// operacional lida de relance no card, nao um relatorio.
const MAX_REASON = 500;

/**
 * Registra o MOTIVO DO ATRASO de um pedido na etapa em que ele esta agora.
 *
 * O quadro chama esta action quando um card passa de
 * DELAY_REASON_THRESHOLD_MIN minutos alem do prazo da etapa. Tudo que importa e
 * recalculado aqui no servidor — o status atual, o tempo de atraso e o direito
 * de justificar — porque o cliente so envia o id do pedido e o texto: o payload
 * do navegador nao decide em qual etapa a justificativa cai nem quanto tempo
 * ela diz que o pedido esperou.
 */
export async function registerDelayReason(args: {
  orderId: string;
  reason: string;
}): Promise<ActionResult<void>> {
  try {
    const session = await requireRoleAction();

    const reason = args.reason.trim();
    if (!reason) return actionError("Informe o motivo do atraso.");
    if (reason.length > MAX_REASON) {
      return actionError(`O motivo deve ter no máximo ${MAX_REASON} caracteres.`);
    }

    const order = await prisma.order.findUnique({
      where: { id: args.orderId },
      select: { id: true, status: true },
    });
    if (!order) return actionError("Pedido não encontrado.");

    // Quem justifica: o setor DONO da etapa atual. Gestao acompanha todas.
    const setor = STATUS_SETOR[order.status];
    if (session.role !== "GESTAO" && session.role !== setor) {
      return actionError("Somente o setor responsável pela etapa pode justificar o atraso.");
    }

    // Atraso recalculado no servidor a partir do historico + prazos vigentes.
    const [limits, since] = await Promise.all([
      loadStageLimits(),
      loadStatusSince([{ id: order.id, status: order.status }]),
    ]);
    const late = overdueMinutes(order.status, since.get(order.id) ?? null, limits);
    if (late < DELAY_REASON_THRESHOLD_MIN) {
      return actionError("Este pedido não está atrasado nesta etapa.");
    }

    // Um motivo por etapa: rejustificar a MESMA etapa reescreve o texto (e o
    // atraso registrado), em vez de empilhar registros do mesmo atraso.
    await prisma.orderDelayReason.upsert({
      where: { orderId_status: { orderId: order.id, status: order.status } },
      create: {
        orderId: order.id,
        status: order.status,
        reason,
        minutesLate: late,
        createdById: session.userId,
      },
      update: {
        reason,
        minutesLate: late,
        createdById: session.userId,
        createdAt: new Date(),
      },
    });

    revalidatePath("/fluxo");
    revalidatePath("/logistica");
    return actionOk(undefined);
  } catch (err) {
    return actionError(
      err instanceof Error ? err.message : "Erro ao registrar o motivo do atraso.",
    );
  }
}
