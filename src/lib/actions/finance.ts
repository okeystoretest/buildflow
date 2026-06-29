"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRoleAction } from "@/lib/auth";
import { actionOk, actionError, type ActionResult } from "@/types/action";
import type { PaymentDisposition } from "@prisma/client";

/**
 * Financeiro audita o pedido: define numero da comanda + status de pagamento.
 *
 * Regra do doc:
 *  - status com disposicao APROVA (Pago, Liberado, Transferencia, Troca)
 *    -> baixa estoque, cria entrega e manda p/ Logistica (AGUARDANDO_IMPRESSAO).
 *  - status com disposicao INTERROMPE (Estorno, Estorno Parcial, Cancelado)
 *    -> interrompe o fluxo (status do pedido vira o de excecao).
 *
 * Tudo em transacao: faturar + baixar estoque dependem um do outro.
 */
export async function auditOrder(args: {
  orderId: string;
  comandaNumber: string;
  paymentStatusId: string;
}): Promise<ActionResult<{ status: string }>> {
  try {
    const session = await requireRoleAction(["FINANCEIRO", "GESTAO"]);

    const result = await prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: args.orderId },
      });
      if (!order) throw new Error("Pedido nao encontrado.");
      if (order.status !== "EM_ANALISE") {
        throw new Error("Pedido nao esta em analise.");
      }

      const payStatus = await tx.paymentStatusOption.findUnique({
        where: { id: args.paymentStatusId },
      });
      if (!payStatus) throw new Error("Status de pagamento invalido.");

      // Regra: aprovacao (APROVA, ex.: "Pago") exige CNPJ vinculado ao pedido.
      if (payStatus.disposition === "APROVA" && !order.cnpjId) {
        throw new Error("Vincule um CNPJ ao pedido antes de aprovar.");
      }

      // Caminho de excecao: interrompe o fluxo.
      if (payStatus.disposition === "INTERROMPE") {
        const exceptionStatus =
          payStatus.name.toLowerCase().includes("parcial")
            ? "ESTORNO_PARCIAL"
            : payStatus.name.toLowerCase().includes("cancel")
              ? "CANCELADO"
              : "ESTORNO";

        await tx.order.update({
          where: { id: order.id },
          data: {
            comandaNumber: args.comandaNumber,
            paymentStatusId: args.paymentStatusId,
            status: exceptionStatus,
          },
        });
        await tx.orderStatusHistory.create({
          data: { orderId: order.id, status: exceptionStatus, changedBy: session.userId, note: payStatus.name },
        });
        return { status: exceptionStatus };
      }

      // Caminho de aprovacao: libera para a logistica.
      await tx.order.update({
        where: { id: order.id },
        data: {
          comandaNumber: args.comandaNumber,
          paymentStatusId: args.paymentStatusId,
          status: "AGUARDANDO_IMPRESSAO",
        },
      });
      await tx.orderStatusHistory.create({
        data: { orderId: order.id, status: "AGUARDANDO_IMPRESSAO", changedBy: session.userId, note: `Aprovado: ${payStatus.name}` },
      });
      await tx.delivery.create({
        data: { orderId: order.id, status: "AGUARDANDO" },
      });

      return { status: "AGUARDANDO_IMPRESSAO" };
    });

    revalidatePath("/financeiro");
    revalidatePath("/logistica");
    revalidatePath("/dashboard");
    return actionOk(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro ao auditar pedido.";
    return actionError(msg);
  }
}

// ===========================================================================
// Ferramentas do Financeiro: Formas de Pagamento, Bancos, Status de Pagamento
// (acesso para FINANCEIRO e GESTAO)
// ===========================================================================

export async function finCreatePaymentMethod(name: string): Promise<ActionResult<void>> {
  try {
    await requireRoleAction(["FINANCEIRO", "GESTAO"]);
    if (!name.trim()) return actionError("Nome obrigatório.");
    await prisma.paymentMethod.create({ data: { name: name.trim() } });
    revalidatePath("/financeiro");
    return actionOk(undefined);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao criar.");
  }
}

export async function finCreateBank(name: string): Promise<ActionResult<void>> {
  try {
    await requireRoleAction(["FINANCEIRO", "GESTAO"]);
    if (!name.trim()) return actionError("Nome obrigatório.");
    await prisma.bank.create({ data: { name: name.trim() } });
    revalidatePath("/financeiro");
    return actionOk(undefined);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao criar.");
  }
}

export async function finCreatePaymentStatus(
  name: string,
  disposition: PaymentDisposition,
): Promise<ActionResult<void>> {
  try {
    await requireRoleAction(["FINANCEIRO", "GESTAO"]);
    if (!name.trim()) return actionError("Nome obrigatório.");
    await prisma.paymentStatusOption.create({ data: { name: name.trim(), disposition } });
    revalidatePath("/financeiro");
    return actionOk(undefined);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao criar.");
  }
}

export async function finToggle(
  entity: "paymentMethod" | "bank" | "paymentStatusOption",
  id: string,
  active: boolean,
): Promise<ActionResult<void>> {
  try {
    await requireRoleAction(["FINANCEIRO", "GESTAO"]);
    await (prisma as any)[entity].update({ where: { id }, data: { active } });
    revalidatePath("/financeiro");
    return actionOk(undefined);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao atualizar.");
  }
}

export async function finRename(
  entity: "paymentMethod" | "bank" | "paymentStatusOption",
  id: string,
  name: string,
): Promise<ActionResult<void>> {
  try {
    await requireRoleAction(["FINANCEIRO", "GESTAO"]);
    if (!name.trim()) return actionError("Nome obrigatório.");
    await (prisma as any)[entity].update({ where: { id }, data: { name: name.trim() } });
    revalidatePath("/financeiro");
    return actionOk(undefined);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao renomear.");
  }
}

export async function finDelete(
  entity: "paymentMethod" | "bank" | "paymentStatusOption",
  id: string,
): Promise<ActionResult<void>> {
  try {
    await requireRoleAction(["FINANCEIRO", "GESTAO"]);
    if (entity !== "bank") {
      const field = entity === "paymentMethod" ? "paymentMethodId" : "paymentStatusId";
      const count = await prisma.order.count({ where: { [field]: id } as any });
      if (count > 0) return actionError(`Não é possível excluir: ${count} pedido(s) vinculado(s). Desative em vez de excluir.`);
    }
    await (prisma as any)[entity].delete({ where: { id } });
    revalidatePath("/financeiro");
    return actionOk(undefined);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao excluir.");
  }
}
