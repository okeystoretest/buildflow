import { randomBytes, hkdfSync } from "crypto";
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
 * SEPARAÇÃO CRIPTOGRÁFICA (corrige confusão de token).
 * Este JWT já foi assinado com o MESMO `AUTH_SECRET` da sessão do sistema. Como
 * o middleware valida o `bf_session` só por assinatura (o Edge não acessa o
 * banco para conferir o payload), qualquer visitante anônimo que passasse pelo
 * gate recebia um token que o middleware do dashboard aceitava — bastava
 * reenviá-lo no cookie `bf_session`.
 *
 * Agora a assinatura usa uma SUBCHAVE derivada por HKDF-SHA256 do
 * `AUTH_SECRET`, com `info` própria. É computacionalmente independente da
 * chave de sessão: um token daqui não verifica lá, nem o contrário. Derivar
 * (em vez de exigir um segredo novo no ambiente) evita ter que sincronizar
 * mais uma variável entre a VPS e o desenvolvimento.
 */

const COOKIE_NAME = "bf_track";
// Janela curta: o cliente consulta e sai. Link compartilhado em celular de
// terceiro não fica liberado por dias.
const MAX_AGE_SEC = 60 * 60 * 2;
// Audiência do token. Defesa em profundidade: mesmo que um dia as duas chaves
// voltem a coincidir por engano, a verificação exige esta claim.
const AUDIENCE = "bf-tracking";

interface TrackingClaims {
  // Token do pedido ao qual esta liberação pertence.
  tk: string;
  [key: string]: unknown;
}

/**
 * Subchave de assinatura do acompanhamento.
 *
 * Fica NESTE módulo, e não em `auth-secret.ts`, de propósito: aquele arquivo é
 * importado pelo `middleware.ts`, que roda no runtime Edge — onde o `crypto`
 * do Node (e o `hkdfSync`) não existe. Trazer a derivação para cá mantém o
 * bundle do middleware limpo.
 */
let cachedSecret: Uint8Array | null = null;
function getTrackingSecret(): Uint8Array {
  if (cachedSecret) return cachedSecret;
  // `getAuthSecret()` valida a presença/força do AUTH_SECRET na 1ª chamada.
  const derived = hkdfSync("sha256", getAuthSecret(), "", "bf-tracking-v1", 32);
  cachedSecret = new Uint8Array(derived);
  return cachedSecret;
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
    .setAudience(AUDIENCE)
    .setExpirationTime(`${MAX_AGE_SEC}s`)
    .sign(getTrackingSecret());

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
    const { payload } = await jwtVerify(jwt, getTrackingSecret(), {
      audience: AUDIENCE,
    });
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
