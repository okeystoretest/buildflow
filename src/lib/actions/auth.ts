"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  createSession,
  destroySession,
  verifyPassword,
} from "@/lib/auth";
import { loginSchema } from "@/lib/validations/auth";
import { checkLoginRate, clearLoginRate } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-ip";
import { actionError, type ActionResult } from "@/types/action";

export async function login(
  _prev: ActionResult<void> | null,
  formData: FormData,
): Promise<ActionResult<void>> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return actionError("Dados invalidos.", parsed.error.flatten().fieldErrors);
  }

  // Identificador digitado, apenas com espacos aparados (preserva a caixa).
  const loginInput = parsed.data.email.trim();
  // Chave do rate limit: normalizada em minusculas para que variacoes de caixa
  // do MESMO usuario caiam no mesmo balde de tentativas.
  const loginKey = loginInput.toLowerCase();

  // Rate limiting anti-força-bruta: janela por (IP + email). Bloqueia após
  // muitas tentativas seguidas, esfriando o ataque sem punir o usuário legítimo.
  // O IP vem de getClientIp (lê o X-Forwarded-For a partir do salto confiável);
  // pegar o primeiro elemento do header deixava o balde à escolha do atacante.
  const ip = getClientIp();
  const gate = checkLoginRate(`${ip}:${loginKey}`);
  if (!gate.allowed) {
    return actionError(
      `Muitas tentativas. Tente novamente em ${gate.retryAfterSec}s.`,
    );
  }

  // Busca CASE-INSENSITIVE do identificador de login.
  //
  // O cadastro de usuarios (Gestao) grava `User.email` com a caixa original
  // digitada (ex.: "Livia#BF"). O hardening da sessao anterior normalizava o
  // login para minusculas e consultava com `findUnique`, que e case-sensitive
  // no Postgres — nenhum usuario cadastrado com maiusculas era encontrado e
  // TODOS os logins falhavam com "Usuario ou senha incorretos".
  //
  // Solucao: consultar com `mode: "insensitive"`, aceitando qualquer caixa
  // digitada sem exigir reescrita dos dados ja gravados no banco.
  const user = await prisma.user.findFirst({
    where: { email: { equals: loginInput, mode: "insensitive" } },
  });
  if (!user || !user.active) {
    return actionError("Usuario ou senha incorretos.");
  }

  const valid = await verifyPassword(parsed.data.password, user.password);
  if (!valid) {
    return actionError("Usuario ou senha incorretos.");
  }

  // Sucesso: zera o contador daquela chave.
  clearLoginRate(`${ip}:${loginKey}`);

  await createSession({
    userId: user.id,
    role: user.role,
    name: user.name,
    tokenVersion: user.tokenVersion,
  });
  redirect("/");
}

export async function logout(): Promise<void> {
  await destroySession();
  redirect("/login");
}
