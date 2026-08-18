"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import {
  createSession,
  destroySession,
  verifyPassword,
} from "@/lib/auth";
import { loginSchema } from "@/lib/validations/auth";
import { checkLoginRate, clearLoginRate } from "@/lib/rate-limit";
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

  const loginId = parsed.data.email.trim().toLowerCase();

  // Rate limiting anti-força-bruta: janela por (IP + email). Bloqueia após
  // muitas tentativas seguidas, esfriando o ataque sem punir o usuário legítimo.
  const ip =
    headers().get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers().get("x-real-ip") ||
    "desconhecido";
  const gate = checkLoginRate(`${ip}:${loginId}`);
  if (!gate.allowed) {
    return actionError(
      `Muitas tentativas. Tente novamente em ${gate.retryAfterSec}s.`,
    );
  }

  const user = await prisma.user.findUnique({
    where: { email: loginId },
  });
  if (!user || !user.active) {
    return actionError("Usuario ou senha incorretos.");
  }

  const valid = await verifyPassword(parsed.data.password, user.password);
  if (!valid) {
    return actionError("Usuario ou senha incorretos.");
  }

  // Sucesso: zera o contador daquela chave.
  clearLoginRate(`${ip}:${loginId}`);

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
