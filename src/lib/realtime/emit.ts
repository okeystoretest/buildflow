import { publish, type RealtimeEvent } from "@/lib/realtime/bus";
import { sendPushToRole, sendPushToUser } from "@/lib/push";
import { sendWhatsappToDrivers } from "@/lib/whatsapp";
import { prisma } from "@/lib/prisma";
import { isEntregaDeMotorista } from "@/lib/driver-delivery";

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
 * Pedido ENTROU em "Pronto" (status ENVIADO) — ponto unico de aviso ao
 * motorista.
 *
 * POR QUE ISTO EXISTE: o aviso morava num unico ramo da interface (o pop-up
 * "Deixar em aberto"). Um pedido chega em Pronto por varios caminhos — a seta
 * "Avancar", o arrastar do card, o envio externo, a atribuicao direta — e em
 * todos eles o motorista simplesmente nao era avisado. Amarrar o aviso ao FATO
 * (entrou em Pronto), e nao ao gesto que causou o fato, e o que fecha esse
 * buraco de uma vez.
 *
 * Quem recebe depende de como o pedido entrou:
 *   - forma de envio que nao e do motorista -> ninguem. So "1 - Excursao" e
 *     "3 - Entrega Local" sao entregues pela equipe (ver driver-delivery.ts);
 *   - com codigo de rastreio -> ninguem. Segue por transportadora, nao ha
 *     motorista envolvido;
 *   - com motorista atribuido -> so ele. Chamar a equipe inteira para uma
 *     entrega que ja tem dono vira ruido, e as pessoas param de ler;
 *   - sem motorista -> todos. E uma corrida: quem pegar primeiro leva.
 *
 * Fire-and-forget em todos os casos: aviso nunca derruba a acao de logistica.
 */
export function notifyOrderReady(args: {
  orderId: string;
  orderNumber?: string;
  customerName?: string;
  /** Motorista ja atribuido, quando houver. */
  driverId?: string | null;
  /** Pedido com rastreio segue por transportadora. */
  hasTracking?: boolean;
}): void {
  if (args.hasTracking) return;

  // FORMA DE ENVIO. Só "1 - Excursão" e "3 - Entrega Local" são entregues pela
  // equipe de motoristas; as demais saem por outro canal, e avisar sobre elas
  // convoca gente para um pacote que ninguém vai buscar. Mesmo motivo do
  // rastreio logo acima — este é o segundo caso de "não é entrega de
  // motorista".
  //
  // A consulta mora AQUI e não nos chamadores porque este é o ponto único de
  // aviso: são cinco caminhos até "Pronto", e espalhar a regra por todos eles é
  // exatamente o buraco que esta função foi criada para fechar. O custo é uma
  // leitura por entrada em Pronto, já dentro de um fluxo fire-and-forget.
  void (async () => {
    const pedido = await prisma.order.findUnique({
      where: { id: args.orderId },
      select: { shippingMethod: { select: { name: true } } },
    });
    // Pedido sumiu entre a ação e este aviso: não há o que notificar.
    if (!pedido) return;
    if (!isEntregaDeMotorista(pedido.shippingMethod?.name)) {
      console.log(
        `[aviso] pedido ${args.orderId} nao e entrega de motorista; ninguem avisado.`,
      );
      return;
    }
    avisarMotorista(args);
  })().catch((err) => console.error("[aviso] falha ao avaliar forma de envio:", err));
}

/**
 * Dispara push e WhatsApp de entrega disponivel. Separada de notifyOrderReady
 * para a REGRA (quem merece aviso) ficar visivel ali, e o ENVIO ficar aqui.
 */
function avisarMotorista(args: {
  orderId: string;
  orderNumber?: string;
  customerName?: string;
  driverId?: string | null;
}): void {
  const numero = args.orderNumber ? `#${args.orderNumber}` : "novo";
  const cliente = args.customerName ? ` — ${args.customerName}` : "";

  if (args.driverId) {
    void sendPushToUser(args.driverId, {
      title: "Nova entrega atribuída",
      body: `Pedido ${numero}${cliente} foi atribuído a você.`,
      url: "/motorista",
      tag: `delivery-${args.orderId}`,
    }).catch((err) => console.error("[push] envio p/ motorista falhou:", err));

    void sendWhatsappToDrivers({ orderId: args.orderId, driverId: args.driverId }).catch(
      (err) => console.error("[whatsapp] envio p/ motorista falhou:", err),
    );
    return;
  }

  void sendPushToRole("MOTORISTA", {
    title: "Entrega disponível para coleta",
    body: `Pedido ${numero}${cliente} aguardando entregador.`,
    url: "/motorista",
    tag: `delivery-${args.orderId}`,
  }).catch((err) => console.error("[push] envio p/ motorista falhou:", err));

  // A mensagem de WhatsApp nao leva numero de pedido nem nome de cliente —
  // alem de ser o texto definido pelo produto, evita mandar dado de cliente por
  // um canal nao-oficial.
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
