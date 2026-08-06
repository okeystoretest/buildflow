"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRoleAction } from "@/lib/auth";
import { actionOk, actionError, type ActionResult } from "@/types/action";
import { Prisma } from "@prisma/client";

/**
 * Registra o pagamento da ENTREGA ao motorista (Financeiro > "Pagamentos de
 * Motoristas"). NÃO movimenta dinheiro: apenas grava o registro (valor + chave
 * PIX usada + quem confirmou), para auditoria e histórico.
 *
 * Regras:
 *  - Somente FINANCEIRO/GESTAO.
 *  - O pedido precisa estar ENTREGUE e ter motorista (Delivery.driverId).
 *  - Um pagamento por pedido (idempotência via unique em orderId).
 */
export async function payDriverDelivery(args: {
  orderId: string;
  amount: number;
}): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await requireRoleAction(["FINANCEIRO", "GESTAO"]);

    if (!args.orderId) return actionError("Pedido não informado.");
    if (!(args.amount > 0)) return actionError("Informe um valor de entrega maior que zero.");

    const order = await prisma.order.findUnique({
      where: { id: args.orderId },
      select: {
        id: true,
        status: true,
        delivery: { select: { driverId: true, driver: { select: { pixKey: true } } } },
        driverPayment: { select: { id: true } },
      },
    });
    if (!order) return actionError("Pedido não encontrado.");
    if (order.status !== "ENTREGUE") {
      return actionError('Só é possível pagar entregas de pedidos com status "Entregue".');
    }
    const driverId = order.delivery?.driverId;
    if (!driverId) return actionError("Este pedido não possui motorista atribuído.");
    if (order.driverPayment) return actionError("Esta entrega já foi paga.");

    // Snapshot da chave PIX do motorista no momento do pagamento.
    const pixKey = order.delivery?.driver?.pixKey ?? null;

    const created = await prisma.driverPayment.create({
      data: {
        orderId: order.id,
        driverId,
        amount: new Prisma.Decimal(args.amount),
        pixKey,
        confirmedById: session.userId,
      },
      select: { id: true },
    });

    revalidatePath("/financeiro/entregas");
    return actionOk(created);
  } catch (err) {
    // Corrida: se dois cliques criarem em paralelo, a unique em orderId barra o 2º.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return actionError("Esta entrega já foi paga.");
    }
    return actionError(err instanceof Error ? err.message : "Erro ao registrar o pagamento.");
  }
}
