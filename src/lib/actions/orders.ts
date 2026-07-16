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

    // Comprovantes de pagamento (ate 5). Cada imagem vira .webp no disco e
    // grava uma linha em OrderPaymentProof (no banco so o caminho).
    const proofs = (input.paymentProofsBase64 ?? []).slice(0, 5);
    for (const [i, dataUrl] of proofs.entries()) {
      try {
        const base64 = dataUrl.replace(/^data:[^;]+;base64,/, "");
        const buffer = Buffer.from(base64, "base64");
        if (buffer.length === 0) continue;
        const processed = await processAndSaveImage(buffer, {
          folder: "comprovantes-pagamento",
          fileName: `${order.id}_paymentProof_${i + 1}_${Date.now()}`,
        });
        await prisma.orderPaymentProof.create({
          data: {
            orderId: order.id,
            filePath: processed.filePath,
            width: processed.width,
            height: processed.height,
            sizeBytes: processed.sizeBytes,
          },
        });
        // Compat: guarda o PRIMEIRO comprovante tambem no campo antigo, para
        // telas/consultas que ainda leem paymentProofPath.
        if (i === 0) {
          await prisma.order.update({
            where: { id: order.id },
            data: { paymentProofPath: processed.filePath },
          });
        }
      } catch {
        // Nao derruba o pedido se um comprovante falhar; pode reenviar depois.
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
  orderNumber?: string;
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
  // Campanha
  campaignId?: string | null;
  itemCount?: number;
  // Novos comprovantes a ADICIONAR (ate 5 no total). Substituicao e feita
  // removendo os antigos via removeProofIds.
  paymentProofsBase64?: string[];
  removeProofIds?: string[];
}): Promise<ActionResult<void>> {
  try {
    // GESTAO edita qualquer pedido; VENDAS edita apenas os proprios.
    const session = await requireRoleAction(["GESTAO", "VENDAS"]);
    const order = await prisma.order.findUnique({ where: { id: args.id } });
    if (!order) return actionError("Pedido não encontrado.");

    // Trava de escopo no SERVIDOR (nao confiar so na tela): impede a vendedora
    // de alterar o pedido de outra pessoa chamando a action diretamente.
    if (session.role === "VENDAS" && order.sellerId !== session.userId) {
      return actionError("Você só pode editar os seus próprios pedidos.");
    }

    const orderValue = args.orderValue ?? Number(order.orderValue);
    const freight = args.freight ?? Number(order.freight);
    if (!(orderValue > 0)) return actionError("Valor do pedido inválido.");

    // "Forma de Pagamento" e "Banco" sao do FINANCEIRO (definidos na Analise
    // de Pedidos). A vendedora nunca os altera, mesmo que o payload venha
    // adulterado — aqui simplesmente ignoramos o que ela mandar.
    const podeMexerNoFinanceiro = session.role === "GESTAO";

    await prisma.order.update({
      where: { id: args.id },
      data: {
        customerId: args.customerId ?? order.customerId,
        storeId: args.storeId ?? order.storeId,
        orderTypeId: args.orderTypeId ?? order.orderTypeId,
        operationId: args.operationId ?? order.operationId,
        // FKs opcionais: string vazia vira NULL (senão a FK quebra).
        // Se quem edita NAO e a Gestao, mantemos o valor atual (ignora o payload).
        paymentMethodId: !podeMexerNoFinanceiro
          ? order.paymentMethodId
          : args.paymentMethodId
            ? args.paymentMethodId
            : (args.paymentMethodId === "" ? null : order.paymentMethodId),
        shippingMethodId: args.shippingMethodId ?? order.shippingMethodId,
        bankId: !podeMexerNoFinanceiro
          ? order.bankId
          : args.bankId
            ? args.bankId
            : (args.bankId === "" ? null : order.bankId),
        orderValue,
        freight,
        total: orderValue + freight,
        notes: args.notes === undefined ? order.notes : args.notes,
        // Numero do pedido (editavel como no cadastro).
        orderNumber: args.orderNumber?.trim() ? args.orderNumber.trim() : order.orderNumber,
        // Campanha: campaignId "" ou null limpa o vinculo.
        campaignId: args.campaignId === undefined
          ? order.campaignId
          : (args.campaignId ? args.campaignId : null),
        itemCount: args.campaignId
          ? (args.itemCount ?? order.itemCount)
          : (args.campaignId === undefined ? order.itemCount : 0),
      },
    });

    // Remocao de comprovantes marcados (substituicao de anexos).
    if (args.removeProofIds?.length) {
      await prisma.orderPaymentProof.deleteMany({
        where: { id: { in: args.removeProofIds }, orderId: order.id },
      });
    }

    // Novos comprovantes: respeita o teto de 5 no total.
    const novos = (args.paymentProofsBase64 ?? []).filter(Boolean);
    if (novos.length) {
      const jaTem = await prisma.orderPaymentProof.count({ where: { orderId: order.id } });
      const espaco = Math.max(0, 5 - jaTem);
      for (const [i, dataUrl] of novos.slice(0, espaco).entries()) {
        try {
          const base64 = dataUrl.replace(/^data:[^;]+;base64,/, "");
          const buffer = Buffer.from(base64, "base64");
          if (buffer.length === 0) continue;
          const processed = await processAndSaveImage(buffer, {
            folder: "comprovantes-pagamento",
            fileName: `${order.id}_paymentProof_edit_${jaTem + i + 1}_${Date.now()}`,
          });
          await prisma.orderPaymentProof.create({
            data: {
              orderId: order.id,
              filePath: processed.filePath,
              width: processed.width,
              height: processed.height,
              sizeBytes: processed.sizeBytes,
            },
          });
        } catch {
          // ignora um anexo que falhe, sem derrubar a edicao
        }
      }
    }
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

/**
 * VENDAS marca a pendencia do Financeiro como RESOLVIDA.
 * Mantem o texto do problema (historico), mas registra a resolucao — o card
 * volta ao normal e o Financeiro ve que foi resolvida.
 */
export async function resolveFinanceIssue(orderId: string): Promise<ActionResult<void>> {
  try {
    const session = await requireRoleAction(["VENDAS", "GESTAO"]);
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) return actionError("Pedido não encontrado.");

    // Vendedora so resolve os proprios pedidos.
    if (session.role === "VENDAS" && order.sellerId !== session.userId) {
      return actionError("Você só pode resolver pendências dos seus pedidos.");
    }
    if (!order.financeIssue || order.financeIssueResolvedAt) {
      return actionError("Não há pendência ativa neste pedido.");
    }

    await prisma.order.update({
      where: { id: orderId },
      data: { financeIssueResolvedAt: new Date() },
    });

    revalidatePath("/vendas");
    revalidatePath("/financeiro");
    revalidatePath("/fluxo");
    return actionOk(undefined);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao resolver pendência.");
  }
}
