"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRoleAction } from "@/lib/auth";
import { createOrderSchema } from "@/lib/validations/order";
import { processAndSaveImage } from "@/lib/image";
import { actionOk, actionError, type ActionResult } from "@/types/action";
import { Prisma } from "@prisma/client";

/**
 * Vendas cria um pedido.
 * O valor total e informado diretamente (sem itens).
 * Ao enviar, status vai automaticamente para EM_ANALISE (retido ate o Financeiro).
 */
export async function createOrder(
  raw: unknown,
): Promise<ActionResult<{ id: string; orderNumber: string }>> {
  try {
    const session = await requireRoleAction(["VENDAS", "GESTAO"]);

    const parsed = createOrderSchema.safeParse(raw);
    if (!parsed.success) {
      return actionError("Dados invalidos.", parsed.error.flatten().fieldErrors);
    }
    const input = parsed.data;

    const orderValue = new Prisma.Decimal(input.orderValue);
    const freight = new Prisma.Decimal(input.freight);
    const total = orderValue.add(freight);

    // Se vinculado a campanha, exige quantidade de itens (volume).
    const campaignId = input.campaignId || null;
    if (campaignId && !(input.itemCount > 0)) {
      return actionError("Informe a quantidade de itens para a campanha.");
    }

    const order = await prisma.order.create({
      data: {
        orderNumber: input.orderNumber,
        storeId: input.storeId,
        orderTypeId: input.orderTypeId,
        operationId: input.operationId,
        customerId: input.customerId,
        sellerId: session.userId,
        // "Forma de Pagamento" e "Banco" ficam vazios na criacao:
        // o FINANCEIRO os preenche na Analise de Pedidos antes de aprovar.
        shippingMethodId: input.shippingMethodId,
        orderValue,
        freight,
        total,
        notes: input.notes,
        campaignId,
        itemCount: campaignId ? input.itemCount : 0,
        status: "EM_ANALISE",
        history: {
          create: { status: "EM_ANALISE", changedBy: session.userId, note: "Pedido criado" },
        },
      },
      select: { id: true, orderNumber: true },
    });

    // Comprovante de pagamento (opcional): converte base64 -> webp no disco.
    if (input.paymentProofBase64) {
      try {
        const base64 = input.paymentProofBase64.replace(/^data:[^;]+;base64,/, "");
        const buffer = Buffer.from(base64, "base64");
        if (buffer.length > 0) {
          const processed = await processAndSaveImage(buffer, {
            folder: "comprovantes-pagamento",
            fileName: `${order.id}_paymentProofPath_${Date.now()}`,
          });
          await prisma.order.update({
            where: { id: order.id },
            data: { paymentProofPath: processed.filePath },
          });
        }
      } catch {
        // Nao derruba o pedido se o comprovante falhar; pode reenviar depois.
      }
    }

    revalidatePath("/vendas");
    revalidatePath("/fluxo");
    return actionOk(order);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro ao criar pedido.";
    return actionError(msg);
  }
}

/**
 * Edição de pedido — exclusiva da Gestão.
 * Ajusta dados cadastrais e valores; não mexe em status/comanda.
 */
export async function updateOrder(args: {
  id: string;
  customerId?: string;
  storeId?: string;
  orderTypeId?: string;
  operationId?: string;
  paymentMethodId?: string;
  shippingMethodId?: string;
  bankId?: string;
  orderValue?: number;
  freight?: number;
  notes?: string | null;
}): Promise<ActionResult<void>> {
  try {
    await requireRoleAction(["GESTAO"]);
    const order = await prisma.order.findUnique({ where: { id: args.id } });
    if (!order) return actionError("Pedido não encontrado.");

    const orderValue = args.orderValue ?? Number(order.orderValue);
    const freight = args.freight ?? Number(order.freight);
    if (!(orderValue > 0)) return actionError("Valor do pedido inválido.");

    await prisma.order.update({
      where: { id: args.id },
      data: {
        customerId: args.customerId ?? order.customerId,
        storeId: args.storeId ?? order.storeId,
        orderTypeId: args.orderTypeId ?? order.orderTypeId,
        operationId: args.operationId ?? order.operationId,
        // FKs opcionais: string vazia vira NULL (senão a FK quebra).
        paymentMethodId: args.paymentMethodId
          ? args.paymentMethodId
          : (args.paymentMethodId === "" ? null : order.paymentMethodId),
        shippingMethodId: args.shippingMethodId ?? order.shippingMethodId,
        bankId: args.bankId ? args.bankId : (args.bankId === "" ? null : order.bankId),
        orderValue,
        freight,
        total: orderValue + freight,
        notes: args.notes === undefined ? order.notes : args.notes,
      },
    });
    revalidatePath("/vendas");
    revalidatePath("/fluxo");
    revalidatePath("/logistica");
    return actionOk(undefined);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao editar pedido.");
  }
}

/**
 * Exclusão de pedido — exclusiva da Gestão.
 * OrderItem e OrderStatusHistory caem por cascade; Delivery (e Proof) são
 * removidos manualmente dentro de uma transação.
 */
export async function deleteOrder(id: string): Promise<ActionResult<void>> {
  try {
    await requireRoleAction(["GESTAO"]);
    const order = await prisma.order.findUnique({ where: { id }, include: { delivery: true } });
    if (!order) return actionError("Pedido não encontrado.");

    await prisma.$transaction(async (tx) => {
      if (order.delivery) {
        await tx.proof.deleteMany({ where: { deliveryId: order.delivery.id } });
        await tx.delivery.delete({ where: { id: order.delivery.id } });
      }
      await tx.order.delete({ where: { id } });
    });

    revalidatePath("/vendas");
    revalidatePath("/fluxo");
    revalidatePath("/logistica");
    return actionOk(undefined);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao excluir pedido.");
  }
}
