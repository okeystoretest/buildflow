"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRoleAction, getActorContext } from "@/lib/auth";
import { canInteractWithOrder, INTERACTION_DENIED_MSG } from "@/lib/permissions";
import { emitOrderUpdated } from "@/lib/realtime/emit";
import {
  normalizeCampaignItem,
  aggregateCampaignFields,
  campaignItemAuditNote,
} from "@/lib/campaign-items";
import { actionOk, actionError, type ActionResult } from "@/types/action";

/**
 * CRUD DOS ITENS DE CAMPANHA DE UM PEDIDO (Histórico de Vendas).
 * ---------------------------------------------------------------------------
 * Até aqui as peças de campanha só se mexiam pela Edição de Pedido, e o
 * `updateOrder` SUBSTITUI a lista inteira — o que exige reenviar o pedido todo
 * e passa por travas que não têm a ver com campanha (comprovante obrigatório,
 * valor > 0, Troca sem valor). No histórico a operação é outra: corrigir UMA
 * peça de um pedido já concluído. Por isso estas três actions granulares.
 *
 * Quem pode: VENDAS, GESTAO e FINANCEIRO — a mesma lista da tela do histórico —,
 * filtrado por `canInteractWithOrder` (criador do pedido, dono da Loja de
 * Origem, ou perfil privilegiado). Decisão de produto: todos os perfis editam,
 * E TODA operação grava uma linha no histórico do pedido com autor, item e
 * valor. É o que torna a liberação aceitável: estes números são a pontuação do
 * Ranking > Performance na Campanha, e quem mexeu fica visível.
 *
 * Os agregados legados do pedido (`campaignId`, `itemCount`) são recalculados a
 * partir da lista resultante em toda operação — se ficassem para trás, o Rank
 * passaria a discordar da própria tela que o alimenta.
 */

// Pedido cancelado/estornado não RECEBE nem tem item EDITADO: a conta já foi
// acertada por fora e lançar campanha nele viraria pontuação de venda desfeita.
// Excluir continua liberado — tirar um item lançado por engano num pedido
// cancelado só corrige a pontuação para baixo, e travar isso seria pior.
const STATUS_SEM_LANCAMENTO = ["CANCELADO", "ESTORNO", "ESTORNO_PARCIAL"] as const;

/** Item devolvido para a tela depois de cada operação. */
export interface CampaignItemRow {
  id: string;
  campaignId: string;
  campaignName: string;
  reference: string;
  quantity: number;
  /** Em reais. A tela formata. */
  value: number;
}

export interface CampaignItemsResult {
  items: CampaignItemRow[];
  /** Agregados legados do pedido, já gravados. */
  itemCount: number;
  campaignId: string | null;
}

type OrderForCampaign = {
  id: string;
  status: string;
  sellerId: string;
  originStoreId: string | null;
};

/**
 * Carrega o pedido e confere a permissão de interação. Devolve a mensagem de
 * erro pronta quando barra — as três actions compartilham esta porta.
 */
async function loadOrderForCampaign(
  orderId: string,
): Promise<{ ok: true; order: OrderForCampaign } | { ok: false; error: string }> {
  if (!orderId) return { ok: false, error: "Pedido não informado." };
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, status: true, sellerId: true, originStoreId: true },
  });
  if (!order) return { ok: false, error: "Pedido não encontrado." };

  const actor = await getActorContext();
  if (
    !actor ||
    !canInteractWithOrder(actor, {
      sellerId: order.sellerId,
      originStoreId: order.originStoreId,
    })
  ) {
    return { ok: false, error: INTERACTION_DENIED_MSG };
  }
  return { ok: true, order };
}

/** A campanha existe? (E está ativa, quando a operação a está escolhendo.) */
async function campaignName(
  campaignId: string,
  exigeAtiva: boolean,
): Promise<{ ok: true; name: string } | { ok: false; error: string }> {
  const camp = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { name: true, active: true },
  });
  if (!camp) return { ok: false, error: "Campanha não encontrada." };
  if (exigeAtiva && !camp.active) return { ok: false, error: "Campanha inativa." };
  return { ok: true, name: camp.name };
}

/**
 * Relê a lista de itens na ordem canônica (createdAt asc), regrava os agregados
 * legados do pedido e registra a linha de auditoria. Roda DENTRO da transação
 * da operação, depois da escrita do item.
 */
async function reagregarEAuditar(
  tx: Prisma.TransactionClient,
  order: OrderForCampaign,
  userId: string,
  note: string,
): Promise<CampaignItemsResult> {
  // TRAVA A LINHA DO PEDIDO antes de ler a lista. Duas pessoas mexendo nos itens
  // do mesmo pedido em paralelo (a vendedora e o Financeiro, ou duas abas)
  // calculariam o agregado cada uma sobre a lista que enxergou, e o ultimo write
  // venceria com `itemCount` errado — o Rank passaria a discordar da tela. Um
  // UPDATE na linha segura o lock ate o fim da transacao, entao a segunda
  // transacao espera e depois LE a lista ja com o item da primeira.
  await tx.order.update({ where: { id: order.id }, data: { updatedAt: new Date() } });

  const itens = await tx.campaignItem.findMany({
    where: { orderId: order.id },
    orderBy: { createdAt: "asc" },
    include: { campaign: { select: { name: true } } },
  });

  const agregado = aggregateCampaignFields(
    itens.map((it) => ({ campaignId: it.campaignId, quantity: it.quantity })),
  );

  await tx.order.update({
    where: { id: order.id },
    data: { campaignId: agregado.campaignId, itemCount: agregado.itemCount },
  });

  await tx.orderStatusHistory.create({
    data: {
      orderId: order.id,
      // Mexer em campanha não move o pedido no fluxo: a linha só existe para
      // datar e assinar a alteração.
      status: order.status as Prisma.OrderStatusHistoryCreateInput["status"],
      changedBy: userId,
      note,
    },
  });

  return {
    items: itens.map((it) => ({
      id: it.id,
      campaignId: it.campaignId,
      campaignName: it.campaign?.name ?? "—",
      reference: it.reference,
      quantity: it.quantity,
      value: Number(it.value),
    })),
    itemCount: agregado.itemCount,
    campaignId: agregado.campaignId,
  };
}

/** Telas que mostram valor/volume de campanha e precisam reler depois da escrita. */
function revalidarTelasDeCampanha() {
  revalidatePath("/vendas");
  revalidatePath("/vendas/historico");
  revalidatePath("/vendas/relatorio-campanha");
  revalidatePath("/dashboard");
  revalidatePath("/fluxo");
}

/** Adiciona uma peça de campanha ao pedido. */
export async function addCampaignItem(args: {
  orderId: string;
  campaignId: string;
  reference: string;
  quantity: number;
  value: number;
}): Promise<ActionResult<CampaignItemsResult>> {
  try {
    const session = await requireRoleAction(["VENDAS", "GESTAO", "FINANCEIRO"]);

    const carga = await loadOrderForCampaign(args.orderId);
    if (!carga.ok) return actionError(carga.error);
    const { order } = carga;

    if ((STATUS_SEM_LANCAMENTO as readonly string[]).includes(order.status)) {
      return actionError("Pedido cancelado ou estornado não recebe item de campanha.");
    }

    const valid = normalizeCampaignItem(args);
    if (!valid.ok) return actionError(valid.error);
    const item = valid.item;

    const camp = await campaignName(item.campaignId, true);
    if (!camp.ok) return actionError(camp.error);

    const result = await prisma.$transaction(async (tx) => {
      await tx.campaignItem.create({
        data: {
          orderId: order.id,
          campaignId: item.campaignId,
          reference: item.reference,
          quantity: item.quantity,
          value: new Prisma.Decimal(item.value),
        },
      });
      return reagregarEAuditar(
        tx,
        order,
        session.userId,
        campaignItemAuditNote("add", { ...item, campaignName: camp.name }),
      );
    });

    revalidarTelasDeCampanha();
    emitOrderUpdated({ orderId: order.id, status: order.status });
    return actionOk(result);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao adicionar o item de campanha.");
  }
}

/** Edita uma peça de campanha já lançada (campanha, referência, qtd, valor). */
export async function updateCampaignItem(args: {
  orderId: string;
  itemId: string;
  campaignId: string;
  reference: string;
  quantity: number;
  value: number;
}): Promise<ActionResult<CampaignItemsResult>> {
  try {
    const session = await requireRoleAction(["VENDAS", "GESTAO", "FINANCEIRO"]);

    const carga = await loadOrderForCampaign(args.orderId);
    if (!carga.ok) return actionError(carga.error);
    const { order } = carga;

    if ((STATUS_SEM_LANCAMENTO as readonly string[]).includes(order.status)) {
      return actionError("Pedido cancelado ou estornado não tem item de campanha editado.");
    }

    const valid = normalizeCampaignItem(args);
    if (!valid.ok) return actionError(valid.error);
    const item = valid.item;

    // O item precisa ser DESTE pedido. Sem este par (id, orderId) o `itemId`
    // vindo da tela poderia apontar para a campanha de qualquer outro pedido.
    const atual = await prisma.campaignItem.findFirst({
      where: { id: args.itemId, orderId: order.id },
      include: { campaign: { select: { name: true } } },
    });
    if (!atual) return actionError("Item de campanha não encontrado neste pedido.");

    // Campanha ATIVA só é exigida quando a operação está trocando de campanha.
    // Item antigo cuja campanha foi encerrada continua editável (corrigir a
    // quantidade de uma peça de campanha passada é justamente o caso de uso).
    const trocouCampanha = atual.campaignId !== item.campaignId;
    const camp = await campaignName(item.campaignId, trocouCampanha);
    if (!camp.ok) return actionError(camp.error);

    const antes = {
      campaignName: atual.campaign?.name ?? "—",
      reference: atual.reference,
      quantity: atual.quantity,
      value: Number(atual.value),
    };

    const result = await prisma.$transaction(async (tx) => {
      const { count } = await tx.campaignItem.updateMany({
        where: { id: atual.id, orderId: order.id },
        data: {
          campaignId: item.campaignId,
          reference: item.reference,
          quantity: item.quantity,
          value: new Prisma.Decimal(item.value),
        },
      });
      if (count !== 1) {
        throw new Error("O item foi alterado por outra pessoa. Recarregue a tela e edite de novo.");
      }
      return reagregarEAuditar(
        tx,
        order,
        session.userId,
        campaignItemAuditNote("update", { ...item, campaignName: camp.name }, antes),
      );
    });

    revalidarTelasDeCampanha();
    emitOrderUpdated({ orderId: order.id, status: order.status });
    return actionOk(result);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao editar o item de campanha.");
  }
}

/** Exclui uma peça de campanha do pedido. */
export async function deleteCampaignItem(args: {
  orderId: string;
  itemId: string;
}): Promise<ActionResult<CampaignItemsResult>> {
  try {
    const session = await requireRoleAction(["VENDAS", "GESTAO", "FINANCEIRO"]);

    const carga = await loadOrderForCampaign(args.orderId);
    if (!carga.ok) return actionError(carga.error);
    const { order } = carga;

    const atual = await prisma.campaignItem.findFirst({
      where: { id: args.itemId, orderId: order.id },
      include: { campaign: { select: { name: true } } },
    });
    if (!atual) return actionError("Item de campanha não encontrado neste pedido.");

    const removido = {
      campaignName: atual.campaign?.name ?? "—",
      reference: atual.reference,
      quantity: atual.quantity,
      value: Number(atual.value),
    };

    const result = await prisma.$transaction(async (tx) => {
      const { count } = await tx.campaignItem.deleteMany({
        where: { id: atual.id, orderId: order.id },
      });
      if (count !== 1) {
        throw new Error("O item já havia sido excluído. Recarregue a tela.");
      }
      return reagregarEAuditar(
        tx,
        order,
        session.userId,
        campaignItemAuditNote("remove", removido),
      );
    });

    revalidarTelasDeCampanha();
    emitOrderUpdated({ orderId: order.id, status: order.status });
    return actionOk(result);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao excluir o item de campanha.");
  }
}
