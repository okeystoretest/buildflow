"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRoleAction, getActorContext } from "@/lib/auth";
import { actionOk, actionError, type ActionResult } from "@/types/action";
import { nextStatus, canTransition, nextSimplifiedStatus, canTransitionSimplified } from "@/lib/order-flow";
import { canInteractWithOrder } from "@/lib/permissions";
import { isAnexoDispensavelPorContexto } from "@/lib/validations/order";
import { ativarPecaAoEntregar } from "@/lib/piece-sync";
import { emitOrderUpdated, notifyOrderReady } from "@/lib/realtime/emit";
import { sendPushToUser } from "@/lib/push";
import type { OrderStatus } from "@prisma/client";

/**
 * Logistica avanca o pedido para um status especifico (ou o proximo do fluxo).
 * - Ao chegar em EMBALANDO: dispara notificacao de NF para a vendedora.
 * - A saida de PROCESSANDO exige escolher o envio: rastreio (transportadora)
 *   ou motorista (proprio/em aberto). Ver assignDriverToOrder/openOrderForDrivers.
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
        operation: { select: { name: true } },
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
    // Anexos (NF/Comprovante) dispensados por TIPO (Troca, Doação,
    // Transferência) OU por OPERAÇÃO ("20 - Venda para Funcionário Interno").
    // Nesses casos a Logística avança livremente por todos os status.
    const semNfObrigatoria = isAnexoDispensavelPorContexto({
      orderTypeName: order.orderType?.name,
      operationName: order.operation?.name,
    });

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
        // Controle de Peças: a entrega registrada libera a peça para "Em Uso".
        if (target === "ENTREGUE") {
          await ativarPecaAoEntregar(tx, order.id, session.userId);
        }
      });
      revalidatePath("/logistica");
      revalidatePath("/fluxo");
      revalidatePath("/dashboard");
      if (target === "ENTREGUE") revalidatePath("/logistica/controle-pecas");
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

      // Regra: ao chegar em EMBALANDO, notifica a vendedora para anexar a NF.
      // Era EMBALADO; com ele fora do fluxo, o aviso passa para o passo
      // anterior. A janela para anexar a nota fica MAIOR, e o bloqueio de
      // "Processando sem NF" continua valendo — nada avanca sem nota.
      if (target === "EMBALANDO") {
        await tx.notification.create({
          data: {
            userId: order.sellerId,
            orderId: order.id,
            message: `Pedido ${order.orderNumber} embalado. Anexe a Nota Fiscal.`,
          },
        });
      }

      // Regra: ao entrar em PENDENTE (fluxo logístico), notifica a vendedora
      // responsável sobre a pendência registrada.
      if (target === "PENDENTE") {
        await tx.notification.create({
          data: {
            userId: order.sellerId,
            orderId: order.id,
            message: `Pendência na logística do pedido ${order.orderNumber}: ${args.pendencyNote!.trim()}`,
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

      // Controle de Peças: a entrega registrada libera a peça para "Em Uso".
      if (target === "ENTREGUE") {
        await ativarPecaAoEntregar(tx, order.id, session.userId);
      }
    });

    revalidatePath("/logistica");
    revalidatePath("/fluxo");
    revalidatePath("/motorista");
    // Relatorio de Pendencias e Controle de Pecas leem o historico deste pedido.
    revalidatePath("/logistica/pendencias");
    if (target === "ENTREGUE") revalidatePath("/logistica/controle-pecas");
    emitOrderUpdated({ orderId: args.orderId, status: target });
    // Entrou em "Pronto" pela seta "Avancar": avisa o motorista. Antes so o
    // pop-up "Deixar em aberto" avisava, e este caminho — o gesto mais comum da
    // Logistica — passava batido.
    if (target === "ENVIADO") {
      const entrega = await prisma.delivery.findUnique({
        where: { orderId: order.id },
        select: { driverId: true },
      });
      notifyOrderReady({
        orderId: order.id,
        orderNumber: order.orderNumber,
        driverId: entrega?.driverId ?? null,
        hasTracking: Boolean(order.trackingCode),
      });
    }
    // Web Push da pendência para a vendedora (após confirmar a transição).
    if (target === "PENDENTE") {
      void sendPushToUser(order.sellerId, {
        title: "Pendência na logística",
        body: `Pedido ${order.orderNumber}: ${args.pendencyNote!.trim()}`,
        url: "/vendas",
        tag: `order-${order.id}`,
      }).catch((err) => console.error("[push] envio falhou:", err));
    }
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
 * fica fora do Kanban de Motoristas (o quadro deles exclui pedido com rastreio).
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
      // PROCESSADO segue aceito como origem por causa de pedidos legados que
      // ficaram parados nele antes da reestruturacao do fluxo.
      if (order.status !== "PROCESSANDO" && order.status !== "PROCESSADO") {
        throw new Error("O pedido precisa estar em Processando para envio externo.");
      }

      // Envio externo (Correios/Transportadora): sem motorista proprio. O pedido
      // vai para ENVIADO ("Pronto") com o rastreio gravado — antes parava em
      // PROCESSADO, que saiu do fluxo. Nao aparece no Kanban de Motoristas: o
      // quadro deles exclui pedido com rastreio. A Delivery pode nao existir
      // ainda (ex.: Troca, que pula a aprovacao do Financeiro) — usamos upsert.
      // Fica sem motorista (driverId null); o despacho e feito pela transportadora.
      await tx.delivery.upsert({
        where: { orderId: order.id },
        update: { status: "AGUARDANDO", driverId: null, assignedAt: null },
        create: { orderId: order.id, status: "AGUARDANDO" },
      });
      await tx.order.update({
        where: { id: order.id },
        data: { status: "ENVIADO", trackingCode: tracking },
      });
      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          status: "ENVIADO",
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
 * Pop-up obrigatorio no PROCESSADO: atribui um motorista especifico a entrega.
 * Move o pedido para ENVIADO (status visivel no Kanban do Motorista) e a
 * entrega para ATRIBUIDA com o driverId. Como a entrega tem dono, o card
 * aparece SO para o motorista atribuido, nunca na coluna "Aguardando
 * Entregador".
 */
export async function assignDriverToOrder(args: {
  orderId: string;
  driverId: string;
  trackingCode?: string | null;
}): Promise<ActionResult<void>> {
  try {
    const session = await requireRoleAction(["LOGISTICA", "GESTAO"]);

    const tracking = args.trackingCode?.trim() || null;

    // Retornamos os dados do pedido da transação para o push ao motorista
    // (evita mutar variável externa dentro do callback).
    const pushInfo = await prisma.$transaction<
      { orderNumber: string; customerName?: string } | null
    >(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: args.orderId },
        include: { delivery: true, customer: true },
      });
      if (!order) throw new Error("Pedido nao encontrado.");

      // A Delivery pode nao existir ainda (ex.: Troca, que pula a aprovacao do
      // Financeiro onde a entrega e criada). Cria/atualiza via upsert.
      await tx.delivery.upsert({
        where: { orderId: order.id },
        update: { status: "ATRIBUIDA", driverId: args.driverId, assignedAt: new Date() },
        create: { orderId: order.id, status: "ATRIBUIDA", driverId: args.driverId, assignedAt: new Date() },
      });
      // O pedido AVANCA para ENVIADO: e o status que o Kanban do Motorista
      // enxerga (MOTORISTA_COLUMNS). Como a entrega tem driverId, o card aparece
      // apenas para o motorista atribuido — nao na coluna "Aguardando
      // Entregador" (que exige driverId null). Sem isso, o pedido ficaria preso
      // em PROCESSADO e invisivel ao motorista.
      await tx.order.update({
        where: { id: order.id },
        data: {
          status: "ENVIADO",
          // So sobrescreve o rastreio se um novo codigo foi informado.
          ...(tracking ? { trackingCode: tracking } : {}),
        },
      });
      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          status: "ENVIADO",
          changedBy: session.userId,
          note: tracking ? `Motorista atribuido · Rastreio: ${tracking}` : "Motorista atribuido",
        },
      });

      // Com rastreio, o pedido segue por transportadora e nao aparece no Kanban
      // de Motoristas — nesse caso nao faz sentido notificar o motorista.
      return tracking
        ? null
        : { orderNumber: order.orderNumber, customerName: order.customer?.name };
    });

    revalidatePath("/logistica");
    revalidatePath("/dashboard");
    revalidatePath("/motorista");
    emitOrderUpdated({ orderId: args.orderId });
    // Entrou em "Pronto" com dono definido: push + WhatsApp so para ele.
    // pushInfo vem null quando ha rastreio (segue por transportadora).
    if (pushInfo) {
      notifyOrderReady({
        orderId: args.orderId,
        orderNumber: pushInfo.orderNumber,
        customerName: pushInfo.customerName,
        driverId: args.driverId,
      });
    }
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
 * "Pronto" do Kanban de Motoristas, visivel a todos ate alguem iniciar a rota.
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
      // PROCESSADO segue aceito por causa de pedidos legados parados nele.
      if (order.status !== "PROCESSANDO" && order.status !== "PROCESSADO") {
        throw new Error("O pedido precisa estar em Processando para abrir aos motoristas.");
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
    // Entrou em "Pronto" SEM dono: e uma corrida, avisa todos os motoristas.
    // pushInfo vem null quando ha rastreio (segue por transportadora).
    if (pushInfo) {
      notifyOrderReady({
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
 * NAO E MAIS USADA PELA INTERFACE. O card do motorista assume o pedido dentro
 * do proprio "Iniciar" (ver startRoute), num passo so. Mantida porque continua
 * sendo uma operacao legitima — reservar a entrega sem sair na hora — caso o
 * produto queira esse botao de volta.
 *
 * "Atribuir": um MOTORISTA pega para si um pedido que está em aberto
 * (em "Pronto", sem dono). Vincula a entrega ao usuário autenticado e
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
 * O MOTORISTA cancela a própria atribuição: o pedido volta para "Pronto" sem
 * dono, disponível para qualquer um pegar novamente. GESTAO também pode
 * cancelar (supervisão).
 *
 * Só é permitido enquanto a entrega ainda não foi concluída: pedidos em
 * ENVIADO ou EM_ROTA. Após ENTREGUE/CONCLUIDO não há o que cancelar.
 *
 * O cancelamento NOTIFICA os motoristas como se o pedido tivesse acabado de
 * entrar em "Pronto" — porque, para quem entrega, foi isso que aconteceu: um
 * pacote voltou a ficar disponível. Sem o aviso, o pedido ficaria parado à
 * espera de alguém que por acaso olhasse o quadro, que é o mesmo tipo de
 * silêncio que o notifyOrderReady existe para eliminar.
 */
export async function unassignMyOrder(args: {
  orderId: string;
}): Promise<ActionResult<void>> {
  try {
    const session = await requireRoleAction(["MOTORISTA", "GESTAO"]);

    // Dados devolvidos da transação para o aviso pós-commit (só avisamos
    // depois que a devolução do pedido está de fato gravada).
    const aviso = await prisma.$transaction<{
      orderNumber: string;
      hasTracking: boolean;
    }>(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: args.orderId },
        include: { delivery: true },
      });
      if (!order) throw new Error("Pedido nao encontrado.");
      if (!order.delivery) throw new Error("Entrega nao encontrada para o pedido.");
      if (order.status !== "ENVIADO" && order.status !== "EM_ROTA") {
        throw new Error("Só é possível cancelar antes de concluir a entrega.");
      }
      // Motorista só cancela a PRÓPRIA atribuição; GESTAO pode qualquer uma.
      if (session.role === "MOTORISTA" && order.delivery.driverId !== session.userId) {
        throw new Error("Este pedido está atribuído a outro motorista.");
      }

      // Volta a entrega para o estado "aguardando" e sem dono.
      await tx.delivery.update({
        where: { id: order.delivery.id },
        data: { status: "AGUARDANDO", driverId: null, assignedAt: null },
      });
      // Retorna o pedido para ENVIADO ("Pronto", sem dono). Se
      // estava EM_ROTA, também volta — a rota é reiniciada por quem pegar.
      if (order.status !== "ENVIADO") {
        await tx.order.update({
          where: { id: order.id },
          data: { status: "ENVIADO" },
        });
      }
      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          status: "ENVIADO",
          changedBy: session.userId,
          note: "Atribuição cancelada pelo motorista (voltou para Pronto, sem dono)",
        },
      });

      return {
        orderNumber: order.orderNumber,
        hasTracking: Boolean(order.trackingCode),
      };
    });

    revalidatePath("/motorista");
    revalidatePath("/logistica");
    revalidatePath("/dashboard");
    emitOrderUpdated({ orderId: args.orderId });
    // O pedido está de novo em "Pronto" e sem dono: avisa TODOS os motoristas,
    // exatamente como numa entrada nova no status. driverId omitido de
    // propósito — acabou de deixar de ter um.
    notifyOrderReady({
      orderId: args.orderId,
      orderNumber: aviso.orderNumber,
      hasTracking: aviso.hasTracking,
    });
    return actionOk(undefined);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro ao cancelar atribuição.";
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
    revalidatePath("/logistica/pendencias");
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
      select: {
        id: true, status: true, orderNumber: true, sellerId: true,
        delivery: { select: { id: true, driverId: true } },
      },
    });
    if (!order) return actionError("Pedido nao encontrado.");

    // Sem no-op: se ja esta no status alvo, nada a fazer.
    if (order.status === args.to) return actionOk({ status: order.status });

    // Regra 1 (Gestão): retrocesso para PROCESSANDO desatribui o motorista e
    // restaura a entrega ao estado padrão. Vale quando o pedido saía de um
    // status onde o motorista já estava vinculado (PROCESSADO/ENVIADO/EM_ROTA).
    const STATUS_COM_MOTORISTA: OrderStatus[] = ["PROCESSADO", "ENVIADO", "EM_ROTA"];
    const desatribuirMotorista =
      args.to === "PROCESSANDO" &&
      STATUS_COM_MOTORISTA.includes(order.status) &&
      !!order.delivery;

    await prisma.$transaction(async (tx) => {
      await tx.order.update({ where: { id: order.id }, data: { status: args.to } });

      // Restaura a entrega: sem motorista, sem timestamps de rota, status
      // AGUARDANDO (padrão). O card volta a "Processando" limpo, pronto para a
      // Logística reatribuir depois.
      if (desatribuirMotorista && order.delivery) {
        await tx.delivery.update({
          where: { id: order.delivery.id },
          data: {
            status: "AGUARDANDO",
            driverId: null,
            assignedAt: null,
            startedAt: null,
          },
        });
      }

      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          status: args.to,
          changedBy: session.userId,
          note: desatribuirMotorista
            ? "Retrocesso para Processando pela Gestão · motorista desatribuído."
            : "Status alterado pela Gestão.",
        },
      });
      // Controle de Peças: arrastar para ENTREGUE/CONCLUIDO também conta como
      // registro de entrega e libera a peça para "Em Uso".
      if (args.to === "ENTREGUE" || args.to === "CONCLUIDO") {
        await ativarPecaAoEntregar(tx, order.id, session.userId);
      }

      // Ao arrastar para PENDENTE, notifica a vendedora (in-app).
      if (args.to === "PENDENTE") {
        await tx.notification.create({
          data: {
            userId: order.sellerId,
            orderId: order.id,
            message: `Pendência na logística do pedido ${order.orderNumber}.`,
          },
        });
      }
    });

    revalidatePath("/logistica");
    revalidatePath("/fluxo");
    revalidatePath("/dashboard");
    revalidatePath("/motorista");
    revalidatePath("/logistica/pendencias");
    if (args.to === "ENTREGUE" || args.to === "CONCLUIDO") {
      revalidatePath("/logistica/controle-pecas");
    }
    emitOrderUpdated({ orderId: args.orderId });
    // Entrou em "Pronto" arrastando o card: mesmo aviso dos demais caminhos.
    // O early-return la em cima garante que so passa aqui quem MUDOU de status,
    // entao nao ha risco de reavisar um pedido que ja estava em Pronto.
    if (args.to === "ENVIADO") {
      const atual = await prisma.order.findUnique({
        where: { id: order.id },
        select: { trackingCode: true, delivery: { select: { driverId: true } } },
      });
      notifyOrderReady({
        orderId: order.id,
        orderNumber: order.orderNumber,
        driverId: atual?.delivery?.driverId ?? null,
        hasTracking: Boolean(atual?.trackingCode),
      });
    }
    if (args.to === "PENDENTE") {
      void sendPushToUser(order.sellerId, {
        title: "Pendência na logística",
        body: `Pedido ${order.orderNumber}.`,
        url: "/vendas",
        tag: `order-${order.id}`,
      }).catch((err) => console.error("[push] envio falhou:", err));
    }
    return actionOk({ status: args.to });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro ao alterar status.";
    return actionError(msg);
  }
}
