import { randomBytes } from "crypto";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { getAuthSecret } from "@/lib/auth-secret";

/**
 * Sessão do CLIENTE FINAL no acompanhamento externo (/acompanhar/<token>).
 *
 * Não é uma sessão do sistema: não existe usuário, papel, nem acesso ao
 * dashboard. É só um comprovante assinado de que aquele visitante digitou o
 * Código de Cliente correto para AQUELE pedido — por isso o token do pedido
 * vai dentro do JWT e é conferido a cada página (um link não libera outro).
 *
 * Cookie separado do `bf_session` de propósito: o cliente nunca deve receber
 * (nem poder forjar) algo que o middleware do dashboard aceite.
 */

const COOKIE_NAME = "bf_track";
// Janela curta: o cliente consulta e sai. Link compartilhado em celular de
// terceiro não fica liberado por dias.
const MAX_AGE_SEC = 60 * 60 * 2;

interface TrackingClaims {
  // Token do pedido ao qual esta liberação pertence.
  tk: string;
  [key: string]: unknown;
}

/** Token opaco do link de acompanhamento (32 chars, url-safe). */
export function newTrackingToken(): string {
  return randomBytes(24).toString("base64url");
}

/** Libera o acesso do cliente ao pedido daquele token. */
export async function createTrackingSession(orderToken: string): Promise<void> {
  const jwt = await new SignJWT({ tk: orderToken } satisfies TrackingClaims)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SEC}s`)
    .sign(getAuthSecret());

  cookies().set(COOKIE_NAME, jwt, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: MAX_AGE_SEC,
    // Restrito à área pública de acompanhamento: o cookie nunca acompanha
    // requisições do dashboard.
    path: "/acompanhar",
  });
}

/** true se o visitante já validou o código DESTE pedido. */
export async function hasTrackingAccess(orderToken: string): Promise<boolean> {
  const jwt = cookies().get(COOKIE_NAME)?.value;
  if (!jwt) return false;
  try {
    const { payload } = await jwtVerify(jwt, getAuthSecret());
    return (payload as TrackingClaims).tk === orderToken;
  } catch {
    return false;
  }
}

/** Encerra a consulta (botão "Sair" da tela do cliente). */
export function destroyTrackingSession(): void {
  // Expira no lugar de `delete()`: o cookie foi gravado com path
  // "/acompanhar" e a remoção só surte efeito com o MESMO path.
  cookies().set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/acompanhar",
  });
}
