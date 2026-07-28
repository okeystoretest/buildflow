import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const COOKIE_NAME = "bf_session";
const secret = new TextEncoder().encode(
  process.env.AUTH_SECRET ?? "dev_inseguro_troque",
);

export interface SessionPayload {
  userId: string;
  role: Role;
  name: string;
  [key: string]: unknown;
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
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
    .sign(secret);

  cookies().set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
  });
}

export async function getSession(): Promise<SessionPayload | null> {
  const token = cookies().get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload as SessionPayload;
  } catch {
    return null;
  }
}

export async function destroySession(): Promise<void> {
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
