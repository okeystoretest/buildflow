import { publish, type RealtimeEvent } from "@/lib/realtime/bus";
import { sendPushToRole } from "@/lib/push";
import { sendWhatsappToDrivers } from "@/lib/whatsapp";

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

  // Web Push a nível de SO para o FINANCEIRO — chega mesmo com o navegador
  // minimizado/fechado (via Service Worker). Complementa a Web Notification em
  // foco disparada pelo board. Fire-and-forget: nunca bloqueia nem quebra a
  // criação do pedido.
  if (args.notifyFinance) {
    const numero = args.orderNumber ? `#${args.orderNumber}` : "novo";
    const cliente = args.customerName ? ` — ${args.customerName}` : "";
    void sendPushToRole("FINANCEIRO", {
      title: "Novo pedido para análise",
      body: `Pedido ${numero}${cliente} aguardando aprovação financeira.`,
      url: "/financeiro",
      tag: `order-${args.orderId}`,
    }).catch((err) => console.error("[push] envio falhou:", err));
  }
}

/**
 * Pedido disponibilizado para os MOTORISTAS ("Aguardando Entregador"). Dispara
 * Web Push a nível de SO para todos os motoristas cadastrados, informando que
 * há entrega disponível para coleta. Como o board do motorista já reage pelo
 * polling, aqui só emitimos o push (fire-and-forget: nunca bloqueia nem quebra
 * a ação de logística que abriu o pedido).
 *
 * Chamado apenas quando o pedido entra na coluna aberta de fato — isto é, sem
 * código de rastreio (pedidos com rastreio seguem por transportadora e não
 * aparecem no Kanban de Motoristas).
 */
export function emitOrderAvailableForDrivers(args: {
  orderId: string;
  orderNumber?: string;
  customerName?: string;
}): void {
  const numero = args.orderNumber ? `#${args.orderNumber}` : "novo";
  const cliente = args.customerName ? ` — ${args.customerName}` : "";
  void sendPushToRole("MOTORISTA", {
    title: "Entrega disponível para coleta",
    body: `Pedido ${numero}${cliente} aguardando entregador.`,
    url: "/motorista",
    tag: `delivery-${args.orderId}`,
  }).catch((err) => console.error("[push] envio p/ motorista falhou:", err));

  // Segundo canal, no mesmo gatilho e no mesmo carater fire-and-forget: o
  // WhatsApp nunca pode derrubar a acao de logistica que abriu o pedido.
  // A mensagem nao leva numero de pedido nem nome de cliente — alem de ser o
  // texto definido pelo produto, evita mandar dado de cliente por um canal
  // nao-oficial.
  void sendWhatsappToDrivers({ orderId: args.orderId }).catch((err) =>
    console.error("[whatsapp] envio p/ motoristas falhou:", err),
  );
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
