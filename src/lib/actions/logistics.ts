"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRoleAction } from "@/lib/auth";
import { actionOk, actionError, type ActionResult } from "@/types/action";
import { nextStatus, canTransition } from "@/lib/order-flow";
import type { OrderStatus } from "@prisma/client";

/**
 * Logistica avanca o pedido para um status especifico (ou o proximo do fluxo).
 * - Ao chegar em EMBALADO: dispara notificacao de NF para a vendedora.
 * - PROCESSADO exige atribuicao de motorista (feito por assignDriverToOrder).
 */
export async function advanceOrderStatus(args: {
  orderId: string;
  to?: OrderStatus; // se omitido, usa o proximo do fluxo
  pendencyNote?: string; // descricao da pendencia (quando target = PENDENTE)
  skipPendente?: boolean; // pula a etapa PENDENTE indo direto p/ a seguinte
}): Promise<ActionResult<{ status: OrderStatus }>> {
  try {
    const session = await requireRoleAction(["LOGISTICA", "GESTAO", "FINANCEIRO"]);

    const order = await prisma.order.findUnique({ where: { id: args.orderId } });
    if (!order) return actionError("Pedido nao encontrado.");

    // Regra de permissão: sair de EM_ANALISE é exclusivo do Financeiro (e Gestão).
    // A Logística não avança o pedido enquanto estiver Em Análise.
    if (order.status === "EM_ANALISE" && session.role !== "FINANCEIRO" && session.role !== "GESTAO") {
      return actionError("Apenas o Financeiro pode avançar pedidos em Análise.");
    }

    let target = args.to ?? nextStatus(order.status);
    if (!target) return actionError("Pedido ja no ultimo status do fluxo.");

    // Caso "Não há pendência": pula PENDENTE indo para o status seguinte (CONFERINDO).
    if (args.skipPendente && target === "PENDENTE") {
      const afterPendente = nextStatus("PENDENTE"); // CONFERINDO
      if (afterPendente) target = afterPendente;
    }

    // Se vai para PENDENTE, exige descricao da pendencia.
    if (target === "PENDENTE" && !args.pendencyNote?.trim()) {
      return actionError("Descreva a pendência para mover o pedido para Pendente.");
    }

    // Regra de NF: um pedido em PROCESSANDO só avança se tiver a Nota Fiscal
    // anexada. Sem NF, o avanço é bloqueado (alerta exibido na tela).
    if (order.status === "PROCESSANDO" && !order.invoicePath) {
      return actionError("Anexe a Nota Fiscal antes de avançar este pedido (Processando sem NF).");
    }

    // Permite a transicao normal (1 passo) ou o pulo SEPARANDO->CONFERINDO.
    const puloValido = order.status === "SEPARANDO" && target === "CONFERINDO";
    if (!puloValido && !canTransition(order.status, target)) {
      return actionError("Transicao de status invalida.");
    }

    await prisma.$transaction(async (tx) => {
      await tx.order.update({ where: { id: order.id }, data: { status: target } });
      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          status: target,
          changedBy: session.userId,
          note: target === "PENDENTE" ? `Pendência: ${args.pendencyNote!.trim()}` : undefined,
        },
      });

      // Regra: ao chegar em EMBALADO, notifica a vendedora para anexar a NF.
      if (target === "EMBALADO") {
        await tx.notification.create({
          data: {
            userId: order.sellerId,
            orderId: order.id,
            message: `Pedido ${order.orderNumber} embalado. Anexe a Nota Fiscal.`,
          },
        });
      }

      // Ao ENVIADO/EM_ROTA, sincroniza a entrega.
      if (target === "ENVIADO" || target === "EM_ROTA") {
        await tx.delivery.updateMany({
          where: { orderId: order.id },
          data: { status: "EM_ROTA", startedAt: new Date() },
        });
      }
    });

    revalidatePath("/logistica");
    revalidatePath("/fluxo");
    revalidatePath("/motorista");
    return actionOk({ status: target });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro ao avancar status.";
    return actionError(msg);
  }
}

/**
 * Pop-up obrigatorio no PROCESSADO: atribui motorista a entrega.
 * Move o pedido para PROCESSADO e a entrega para ATRIBUIDA.
 */
export async function assignDriverToOrder(args: {
  orderId: string;
  driverId: string;
  trackingCode?: string | null;
}): Promise<ActionResult<void>> {
  try {
    const session = await requireRoleAction(["LOGISTICA", "GESTAO"]);

    const tracking = args.trackingCode?.trim() || null;

    await prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: args.orderId },
        include: { delivery: true },
      });
      if (!order) throw new Error("Pedido nao encontrado.");
      if (!order.delivery) throw new Error("Entrega nao encontrada para o pedido.");

      await tx.delivery.update({
        where: { id: order.delivery.id },
        data: { status: "ATRIBUIDA", driverId: args.driverId, assignedAt: new Date() },
      });
      await tx.order.update({
        where: { id: order.id },
        data: {
          status: "PROCESSADO",
          // So sobrescreve o rastreio se um novo codigo foi informado.
          ...(tracking ? { trackingCode: tracking } : {}),
        },
      });
      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          status: "PROCESSADO",
          changedBy: session.userId,
          note: tracking ? `Motorista atribuido · Rastreio: ${tracking}` : "Motorista atribuido",
        },
      });
    });

    revalidatePath("/logistica");
    revalidatePath("/dashboard");
    revalidatePath("/motorista");
    return actionOk(undefined);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro ao atribuir motorista.";
    return actionError(msg);
  }
}

/**
 * "Em aberto": a Logística NÃO escolhe motorista. Deixa o pedido disponível
 * para qualquer motorista pegar. Move o pedido direto para ENVIADO e mantém a
 * entrega sem driver (status AGUARDANDO). O card aparece na coluna
 * "Aguardando Entregador" do Kanban de Motoristas.
 *
 * Convive com assignDriverToOrder: a Logística escolhe UM ou deixa em aberto.
 */
export async function openOrderForDrivers(args: {
  orderId: string;
  trackingCode?: string | null;
}): Promise<ActionResult<void>> {
  try {
    const session = await requireRoleAction(["LOGISTICA", "GESTAO"]);

    const tracking = args.trackingCode?.trim() || null;

    await prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: args.orderId },
        include: { delivery: true },
      });
      if (!order) throw new Error("Pedido nao encontrado.");
      if (!order.delivery) throw new Error("Entrega nao encontrada para o pedido.");
      if (order.status !== "PROCESSANDO" && order.status !== "PROCESSADO") {
        throw new Error("O pedido precisa estar em Processando/Processado para abrir aos motoristas.");
      }

      // Entrega fica SEM motorista, aguardando alguém pegar.
      await tx.delivery.update({
        where: { id: order.delivery.id },
        data: { status: "AGUARDANDO", driverId: null, assignedAt: null },
      });
      // Pedido vai direto para ENVIADO (disponível no Kanban de Motoristas).
      await tx.order.update({
        where: { id: order.id },
        data: {
          status: "ENVIADO",
          ...(tracking ? { trackingCode: tracking } : {}),
        },
      });
      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          status: "ENVIADO",
          changedBy: session.userId,
          note: tracking
            ? `Em aberto para motoristas · Rastreio: ${tracking}`
            : "Em aberto para motoristas",
        },
      });
    });

    revalidatePath("/logistica");
    revalidatePath("/dashboard");
    revalidatePath("/motorista");
    return actionOk(undefined);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro ao abrir pedido aos motoristas.";
    return actionError(msg);
  }
}

/**
 * "Atribuir": um MOTORISTA pega para si um pedido que está em aberto
 * (coluna "Aguardando Entregador"). Vincula a entrega ao usuário autenticado e
 * mantém o pedido em ENVIADO — a partir daí o card sai da coluna aberta e
 * aparece em "Enviado" apenas para o motorista que pegou.
 *
 * Regra: qualquer motorista pode pegar qualquer pedido em aberto, mas só se
 * ninguém tiver pego antes (corrida resolvida na transação).
 */
export async function claimOpenOrder(args: {
  orderId: string;
}): Promise<ActionResult<void>> {
  try {
    const session = await requireRoleAction(["MOTORISTA", "GESTAO"]);

    await prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: args.orderId },
        include: { delivery: true },
      });
      if (!order) throw new Error("Pedido nao encontrado.");
      if (!order.delivery) throw new Error("Entrega nao encontrada para o pedido.");
      if (order.status !== "ENVIADO") {
        throw new Error("Este pedido não está mais disponível.");
      }
      if (order.delivery.driverId) {
        throw new Error("Outro motorista já pegou este pedido.");
      }

      await tx.delivery.update({
        where: { id: order.delivery.id },
        data: {
          status: "ATRIBUIDA",
          driverId: session.userId,
          assignedAt: new Date(),
        },
      });
      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          status: "ENVIADO",
          changedBy: session.userId,
          note: "Atribuído ao motorista (pego em aberto)",
        },
      });
    });

    revalidatePath("/motorista");
    revalidatePath("/logistica");
    revalidatePath("/dashboard");
    return actionOk(undefined);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro ao atribuir pedido.";
    return actionError(msg);
  }
}

/**
 * Resolve uma pendência: registra (opcionalmente) um comentário de resolução
 * no histórico e AVANÇA o pedido do status PENDENTE para o próximo do fluxo
 * (CONFERINDO). Tudo dentro de uma transação — comentário e mudança de status
 * andam juntos ou nenhum acontece.
 */
export async function resolvePendency(args: {
  orderId: string;
  resolutionNote?: string; // comentário opcional descrevendo a resolução
}): Promise<ActionResult<{ status: OrderStatus }>> {
  try {
    const session = await requireRoleAction(["LOGISTICA", "GESTAO"]);

    const order = await prisma.order.findUnique({ where: { id: args.orderId } });
    if (!order) return actionError("Pedido nao encontrado.");
    if (order.status !== "PENDENTE") {
      return actionError("Só é possível resolver pedidos que estão em Pendente.");
    }

    const target = nextStatus("PENDENTE"); // CONFERINDO
    if (!target) return actionError("Não há próximo status após Pendente.");

    const note = args.resolutionNote?.trim();

    await prisma.$transaction(async (tx) => {
      await tx.order.update({ where: { id: order.id }, data: { status: target } });
      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          status: target,
          changedBy: session.userId,
          note: note ? `Pendência resolvida: ${note}` : "Pendência resolvida",
        },
      });
    });

    revalidatePath("/logistica");
    revalidatePath("/fluxo");
    revalidatePath("/dashboard");
    revalidatePath("/motorista");
    return actionOk({ status: target });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro ao resolver pendência.";
    return actionError(msg);
  }
}
