import { EventEmitter } from "events";
import type { Role } from "@prisma/client";

/**
 * Barramento de eventos em processo (in-process) para o tempo real do Build.Flow.
 *
 * Transporte para o CLIENT: POLLING. O provider consulta /api/events/poll a cada
 * poucos segundos perguntando "o que mudou desde o timestamp X". Escolhemos
 * polling (e nao SSE) porque o proxy do ambiente corta conexoes longas — uma
 * requisicao curta atravessa qualquer proxy sem configuracao especial.
 *
 * Para o poll conseguir responder "o que mudou desde X", o barramento mantem um
 * BUFFER curto dos eventos recentes em memoria (ring buffer por tempo/tamanho).
 *
 * Padrao singleton identico ao do Prisma: sobrevive ao hot-reload do Next em dev.
 *
 * Nota de escala: buffer e EventEmitter sao POR PROCESSO. Em PM2 fork (1
 * instancia) funciona. Em cluster, trocar por store compartilhado (Redis).
 */

export type RealtimeEventType = "order.created" | "order.updated";

export interface RealtimeEvent {
  type: RealtimeEventType;
  orderId: string;
  orderNumber?: string;
  customerName?: string;
  status?: string;
  originStoreId?: string | null;
  /** Papeis que devem receber alerta ATIVO (Web Notification) deste evento. */
  notifyRoles?: Role[];
  /** Epoch ms da emissao. */
  ts: number;
}

const CHANNEL = "bf:realtime";

/** Janela e tamanho maximo do buffer de eventos recentes. */
const BUFFER_MAX_AGE_MS = 60_000; // 60s cobre folgadamente um poll de 4s
const BUFFER_MAX_ITEMS = 300;

interface BusState {
  emitter: EventEmitter;
  /** Ring buffer dos eventos recentes, em ordem de emissao (ts crescente). */
  buffer: RealtimeEvent[];
}

const globalForBus = globalThis as unknown as {
  bfBusState: BusState | undefined;
};

function makeState(): BusState {
  const emitter = new EventEmitter();
  emitter.setMaxListeners(0);
  return { emitter, buffer: [] };
}

const state = globalForBus.bfBusState ?? makeState();
if (process.env.NODE_ENV !== "production") globalForBus.bfBusState = state;

/** Remove do buffer os eventos mais velhos que a janela ou que excedem o teto. */
function pruneBuffer(now: number): void {
  const cutoff = now - BUFFER_MAX_AGE_MS;
  // Descarta por idade (buffer esta ordenado por ts crescente).
  while (state.buffer.length > 0 && state.buffer[0].ts < cutoff) {
    state.buffer.shift();
  }
  // Descarta por tamanho.
  while (state.buffer.length > BUFFER_MAX_ITEMS) {
    state.buffer.shift();
  }
}

/** Publica um evento no barramento (chamado pelas Server Actions). */
export function publish(event: Omit<RealtimeEvent, "ts">): void {
  const now = Date.now();
  const full: RealtimeEvent = { ...event, ts: now };
  state.buffer.push(full);
  pruneBuffer(now);
  state.emitter.emit(CHANNEL, full);
}

/**
 * Retorna os eventos emitidos APOS o timestamp `since` (exclusivo), ordenados.
 * Usado pelo endpoint de polling. Se `since` for 0/indefinido, devolve o buffer
 * atual (o client normalmente descarta a 1a resposta e so guarda o `ts`).
 */
export function getEventsSince(since: number): RealtimeEvent[] {
  pruneBuffer(Date.now());
  if (!since) return [...state.buffer];
  return state.buffer.filter((e) => e.ts > since);
}

/**
 * Assina o barramento (mantido para compatibilidade; nao usado pelo polling).
 * Retorna a funcao de cancelamento.
 */
export function subscribe(handler: (event: RealtimeEvent) => void): () => void {
  state.emitter.on(CHANNEL, handler);
  return () => {
    state.emitter.off(CHANNEL, handler);
  };
}
