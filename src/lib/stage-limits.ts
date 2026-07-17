import { prisma } from "@/lib/prisma";
import type { OrderStatus } from "@prisma/client";
import type { StageLimitMap } from "@/lib/order-flow";

/**
 * Carrega os prazos por etapa configurados em Gestão > Etapas como um mapa
 * status -> minutos. Status sem configuração simplesmente não aparecem no mapa
 * (tratados como "sem alerta").
 */
export async function loadStageLimits(): Promise<StageLimitMap> {
  const rows = await prisma.stageTimeLimit.findMany();
  const map: StageLimitMap = {};
  for (const r of rows) {
    if (r.limitMinutes && r.limitMinutes > 0) map[r.status] = r.limitMinutes;
  }
  return map;
}

/**
 * Para uma lista de pedidos (id + status atual), descobre QUANDO cada um entrou
 * no status em que está agora — a entrada mais recente do histórico cujo status
 * bate com o status atual do pedido. Usado para o alerta temporal dos cards.
 *
 * Retorna um Map<orderId, ISO string> (só para os que têm histórico casado).
 */
export async function loadStatusSince(
  orders: { id: string; status: OrderStatus }[],
): Promise<Map<string, string>> {
  const ids = orders.map((o) => o.id);
  const since = new Map<string, string>();
  if (ids.length === 0) return since;

  const statusById = new Map(orders.map((o) => [o.id, o.status] as const));

  // Histórico dos pedidos em ordem decrescente: o primeiro registro de cada
  // pedido cujo status == status atual é o momento de entrada no status atual.
  const hist = await prisma.orderStatusHistory.findMany({
    where: { orderId: { in: ids } },
    orderBy: { createdAt: "desc" },
    select: { orderId: true, status: true, createdAt: true },
  });

  for (const h of hist) {
    if (since.has(h.orderId)) continue;
    if (statusById.get(h.orderId) === h.status) {
      since.set(h.orderId, h.createdAt.toISOString());
    }
  }
  return since;
}
