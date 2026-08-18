import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAuthSecret } from "@/lib/auth-secret";

const COOKIE_NAME = "bf_session";

export interface SessionPayload {
  userId: string;
  role: Role;
  name: string;
  // Versão da sessão no momento da emissão. Confrontada com User.tokenVersion
  // para permitir revogação (logout server-side, desativação de usuário).
  tokenVersion: number;
  [key: string]: unknown;
}

export async function hashPassword(plain: string): Promise<string> {
  // Cost 12 (era 10): ~4x mais lento p/ atacante, imperceptível no login.
  return bcrypt.hash(plain, 12);
}

export async function verifyPassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export async function createSession(payload: SessionPayload): Promise<void> {
  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getAuthSecret());

  cookies().set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
  });
}

/**
 * Lê e VALIDA a sessão. Além de conferir a assinatura do JWT, confronta o
 * `tokenVersion` do token com o valor atual em banco e checa se o usuário
 * segue ativo. Se a versão divergir (logout/expulsão) ou o usuário estiver
 * inativo, a sessão é considerada inválida. Este é o caminho autoritativo
 * usado por páginas e Server Actions.
 */
export async function getSession(): Promise<SessionPayload | null> {
  const token = cookies().get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getAuthSecret());
    const session = payload as SessionPayload;

    // Revogação: confere versão e status atuais do usuário.
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { tokenVersion: true, active: true },
    });
    if (!user || !user.active) return null;
    if ((session.tokenVersion ?? 0) !== user.tokenVersion) return null;

    return session;
  } catch {
    return null;
  }
}

/**
 * Encerra a sessão do usuário logado em TODOS os dispositivos: incrementa o
 * tokenVersion (invalida os JWT já emitidos) e apaga o cookie local.
 */
export async function destroySession(): Promise<void> {
  const token = cookies().get(COOKIE_NAME)?.value;
  if (token) {
    try {
      const { payload } = await jwtVerify(token, getAuthSecret());
      const userId = (payload as SessionPayload).userId;
      if (userId) {
        await prisma.user.update({
          where: { id: userId },
          data: { tokenVersion: { increment: 1 } },
        });
      }
    } catch {
      // Token inválido/expirado: nada a revogar, só limpar o cookie.
    }
  }
  cookies().delete(COOKIE_NAME);
}

/**
 * Para PAGINAS (Server Components): garante sessao + papel.
 * Se nao autenticado -> manda para /login.
 * Se autenticado mas sem permissao -> manda para a home (que roteia por perfil),
 * evitando a tela de erro.
 */
export async function requireRole(allowed?: Role[]): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (allowed && !allowed.includes(session.role)) {
    redirect("/");
  }
  return session;
}

/**
 * Para SERVER ACTIONS: igual ao requireRole, mas lanca erro em vez de redirecionar
 * (actions nao devem redirecionar silenciosamente; o erro vira mensagem na UI).
 */
export async function requireRoleAction(allowed?: Role[]): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) throw new Error("Nao autenticado.");
  if (allowed && !allowed.includes(session.role)) {
    throw new Error("Sem permissao para esta acao.");
  }
  return session;
}

/**
 * Carrega o contexto do ator (sessao + Lojas de Origem atreladas) para as
 * checagens de permissao de interacao com pedidos. Ver src/lib/permissions.ts.
 */
export async function getActorContext(): Promise<{
  userId: string;
  role: Role;
  originStoreIds: string[];
} | null> {
  const session = await getSession();
  if (!session) return null;
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { originStores: { select: { id: true } } },
  });
  return {
    userId: session.userId,
    role: session.role,
    originStoreIds: user?.originStores.map((s) => s.id) ?? [],
  };
}
