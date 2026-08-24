import type { Prisma } from "@prisma/client";
import { isPecasBlogueira } from "@/lib/piece-control";

/**
 * Regra de transição do Controle de Peças:
 *   a peça entra em "Em Uso" OBRIGATORIAMENTE só depois do registro de entrega.
 *
 * Este helper é chamado DENTRO das transações que registram a entrega
 * (advanceOrderStatus -> ENTREGUE, setOrderStatus -> ENTREGUE/CONCLUIDO e
 * completeDelivery do motorista). Ele é idempotente e silencioso:
 *   - ignora pedidos que não são do tipo "10 - Peças p/ Blogueira";
 *   - ignora pedidos que já possuem pieceStatus (não sobrescreve uma devolução
 *     ou manutenção já registrada por um novo evento de entrega).
 *
 * Não é exportado como Server Action de propósito: roda sempre acoplado à
 * transação que o chamou, para que peça e pedido nunca fiquem dessincronizados.
 */
export async function ativarPecaAoEntregar(
  tx: Prisma.TransactionClient,
  orderId: string,
  changedBy?: string | null,
): Promise<void> {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      pieceStatus: true,
      orderType: { select: { name: true } },
    },
  });
  if (!order) return;
  if (!isPecasBlogueira(order.orderType?.name)) return;
  // Já está no quadro: não regride nem duplica movimento.
  if (order.pieceStatus) return;

  await tx.order.update({
    where: { id: order.id },
    data: { pieceStatus: "EM_USO" },
  });
  await tx.pieceMovement.create({
    data: {
      orderId: order.id,
      fromStatus: null,
      toStatus: "EM_USO",
      changedBy: changedBy ?? null,
      note: "Entrega registrada — peça liberada para uso.",
    },
  });
}
