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

/**
 * Caminho + query da rota de arquivo da vitrine no Connect.
 *
 * MONTADO UMA VEZ, usado duas: é ele que vai na assinatura e é ele que vai no
 * pedido. O Connect refaz a conta sobre `pathname + search` do que recebeu,
 * então assinar uma string e pedir outra (ordem dos parâmetros, uma codificação
 * diferente) é 401 em todo arquivo da tela — e o log só diria "assinatura
 * inválida".
 *
 * Aqui, e não junto da busca, para a checagem poder conferir a ida e a volta
 * sem subir o Next.
 */
export function caminhoDoArquivoDaVitrine(tipo: string, id: string): string {
  return `/api/integracao/flow/vitrine/arquivo?${new URLSearchParams({ tipo, id })}`;
}
