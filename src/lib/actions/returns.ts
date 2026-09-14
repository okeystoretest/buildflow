"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRoleAction } from "@/lib/auth";
import { isPrivileged } from "@/lib/permissions";
import { emitOrderUpdated } from "@/lib/realtime/emit";
import {
  computeReturn,
  returnHistoryNote,
  type ReturnItemInput,
} from "@/lib/order-returns";
import { actionOk, actionError, type ActionResult } from "@/types/action";

// Teto da observacao. E um complemento ("peca com defeito"), nao um laudo.
const MAX_NOTE = 500;

// Devolucao nao se registra em pedido que ja saiu do fluxo pela mao do
// Financeiro: estorno e cancelamento sao a propria conta acertada.
const STATUS_SEM_DEVOLUCAO = ["CANCELADO", "ESTORNO", "ESTORNO_PARCIAL"] as const;

/**
 * Registra uma DEVOLUCAO de pecas num pedido (Vendas > Devolucoes e Historico
 * de Vendas > Devolucoes).
 *
 * Quem pode: VENDAS nos proprios pedidos; GESTAO e FINANCEIRO em qualquer um —
 * a mesma regra da listagem de Vendas, reconferida aqui no servidor.
 *
 * O que muda: a soma dos valores sai de orderValue (mercadoria) e total e
 * recalculado; itens de campanha cuja referencia case tem quantidade e valor
 * abatidos, e itemCount acompanha. O STATUS NAO MUDA — o pedido continua onde
 * esta no fluxo. Tudo dentro de uma transacao, com a linha do historico.
 *
 * O calculo em si e puro (src/lib/order-returns.ts) e checado sem banco; esta
 * action so le o estado, aplica e grava.
 */
export async function registerOrderReturn(args: {
  orderId: string;
  items: ReturnItemInput[];
  note?: string;
}): Promise<ActionResult<{ returnId: string; orderValue: number; total: number }>> {
  try {
    const session = await requireRoleAction(["VENDAS", "GESTAO", "FINANCEIRO"]);

    if (!args.orderId) return actionError("Pedido não informado.");
    const note = (args.note ?? "").trim();
    if (note.length > MAX_NOTE) return actionError(`Observação muito longa (máx. ${MAX_NOTE}).`);

    const order = await prisma.order.findUnique({
      where: { id: args.orderId },
      select: {
        id: true,
        orderNumber: true,
        sellerId: true,
        status: true,
        orderValue: true,
        freight: true,
        campaignItems: { select: { id: true, reference: true, quantity: true, value: true } },
      },
    });
    if (!order) return actionError("Pedido não encontrado.");

    if (!isPrivileged(session.role) && order.sellerId !== session.userId) {
      return actionError("Você só pode registrar devoluções nos seus próprios pedidos.");
    }
    if ((STATUS_SEM_DEVOLUCAO as readonly string[]).includes(order.status)) {
      return actionError("Pedido cancelado ou estornado não aceita devolução.");
    }

    // A validacao dos itens e o teto do valor moram no calculo; a mensagem que
    // ele lanca ja e a do usuario.
    let calc;
    try {
      calc = computeReturn({
        orderValue: Number(order.orderValue),
        freight: Number(order.freight),
        campaignItems: order.campaignItems.map((c) => ({
          id: c.id,
          reference: c.reference,
          quantity: c.quantity,
          value: Number(c.value),
        })),
        items: args.items.map((it) => ({
          reference: String(it.reference ?? "").trim(),
          quantity: Number(it.quantity),
          value: Number(it.value),
        })),
      });
    } catch (err) {
      return actionError(err instanceof Error ? err.message : "Devolução inválida.");
    }

    const created = await prisma.$transaction(async (tx) => {
      const ret = await tx.orderReturn.create({
        data: {
          orderId: order.id,
          registeredById: session.userId,
          note: note || null,
          totalValue: new Prisma.Decimal(calc.returnedValue),
          items: {
            create: args.items.map((it) => ({
              reference: String(it.reference).trim(),
              quantity: Number(it.quantity),
              value: new Prisma.Decimal(Number(it.value)),
            })),
          },
        },
        select: { id: true },
      });

      await tx.order.update({
        where: { id: order.id },
        data: {
          orderValue: new Prisma.Decimal(calc.orderValue),
          total: new Prisma.Decimal(calc.total),
          ...(calc.campaignUpdates.length ? { itemCount: calc.itemCount } : {}),
        },
      });

      for (const up of calc.campaignUpdates) {
        await tx.campaignItem.update({
          where: { id: up.id },
          data: { quantity: up.quantity, value: new Prisma.Decimal(up.value) },
        });
      }

      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          status: order.status, // devolucao nao move o pedido
          changedBy: session.userId,
          note: returnHistoryNote(calc),
        },
      });

      return ret;
    });

    revalidatePath("/vendas");
    revalidatePath("/vendas/historico");
    revalidatePath("/dashboard");
    revalidatePath("/fluxo");
    revalidatePath("/logistica");
    revalidatePath("/financeiro");
    emitOrderUpdated({ orderId: order.id, status: order.status });

    return actionOk({ returnId: created.id, orderValue: calc.orderValue, total: calc.total });
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao registrar a devolução.");
  }
}

export interface OrderReturnView {
  id: string;
  createdAt: string; // ISO
  note: string | null;
  totalValue: string; // decimal em texto
  registeredByName: string | null;
  items: { id: string; reference: string; quantity: number; value: string }[];
}

/**
 * Devolucoes de um pedido, da mais recente para a mais antiga. Usada pelo
 * modal de detalhe e pelo Historico. Quem ve o pedido ve as devolucoes — a
 * restricao de escopo e a da tela que chama.
 */
export async function listOrderReturns(orderId: string): Promise<ActionResult<OrderReturnView[]>> {
  try {
    await requireRoleAction();
    const rows = await prisma.orderReturn.findMany({
      where: { orderId },
      orderBy: { createdAt: "desc" },
      include: { items: { orderBy: { reference: "asc" } } },
    });
    // O nome de quem registrou vem numa segunda consulta: nao ha FK (usuario
    // apagado nao leva a devolucao junto), entao o include nao serve.
    const ids = [...new Set(rows.map((r) => r.registeredById).filter((v): v is string => !!v))];
    const users = ids.length
      ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
      : [];
    const nome = new Map(users.map((u) => [u.id, u.name]));
    return actionOk(
      rows.map((r) => ({
        id: r.id,
        createdAt: r.createdAt.toISOString(),
        note: r.note,
        totalValue: r.totalValue.toString(),
        registeredByName: r.registeredById ? (nome.get(r.registeredById) ?? null) : null,
        items: r.items.map((it) => ({
          id: it.id,
          reference: it.reference,
          quantity: it.quantity,
          value: it.value.toString(),
        })),
      })),
    );
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao carregar devoluções.");
  }
}
