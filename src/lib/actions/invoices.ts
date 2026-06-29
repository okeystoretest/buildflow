"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { actionOk, actionError, type ActionResult } from "@/types/action";

/**
 * Financeiro fatura um pedido.
 *
 * TRANSACAO OBRIGATORIA: faturar e dar baixa no estoque dependem uma da outra.
 * Se faltar estoque de qualquer item, NADA acontece (rollback).
 * Tambem cria a Delivery (entrega) aguardando motorista.
 */
export async function invoiceOrder(
  orderId: string,
): Promise<ActionResult<{ invoiceId: string; number: string }>> {
  try {
    await requireRole(["FINANCEIRO", "ADMIN"]);

    const result = await prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: { items: { include: { product: true } }, invoice: true },
      });

      if (!order) throw new Error("Pedido nao encontrado.");
      if (order.invoice) throw new Error("Pedido ja faturado.");
      if (order.status !== "AGUARDANDO_FATURAMENTO") {
        throw new Error("Pedido nao esta aguardando faturamento.");
      }

      // 1) Valida estoque de TODOS os itens antes de mexer em nada.
      for (const item of order.items) {
        if (item.product.stock < item.quantity) {
          throw new Error(
            `Estoque insuficiente para ${item.product.name} ` +
              `(disponivel: ${item.product.stock}, pedido: ${item.quantity}).`,
          );
        }
      }

      // 2) Baixa estoque item a item.
      for (const item of order.items) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { decrement: item.quantity } },
        });
      }

      // 3) Cria a fatura.
      const invCount = await tx.invoice.count();
      const number = `NF-${new Date().getFullYear()}-${String(invCount + 1).padStart(6, "0")}`;
      const invoice = await tx.invoice.create({
        data: {
          number,
          orderId: order.id,
          amount: order.total,
          status: "ABERTA",
        },
        select: { id: true, number: true },
      });

      // 4) Atualiza status do pedido e abre a entrega.
      await tx.order.update({
        where: { id: order.id },
        data: { status: "FATURADO" },
      });

      await tx.delivery.create({
        data: { orderId: order.id, status: "AGUARDANDO" },
      });

      return invoice;
    });

    revalidatePath("/financeiro");
    revalidatePath("/distribuicao");
    return actionOk({ invoiceId: result.id, number: result.number });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro ao faturar pedido.";
    return actionError(msg);
  }
}

/** Marca fatura como paga. */
export async function markInvoicePaid(
  invoiceId: string,
): Promise<ActionResult<void>> {
  try {
    await requireRole(["FINANCEIRO", "ADMIN"]);
    await prisma.invoice.update({
      where: { id: invoiceId },
      data: { status: "PAGA", paidAt: new Date() },
    });
    revalidatePath("/financeiro");
    return actionOk(undefined);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro ao baixar fatura.";
    return actionError(msg);
  }
}
