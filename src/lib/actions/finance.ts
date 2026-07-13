"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRoleAction } from "@/lib/auth";
import { processAndSaveImage } from "@/lib/image";
import { actionOk, actionError, type ActionResult } from "@/types/action";
import type { PaymentDisposition } from "@prisma/client";

/**
 * Financeiro define o BANCO e a FORMA DE PAGAMENTO do pedido.
 * Esses campos sairam do formulario de Vendas e agora sao preenchidos aqui,
 * na Analise de Pedidos. Sao pre-requisito para aprovar (ver auditOrder).
 */
export async function setOrderPaymentInfo(args: {
  orderId: string;
  paymentMethodId: string;
  bankId: string;
}): Promise<ActionResult<void>> {
  try {
    await requireRoleAction(["FINANCEIRO", "GESTAO"]);
    if (!args.paymentMethodId) return actionError("Selecione a forma de pagamento.");
    if (!args.bankId) return actionError("Selecione o banco.");

    const order = await prisma.order.findUnique({ where: { id: args.orderId } });
    if (!order) return actionError("Pedido não encontrado.");

    await prisma.order.update({
      where: { id: args.orderId },
      data: { paymentMethodId: args.paymentMethodId, bankId: args.bankId },
    });

    revalidatePath("/financeiro");
    revalidatePath("/fluxo");
    return actionOk(undefined);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao salvar dados de pagamento.");
  }
}

/**
 * Financeiro anexa o SEGUNDO comprovante de pagamento.
 * Regra do projeto: a imagem NUNCA vai para o banco. O Sharp converte para
 * .webp e grava no disco; no banco fica apenas a string do caminho.
 */
export async function uploadSecondPaymentProof(args: {
  orderId: string;
  base64: string;
}): Promise<ActionResult<{ filePath: string }>> {
  try {
    await requireRoleAction(["FINANCEIRO", "GESTAO"]);
    if (!args.orderId) return actionError("Pedido não informado.");
    if (!args.base64) return actionError("Arquivo obrigatório.");

    const order = await prisma.order.findUnique({ where: { id: args.orderId } });
    if (!order) return actionError("Pedido não encontrado.");

    const raw = args.base64.replace(/^data:[^;]+;base64,/, "");
    const buffer = Buffer.from(raw, "base64");
    if (buffer.length === 0) return actionError("Arquivo inválido.");
    if (buffer.length > 15 * 1024 * 1024) return actionError("Imagem muito grande (máx. 15MB).");

    const processed = await processAndSaveImage(buffer, {
      folder: "comprovantes-pagamento",
      fileName: `${order.id}_paymentProof2Path_${Date.now()}`,
    });

    await prisma.order.update({
      where: { id: order.id },
      data: { paymentProof2Path: processed.filePath },
    });

    revalidatePath("/financeiro");
    revalidatePath("/fluxo");
    return actionOk({ filePath: processed.filePath });
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao anexar comprovante.");
  }
}

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

      // Regras de APROVACAO (disposicao APROVA, ex.: "Pago"):
      // o pedido so e liberado com todos os dados do Financeiro preenchidos.
      if (payStatus.disposition === "APROVA") {
        if (!order.cnpjId) {
          throw new Error("Vincule um CNPJ ao pedido antes de aprovar.");
        }
        if (!order.paymentMethodId) {
          throw new Error("Informe a Forma de Pagamento antes de aprovar.");
        }
        if (!order.bankId) {
          throw new Error("Informe o Banco antes de aprovar.");
        }
        if (!order.paymentProof2Path) {
          throw new Error("Anexe o segundo comprovante de pagamento antes de aprovar.");
        }
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
