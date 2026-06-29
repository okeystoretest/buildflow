"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  createSession,
  destroySession,
  verifyPassword,
} from "@/lib/auth";
import { loginSchema } from "@/lib/validations/auth";
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

  const loginId = parsed.data.email.trim();
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

  await createSession({ userId: user.id, role: user.role, name: user.name });
  redirect("/");
}

export async function logout(): Promise<void> {
  await destroySession();
  redirect("/login");
}
