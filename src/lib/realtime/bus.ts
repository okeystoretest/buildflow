import { EventEmitter } from "events";
import type { Role } from "@prisma/client";

/**
 * Barramento de eventos em processo (in-process) para o tempo real do Build.Flow.
 *
 * Por que EventEmitter singleton e nao Redis/pubsub externo:
 * - O app roda em UMA VPS, atras do Nginx, com PM2. Enquanto o processo Node for
 *   unico (ou usarmos o endpoint SSE no mesmo processo que as Server Actions),
 *   um EventEmitter em memoria resolve sem infra adicional.
 * - Se um dia o PM2 rodar em modo CLUSTER (varias instancias), este barramento
 *   NAO cruza processos. Nesse cenario, trocar a implementacao por um adaptador
 *   (Redis pub/sub) mantendo a mesma interface `publish`/`subscribe`. Ver nota
 *   no README de deploy.
 *
 * Padrao singleton identico ao do Prisma (src/lib/prisma.ts): sobrevive ao
 * hot-reload do Next em desenvolvimento.
 */

export type RealtimeEventType = "order.created" | "order.updated";

export interface RealtimeEvent {
  type: RealtimeEventType;
  /** ID do pedido afetado. */
  orderId: string;
  /** Numero do pedido (para exibir na notificacao sem novo fetch). */
  orderNumber?: string;
  /** Nome do cliente (para o corpo da notificacao). */
  customerName?: string;
  /** Status resultante da mutacao. */
  status?: string;
  /** Loja de Origem do pedido (para futura segmentacao por loja). */
  originStoreId?: string | null;
  /**
   * Papeis que DEVEM receber uma notificacao ATIVA (Web Notification) deste
   * evento. A reatividade do board (router.refresh) vale para todos; este campo
   * so controla o alerta nativo. Ex.: order.created de pedido nao-Troca ->
   * ["FINANCEIRO"].
   */
  notifyRoles?: Role[];
  /** Epoch ms da emissao. */
  ts: number;
}

const CHANNEL = "bf:realtime";

const globalForBus = globalThis as unknown as {
  bfBus: EventEmitter | undefined;
};

function makeBus(): EventEmitter {
  const bus = new EventEmitter();
  // Muitas abas/conexoes SSE simultaneas => muitos listeners. Sem isto o Node
  // emite warning de "possible memory leak" ao passar de 10.
  bus.setMaxListeners(0);
  return bus;
}

const bus = globalForBus.bfBus ?? makeBus();
if (process.env.NODE_ENV !== "production") globalForBus.bfBus = bus;

/** Publica um evento no barramento (chamado pelas Server Actions). */
export function publish(event: Omit<RealtimeEvent, "ts">): void {
  const full: RealtimeEvent = { ...event, ts: Date.now() };
  bus.emit(CHANNEL, full);
}

/**
 * Assina o barramento. Retorna a funcao de cancelamento (usada no cleanup do
 * stream SSE quando o cliente desconecta).
 */
export function subscribe(handler: (event: RealtimeEvent) => void): () => void {
  bus.on(CHANNEL, handler);
  return () => {
    bus.off(CHANNEL, handler);
  };
}
