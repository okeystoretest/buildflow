"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRoleAction, getActorContext } from "@/lib/auth";
import { actionOk, actionError, type ActionResult } from "@/types/action";
import { nextStatus, canTransition, nextSimplifiedStatus, canTransitionSimplified } from "@/lib/order-flow";
import { canInteractWithOrder } from "@/lib/permissions";
import { isAnexoDispensavel } from "@/lib/validations/order";
import { emitOrderUpdated, emitOrderAvailableForDrivers } from "@/lib/realtime/emit";
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
    const session = await requireRoleAction();

    const order = await prisma.order.findUnique({
      where: { id: args.orderId },
      include: {
        originStore: { select: { simplifiedFlow: true } },
        orderType: { select: { name: true } },
      },
    });
    if (!order) return actionError("Pedido nao encontrado.");

    const simplified = order.originStore?.simplifiedFlow === true;

    // Permissao para avancar:
    // - LOGISTICA/GESTAO/FINANCEIRO: sempre.
    // - Demais perfis (ex.: VENDAS): so o CRIADOR do pedido ou quem tem a Loja
    //   de Origem atrelada (canInteractWithOrder). Isso da ao criador do pedido
    //   a mesma autonomia da logistica padrao para mover os cards, inclusive no
    //   fluxo simplificado.
    // - Restricao extra no fluxo simplificado: usuario VENDAS so pode mover os
    //   PROPRIOS pedidos (ownership) — nunca pedidos de terceiros.
    const privileged =
      session.role === "LOGISTICA" || session.role === "GESTAO" || session.role === "FINANCEIRO";
    if (!privileged) {
      const actor = await getActorContext();
      const podeInteragir =
        !!actor &&
        canInteractWithOrder(actor, {
          sellerId: order.sellerId,
          originStoreId: order.originStoreId,
        });
      // No fluxo simplificado, VENDAS fica limitado aos proprios pedidos.
      const bloqueadoPorOwnership =
        simplified && session.role === "VENDAS" && order.sellerId !== session.userId;
      if (!podeInteragir || bloqueadoPorOwnership) {
        return actionError("Você não tem permissão para avançar este pedido.");
      }
    }
    // Pedido tipo "Troca" ou "Doação" dispensa a Nota Fiscal.
    const semNfObrigatoria = isAnexoDispensavel(order.orderType?.name);

    // Regra de permissão: sair de EM_ANALISE é exclusivo do Financeiro (e Gestão).
    // A Logística não avança o pedido enquanto estiver Em Análise.
    if (order.status === "EM_ANALISE" && session.role !== "FINANCEIRO" && session.role !== "GESTAO") {
      return actionError("Apenas o Financeiro pode avançar pedidos em Análise.");
    }

    // ---- FLUXO SIMPLIFICADO (Loja de Origem): PAGO -> EMBALADO -> ENTREGUE ----
    // Caminho curto e separado: sem NF, sem PENDENTE, sem fase de motorista.
    if (simplified) {
      const target = args.to ?? nextSimplifiedStatus(order.status);
      if (!target) return actionError("Pedido ja no ultimo status do fluxo.");
      if (!canTransitionSimplified(order.status, target)) {
        return actionError("Transicao de status invalida.");
      }
      await prisma.$transaction(async (tx) => {
        await tx.order.update({ where: { id: order.id }, data: { status: target } });
        await tx.orderStatusHistory.create({
          data: { orderId: order.id, status: target, changedBy: session.userId },
        });
      });
      revalidatePath("/logistica");
      revalidatePath("/fluxo");
      revalidatePath("/dashboard");
      emitOrderUpdated({ orderId: args.orderId, status: target });
      return actionOk({ status: target });
    }

    // ---- FLUXO PADRAO (linear) ----
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
    // EXCECAO: pedidos "Troca" e "Doação" nao exigem NF.
    if (order.status === "PROCESSANDO" && !order.invoicePath && !semNfObrigatoria) {
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
    emitOrderUpdated({ orderId: args.orderId, status: target });
    return actionOk({ status: target });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro ao avancar status.";
    return actionError(msg);
  }
}

/**
 * Envio EXTERNO (Correios/Transportadora): ao informar codigo de rastreio, o
 * pedido nao usa motorista proprio. Move PROCESSANDO/PROCESSADO -> EM_ROTA,
 * grava o rastreio e marca a entrega como EM_ROTA SEM motorista (driverId null).
 * Assim o pedido sai da fila de logistica sem exigir escolha de motorista e nao
 * aparece na coluna "Aguardando Entregador" dos motoristas (que so pega ENVIADO).
 */
export async function shipWithTracking(args: {
  orderId: string;
  trackingCode: string;
}): Promise<ActionResult<void>> {
  try {
    const session = await requireRoleAction(["LOGISTICA", "GESTAO"]);

    const tracking = args.trackingCode?.trim();
    if (!tracking) return actionError("Informe o codigo de rastreio.");

    await prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: args.orderId },
        include: { delivery: true },
      });
      if (!order) throw new Error("Pedido nao encontrado.");
      if (order.status !== "PROCESSANDO" && order.status !== "PROCESSADO") {
        throw new Error("O pedido precisa estar em Processando/Processado para envio externo.");
      }

      // Envio externo (Correios/Transportadora): sem motorista proprio. O pedido
      // vai para PROCESSADO com o rastreio gravado. A Delivery pode nao existir
      // ainda (ex.: Troca, que pula a aprovacao do Financeiro) — usamos upsert.
      // Fica sem motorista (driverId null); o despacho e feito pela transportadora.
      await tx.delivery.upsert({
        where: { orderId: order.id },
        update: { status: "AGUARDANDO", driverId: null, assignedAt: null },
        create: { orderId: order.id, status: "AGUARDANDO" },
      });
      await tx.order.update({
        where: { id: order.id },
        data: { status: "PROCESSADO", trackingCode: tracking },
      });
      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          status: "PROCESSADO",
          changedBy: session.userId,
          note: `Envio externo (Correios/Transportadora) · Rastreio: ${tracking}`,
        },
      });
    });

    revalidatePath("/logistica");
    revalidatePath("/dashboard");
    revalidatePath("/motorista");
    emitOrderUpdated({ orderId: args.orderId });
    return actionOk(undefined);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro ao registrar envio externo.";
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

      // A Delivery pode nao existir ainda (ex.: Troca, que pula a aprovacao do
      // Financeiro onde a entrega e criada). Cria/atualiza via upsert.
      await tx.delivery.upsert({
        where: { orderId: order.id },
        update: { status: "ATRIBUIDA", driverId: args.driverId, assignedAt: new Date() },
        create: { orderId: order.id, status: "ATRIBUIDA", driverId: args.driverId, assignedAt: new Date() },
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
    emitOrderUpdated({ orderId: args.orderId });
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

    // O push aos motoristas usa dados do pedido; retornamos da transação para
    // evitar mutar um `let` externo dentro do callback (o control-flow do TS
    // pode estreitar indevidamente para `never`).
    const pushInfo = await prisma.$transaction<
      { orderNumber: string; customerName?: string } | null
    >(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: args.orderId },
        include: { delivery: true, customer: true },
      });
      if (!order) throw new Error("Pedido nao encontrado.");
      if (order.status !== "PROCESSANDO" && order.status !== "PROCESSADO") {
        throw new Error("O pedido precisa estar em Processando/Processado para abrir aos motoristas.");
      }

      // Entrega fica SEM motorista, aguardando alguém pegar. Cria a Delivery se
      // ainda nao existir (ex.: Troca, que pula a aprovacao do Financeiro).
      await tx.delivery.upsert({
        where: { orderId: order.id },
        update: { status: "AGUARDANDO", driverId: null, assignedAt: null },
        create: { orderId: order.id, status: "AGUARDANDO" },
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

      // Só notifica os motoristas quando o pedido de fato cai na coluna aberta,
      // isto é, SEM rastreio (com rastreio segue por transportadora e não
      // aparece no Kanban de Motoristas — não faria sentido chamar entregador).
      return tracking
        ? null
        : { orderNumber: order.orderNumber, customerName: order.customer?.name };
    });

    revalidatePath("/logistica");
    revalidatePath("/dashboard");
    revalidatePath("/motorista");
    emitOrderUpdated({ orderId: args.orderId });
    // Web Push a nível de SO para todos os motoristas (fire-and-forget).
    if (pushInfo) {
      emitOrderAvailableForDrivers({
        orderId: args.orderId,
        orderNumber: pushInfo.orderNumber,
        customerName: pushInfo.customerName,
      });
    }
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
    emitOrderUpdated({ orderId: args.orderId });
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
    // Resolucao de pendencia liberada para LOGISTICA/GESTAO e tambem para
    // VENDAS quando for o criador do pedido ou tiver a Loja de Origem atrelada
    // (paridade com o avanco de status no fluxo simplificado/padrao).
    const session = await requireRoleAction(["LOGISTICA", "GESTAO", "VENDAS"]);

    const order = await prisma.order.findUnique({ where: { id: args.orderId } });
    if (!order) return actionError("Pedido nao encontrado.");
    if (order.status !== "PENDENTE") {
      return actionError("Só é possível resolver pedidos que estão em Pendente.");
    }

    // Trava de escopo no servidor para perfis nao privilegiados (ex.: VENDAS).
    const privileged = session.role === "LOGISTICA" || session.role === "GESTAO";
    if (!privileged) {
      const actor = await getActorContext();
      const podeInteragir =
        !!actor &&
        canInteractWithOrder(actor, {
          sellerId: order.sellerId,
          originStoreId: order.originStoreId,
        });
      if (!podeInteragir) {
        return actionError("Você não tem permissão para resolver este pedido.");
      }
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
    emitOrderUpdated({ orderId: args.orderId });
    return actionOk({ status: target });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro ao resolver pendência.";
    return actionError(msg);
  }
}

/**
 * Move um pedido DIRETAMENTE para um status arbitrario — usado pelo
 * drag-and-drop do Kanban, EXCLUSIVO da GESTAO. Diferente de
 * advanceOrderStatus (que so avanca 1 passo no fluxo), aqui a Gestao pode
 * arrastar o card para qualquer coluna. Registra a mudanca no historico.
 *
 * Nao dispara os efeitos colaterais operacionais do fluxo padrao (motorista,
 * notificacao de NF, sincronizacao de entrega): e uma correcao manual de
 * status pela Gestao, nao a operacao normal da Logistica.
 */
export async function setOrderStatus(args: {
  orderId: string;
  to: OrderStatus;
}): Promise<ActionResult<{ status: OrderStatus }>> {
  try {
    // Restrito a GESTAO.
    const session = await requireRoleAction(["GESTAO"]);

    const order = await prisma.order.findUnique({
      where: { id: args.orderId },
      select: { id: true, status: true },
    });
    if (!order) return actionError("Pedido nao encontrado.");

    // Sem no-op: se ja esta no status alvo, nada a fazer.
    if (order.status === args.to) return actionOk({ status: order.status });

    await prisma.$transaction(async (tx) => {
      await tx.order.update({ where: { id: order.id }, data: { status: args.to } });
      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          status: args.to,
          changedBy: session.userId,
          note: "Status alterado pela Gestão.",
        },
      });
    });

    revalidatePath("/logistica");
    revalidatePath("/fluxo");
    revalidatePath("/dashboard");
    revalidatePath("/motorista");
    emitOrderUpdated({ orderId: args.orderId });
    return actionOk({ status: args.to });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro ao alterar status.";
    return actionError(msg);
  }
}
