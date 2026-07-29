import { publish, type RealtimeEvent } from "@/lib/realtime/bus";

/**
 * Fachada de emissao para as Server Actions. Concentra a regra de "quem recebe
 * alerta ativo" num lugar so, para as actions apenas dispararem o fato.
 */

/**
 * Pedido criado. `notifyFinance` = true dispara a Web Notification para o
 * setor FINANCEIRO. Regra de negocio (decidida no produto): so notificamos o
 * Financeiro quando o pedido entra em EM_ANALISE (aprovacao financeira). Trocas,
 * que pulam o Financeiro, entram com notifyFinance=false.
 */
export function emitOrderCreated(args: {
  orderId: string;
  orderNumber?: string;
  customerName?: string;
  status?: string;
  originStoreId?: string | null;
  notifyFinance: boolean;
}): void {
  const evt: Omit<RealtimeEvent, "ts"> = {
    type: "order.created",
    orderId: args.orderId,
    orderNumber: args.orderNumber,
    customerName: args.customerName,
    status: args.status,
    originStoreId: args.originStoreId ?? null,
    notifyRoles: args.notifyFinance ? ["FINANCEIRO"] : [],
  };
  publish(evt);
}

/**
 * Pedido atualizado (mudanca de status, avanco, movimentacao, resolucao de
 * pendencia, etc.). Nao dispara notificacao ativa — apenas reatividade do board
 * para todos que estao visualizando.
 */
export function emitOrderUpdated(args: {
  orderId: string;
  status?: string;
  originStoreId?: string | null;
}): void {
  publish({
    type: "order.updated",
    orderId: args.orderId,
    status: args.status,
    originStoreId: args.originStoreId ?? null,
    notifyRoles: [],
  });
}
