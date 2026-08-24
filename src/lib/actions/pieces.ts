"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRoleAction } from "@/lib/auth";
import { actionOk, actionError, type ActionResult } from "@/types/action";
import {
  isPecasBlogueira,
  canMovePiece,
  foiEntregue,
  PIECE_LABEL,
} from "@/lib/piece-control";
import type { PieceStatus } from "@prisma/client";

/**
 * Move uma peça entre as colunas do Controle de Peças
 * (Em Uso · Devolvido · Em Manutenção).
 *
 * Travas aplicadas no SERVIDOR (nunca confiar só na tela):
 *  1. O pedido precisa ser do tipo "10 - Peças p/ Blogueira".
 *  2. A transição precisa ser válida para o estado atual.
 *  3. Entrar em "Em Uso" exige que a ENTREGA já tenha sido registrada.
 *
 * Estado atual (Order.pieceStatus) e histórico (PieceMovement) são gravados na
 * mesma transação: ou os dois acontecem, ou nenhum.
 */
export async function setPieceStatus(args: {
  orderId: string;
  to: PieceStatus;
  note?: string;
}): Promise<ActionResult<{ pieceStatus: PieceStatus }>> {
  try {
    const session = await requireRoleAction(["LOGISTICA", "GESTAO"]);

    const order = await prisma.order.findUnique({
      where: { id: args.orderId },
      select: {
        id: true,
        status: true,
        pieceStatus: true,
        orderType: { select: { name: true } },
        delivery: { select: { status: true, deliveredAt: true } },
        history: { select: { status: true } },
      },
    });
    if (!order) return actionError("Pedido não encontrado.");

    if (!isPecasBlogueira(order.orderType?.name)) {
      return actionError('Este pedido não é do tipo "10 - Peças p/ Blogueira".');
    }

    if (order.pieceStatus === args.to) {
      return actionOk({ pieceStatus: args.to });
    }

    if (!canMovePiece(order.pieceStatus, args.to)) {
      return actionError(
        `Transição inválida: não é possível ir para "${PIECE_LABEL[args.to]}" a partir do estado atual.`,
      );
    }

    // Regra central do módulo: "Em Uso" só depois do registro de entrega.
    if (args.to === "EM_USO") {
      const entregue = foiEntregue({
        status: order.status,
        deliveryStatus: order.delivery?.status ?? null,
        deliveredAt: order.delivery?.deliveredAt ?? null,
        historyStatuses: order.history.map((h) => h.status),
      });
      if (!entregue) {
        return actionError(
          'A peça só entra em "Em Uso" após o registro do status Entregue no pedido.',
        );
      }
    }

    const note = args.note?.trim() || null;

    await prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: order.id },
        data: { pieceStatus: args.to },
      });
      await tx.pieceMovement.create({
        data: {
          orderId: order.id,
          fromStatus: order.pieceStatus,
          toStatus: args.to,
          note,
          changedBy: session.userId,
        },
      });
    });

    revalidatePath("/logistica/controle-pecas");
    return actionOk({ pieceStatus: args.to });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro ao mover a peça.";
    return actionError(msg);
  }
}
