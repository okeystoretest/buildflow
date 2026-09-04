// Logica pura do modulo de WhatsApp: sem Prisma, sem Baileys, sem rede.
// Isolada aqui para poder ser verificada por script (scripts/checks/).

import { normalizePhone, isValidPhone } from "@/lib/phone";

/** Sufixo do JID de usuario individual no WhatsApp. */
const JID_SUFFIX = "@s.whatsapp.net";

/** Codigo do pais. O banco guarda o numero SEM ele (ver src/lib/phone.ts). */
const COUNTRY_CODE = "55";

/** Tempo sem heartbeat apos o qual a concessao e considerada abandonada. */
export const LEASE_TTL_MS = 90_000;

/** Intervalo de renovacao do heartbeat. Bem menor que o TTL, de proposito. */
export const LEASE_HEARTBEAT_MS = 30_000;

const BACKOFF_BASE_MS = 2_000;
const BACKOFF_MAX_MS = 60_000;
const BACKOFF_JITTER = 0.2;

const SPACING_MIN_MS = 1_000;
const SPACING_MAX_MS = 3_000;

/**
 * Monta o JID do WhatsApp a partir do telefone guardado no banco.
 *
 * O banco guarda digitos com DDD e SEM codigo de pais; a prefixacao do "55"
 * acontece aqui, na borda com o provedor. Retorna null para numero ausente ou
 * invalido — quem chama registra como IGNORADO e nao tenta enviar.
 */
export function toWhatsappJid(phone: string | null): string | null {
  if (!phone) return null;
  const digitos = normalizePhone(phone);
  if (!isValidPhone(digitos)) return null;
  return `${COUNTRY_CODE}${digitos}${JID_SUFFIX}`;
}

/**
 * Ultimos 4 digitos, para log. Nunca devolve o numero inteiro: e o que permite
 * conferir "foi para o numero certo?" sem expor o telefone no log.
 */
export function phoneSuffix(phone: string | null): string | null {
  if (!phone) return null;
  const digitos = normalizePhone(phone);
  if (digitos.length < 4) return null;
  return digitos.slice(-4);
}

/**
 * Espera antes da proxima tentativa de reconexao: 2s dobrando a cada tentativa
 * ate o teto de 60s, com jitter de ate 20% para cima. O jitter evita que
 * varios processos reconectem no mesmo instante.
 */
export function nextBackoffDelay(attempt: number, rand: () => number = Math.random): number {
  const base = Math.min(BACKOFF_BASE_MS * 2 ** Math.max(0, attempt), BACKOFF_MAX_MS);
  return Math.round(base * (1 + BACKOFF_JITTER * rand()));
}

/**
 * A concessao esta livre? Sem linha (null) conta como livre. O limite e
 * inclusivo: exatamente no TTL ja e considerada abandonada.
 */
export function isLeaseExpired(heartbeatAt: Date | null, now: Date): boolean {
  if (!heartbeatAt) return true;
  return now.getTime() - heartbeatAt.getTime() >= LEASE_TTL_MS;
}

/**
 * Intervalo entre um destinatario e o proximo (1s a 3s). Disparo em paralelo
 * para N numeros e o padrao que mais provoca bloqueio do numero.
 */
export function sendSpacingMs(rand: () => number = Math.random): number {
  return Math.round(SPACING_MIN_MS + (SPACING_MAX_MS - SPACING_MIN_MS) * rand());
}
