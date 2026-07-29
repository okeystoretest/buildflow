import { prisma } from "@/lib/prisma";
import type { Role } from "@prisma/client";

/**
 * Barramento de eventos do tempo real — agora PERSISTIDO no PostgreSQL.
 *
 * Por que no banco (e nao em memoria): no output `standalone` do Next dentro do
 * container, a Server Action que publica o evento e o route handler do poll que
 * o le NAO compartilham o mesmo estado de modulo. Um buffer em memoria nunca
 * "casa" (o poll sempre via events:[]). O Postgres e o canal compartilhado —
 * funciona em qualquer container e com qualquer numero de replicas.
 *
 * Interface preservada: publish(...) e getEventsSince(...). A diferenca e que
 * agora sao assincronas. publish continua "fire-and-forget" (nao bloqueia a
 * action nem quebra o pedido se a gravacao do evento falhar).
 */

export type RealtimeEventType = "order.created" | "order.updated";

export interface RealtimeEvent {
  type: RealtimeEventType;
  orderId: string;
  orderNumber?: string;
  customerName?: string;
  status?: string;
  originStoreId?: string | null;
  notifyRoles?: Role[];
  /** Epoch ms (derivado de createdAt). */
  ts: number;
}

/** Janela util de eventos e frequencia de limpeza. */
const EVENT_TTL_MS = 60_000; // cliente so olha os ultimos segundos; 60s sobra
const CLEANUP_EVERY_MS = 30_000; // roda no maximo a cada 30s

let lastCleanup = 0;

/**
 * Remove eventos antigos (best-effort). Chamado de forma oportunista dentro do
 * poll; nao bloqueia a resposta se falhar.
 */
async function maybeCleanup(now: number): Promise<void> {
  if (now - lastCleanup < CLEANUP_EVERY_MS) return;
  lastCleanup = now;
  try {
    await prisma.realtimeEvent.deleteMany({
      where: { createdAt: { lt: new Date(now - EVENT_TTL_MS) } },
    });
  } catch {
    // Limpeza e descartavel; ignora falhas.
  }
}

/**
 * Publica um evento. FIRE-AND-FORGET: inicia a gravacao e retorna imediatamente.
 * Uma falha ao gravar o evento de tempo real NAO pode derrubar a operacao do
 * pedido — por isso o erro e apenas logado.
 */
export function publish(event: Omit<RealtimeEvent, "ts">): void {
  void prisma.realtimeEvent
    .create({
      data: {
        type: event.type,
        orderId: event.orderId,
        orderNumber: event.orderNumber ?? null,
        customerName: event.customerName ?? null,
        status: event.status ?? null,
        originStoreId: event.originStoreId ?? null,
        notifyRoles: (event.notifyRoles ?? []) as string[],
      },
    })
    .catch((err) => {
      console.error("[realtime] falha ao publicar evento:", err);
    });
}

/**
 * Retorna os eventos criados APOS o timestamp `since` (epoch ms, exclusivo),
 * ordenados por data. Usado pelo endpoint de polling. Com `since` = 0/indefinido
 * (bootstrap), devolve os eventos recentes da janela (o cliente descarta e so
 * guarda o `now`).
 */
export async function getEventsSince(since: number): Promise<RealtimeEvent[]> {
  const now = Date.now();
  // Limite inferior: nunca busca alem da janela util (evita varrer a tabela).
  const floor = now - EVENT_TTL_MS;
  const sinceMs = since && since > floor ? since : floor;

  const rows = await prisma.realtimeEvent.findMany({
    where: { createdAt: { gt: new Date(sinceMs) } },
    orderBy: { createdAt: "asc" },
    take: 200,
  });

  // Limpeza oportunista (nao aguarda para nao atrasar a resposta).
  void maybeCleanup(now);

  return rows.map((r) => ({
    type: r.type as RealtimeEventType,
    orderId: r.orderId,
    orderNumber: r.orderNumber ?? undefined,
    customerName: r.customerName ?? undefined,
    status: r.status ?? undefined,
    originStoreId: r.originStoreId,
    notifyRoles: (r.notifyRoles ?? []) as Role[],
    ts: r.createdAt.getTime(),
  }));
}
