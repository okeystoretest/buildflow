"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRoleAction } from "@/lib/auth";
import { actionOk, actionError, type ActionResult } from "@/types/action";
import {
  isPecasBlogueira,
  canMovePiece,
  foiEntregue,
  podeMoverDe,
  exigeGestaoParaMover,
  ENCERRA_PEDIDO_AO_FINALIZAR,
  STATUS_TERMINAIS,
  PIECE_LABEL,
} from "@/lib/piece-control";
import type { PieceStatus } from "@prisma/client";

/**
 * Move uma peça entre as colunas do Controle de Peças
 * (Em Uso · Reprocessamento · Devolvido · Finalizado).
 *
 * Travas aplicadas no SERVIDOR (nunca confiar só na tela):
 *  1. O pedido precisa ser do tipo "10 - Peças p/ Blogueira".
 *  2. A transição precisa ser válida para o estado atual (vizinho imediato).
 *  3. Entrar em "Em Uso" exige que a ENTREGA já tenha sido registrada.
 *  4. Sair de "Finalizado" exige perfil GESTÃO — para o usuário padrão o card
 *     está congelado.
 *
 * Estado atual (Order.pieceStatus), histórico (PieceMovement) e — quando a peça
 * é finalizada — o encerramento do PEDIDO são gravados na MESMA transação: ou
 * tudo acontece, ou nada.
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

    // Trava de perfil: card em "Finalizado" só se move pela Gestão.
    if (!podeMoverDe(order.pieceStatus, session.role)) {
      return actionError(
        exigeGestaoParaMover(order.pieceStatus)
          ? 'Pedido finalizado: apenas o perfil Gestão pode movimentá-lo.'
          : "Sem permissão para movimentar esta peça.",
      );
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

    // O pedido é encerrado junto com a finalização da peça — mas nunca
    // "desencerrado": um pedido cancelado/estornado não volta para CONCLUIDO.
    const encerraPedido =
      ENCERRA_PEDIDO_AO_FINALIZAR &&
      args.to === "FINALIZADO" &&
      !STATUS_TERMINAIS.includes(order.status);

    await prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: order.id },
        data: {
          pieceStatus: args.to,
          ...(encerraPedido ? { status: "CONCLUIDO" as const } : {}),
        },
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
      if (encerraPedido) {
        await tx.orderStatusHistory.create({
          data: {
            orderId: order.id,
            status: "CONCLUIDO",
            changedBy: session.userId,
            note: "Controle de Peças: peça finalizada — fluxo do pedido encerrado.",
          },
        });
      }
    });

    revalidatePath("/logistica/controle-pecas");
    if (encerraPedido) {
      revalidatePath("/logistica");
      revalidatePath("/fluxo");
      revalidatePath("/dashboard");
    }
    return actionOk({ pieceStatus: args.to });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro ao mover a peça.";
    return actionError(msg);
  }
}
