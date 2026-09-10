// Logica pura do modulo de WhatsApp: sem Prisma, sem Baileys, sem rede.
// Isolada aqui para poder ser verificada por script (scripts/checks/).

import { normalizePhone, isValidPhone } from "@/lib/phone";

/** Sufixo do JID de usuario individual no WhatsApp. */
const JID_SUFFIX = "@s.whatsapp.net";

/** Codigo do pais. O banco guarda o numero SEM ele (ver src/lib/phone.ts). */
const COUNTRY_CODE = "55";

/**
 * Tempo sem heartbeat apos o qual a concessao e considerada abandonada.
 *
 * Era 90s, o que fazia todo redeploy custar ate 90s de espera antes do
 * processo novo assumir — tempo em que o painel nao mostra QR nenhum. Com o
 * encerramento limpo (ver releaseLease) a devolucao normalmente e imediata, e
 * este TTL passa a valer so para o caso de morte abrupta do processo.
 *
 * O heartbeat renova 3x dentro do TTL, entao uma renovacao perdida por lentidao
 * momentanea nao faz a concessao ser tomada de outro processo vivo.
 */
export const LEASE_TTL_MS = 40_000;

/** Intervalo de renovacao do heartbeat. Bem menor que o TTL, de proposito. */
export const LEASE_HEARTBEAT_MS = 12_000;

/**
 * Intervalo entre tentativas de assumir a concessao quando ela esta ocupada.
 *
 * Precisa ser bem menor que o TTL: apos um redeploy, o processo novo espera a
 * concessao do container antigo expirar, e este intervalo define quanto tempo a
 * mais ele leva para perceber que ela vagou.
 */
export const LEASE_RETRY_MS = 8_000;

const BACKOFF_BASE_MS = 2_000;
const BACKOFF_MAX_MS = 60_000;
const BACKOFF_JITTER = 0.2;

// Espacamento entre um destinatario e o proximo: 1 a 5 MINUTOS.
//
// Era de 1 a 3 segundos. O intervalo longo imita o ritmo de uma pessoa
// mandando mensagem, que e o oposto do padrao que faz o WhatsApp bloquear um
// numero (varios envios identicos em rajada).
//
// O custo esta assumido: com N motoristas, o ultimo da lista recebe ate
// (N-1) x 5 minutos depois do primeiro. O primeiro continua recebendo na hora
// — o espacamento so vale ENTRE destinatarios.
const SPACING_MIN_MS = 60_000;
const SPACING_MAX_MS = 300_000;

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
 * Resultado da consulta do numero ao WhatsApp, ja traduzido para a decisao de
 * envio. `jid` so existe quando ha para onde mandar.
 */
export type JidResolution =
  | { kind: "verificado"; jid: string }
  | { kind: "nao-verificado"; jid: string }
  | { kind: "sem-whatsapp" };

/**
 * Decide para qual JID a mensagem vai, a partir do JID construido e da resposta
 * de `sock.onWhatsApp`.
 *
 * POR QUE ISTO EXISTE: o JID montado por concatenacao (55 + DDD + numero) NAO e
 * necessariamente o que o WhatsApp reconhece. Numero brasileiro registrado
 * antes da chegada do nono digito tem JID canonico SEM o 9, e o mesmo numero
 * pode ter as duas formas. Mandar para a forma errada nao devolve erro: o
 * Baileys aceita, o envio e contabilizado como sucesso e a mensagem nao chega a
 * ninguem. Era o motivo de o painel mostrar "ENVIADO" enquanto o motorista nao
 * recebia nada.
 *
 * A resposta do Baileys ja distingue os dois casos que importam:
 *  - lista devolvida (mesmo vazia) = a consulta funcionou. Numero fora da lista
 *    simplesmente nao tem WhatsApp, e nao adianta enviar.
 *  - undefined = a consulta falhou (rede/oscilacao). Ai vale mais tentar com o
 *    JID construido do que deixar de avisar o motorista.
 */
export function resolveSendJid(
  construido: string,
  lookup: { jid: string; exists: unknown }[] | undefined,
): JidResolution {
  if (!lookup) return { kind: "nao-verificado", jid: construido };
  const achado = lookup.find((r) => Boolean(r.exists) && Boolean(r.jid));
  if (!achado) return { kind: "sem-whatsapp" };
  return { kind: "verificado", jid: achado.jid };
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
 * Intervalo entre um destinatario e o proximo (1min a 5min). Disparo em
 * paralelo para N numeros e o padrao que mais provoca bloqueio do numero.
 */
export function sendSpacingMs(rand: () => number = Math.random): number {
  return Math.round(SPACING_MIN_MS + (SPACING_MAX_MS - SPACING_MIN_MS) * rand());
}
