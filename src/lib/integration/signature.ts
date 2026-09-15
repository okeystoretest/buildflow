import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Primitivas de seguranca da integracao com o Build.Connect. Puras, para os
 * checks: nao leem env nem Request.
 */

/** HMAC-SHA256 de `${timestamp}.${body}`, em hex. O Connect verifica o mesmo. */
export function signWebhook(secret: string, timestamp: number, body: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

/** Comparacao em tempo constante. Tamanhos diferentes = falso, sem vazar onde. */
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/** `Authorization: Bearer <token>` bate com o esperado? Esperado vazio nunca passa. */
export function verifyBearer(header: string | null, expected: string): boolean {
  if (!expected) return false;
  if (!header || !header.startsWith("Bearer ")) return false;
  const given = header.slice("Bearer ".length).trim();
  return safeEqual(given, expected);
}
