"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRoleAction, hashPassword } from "@/lib/auth";
import { actionOk, actionError, type ActionResult } from "@/types/action";
import type { Role, PaymentDisposition, SalesModel } from "@prisma/client";

// Entidades simples com apenas "name".
type SimpleEntity = "store" | "orderType" | "shippingMethod" | "paymentMethod" | "bank";

export async function createSimple(
  entity: SimpleEntity,
  name: string,
): Promise<ActionResult<void>> {
  try {
    await requireRoleAction(["GESTAO"]);
    if (!name.trim()) return actionError("Nome obrigatorio.");
    await (prisma as any)[entity].create({ data: { name: name.trim() } });
    revalidatePath("/gestao");
    return actionOk(undefined);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao criar.");
  }
}

export async function toggleSimple(
  entity: SimpleEntity | "operation" | "paymentStatusOption",
  id: string,
  active: boolean,
): Promise<ActionResult<void>> {
  try {
    await requireRoleAction(["GESTAO"]);
    await (prisma as any)[entity].update({ where: { id }, data: { active } });
    revalidatePath("/gestao");
    return actionOk(undefined);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao atualizar.");
  }
}

// Renomeia entidade simples (e operacao via campos separados em outra action).
export async function renameSimple(
  entity: SimpleEntity,
  id: string,
  name: string,
): Promise<ActionResult<void>> {
  try {
    await requireRoleAction(["GESTAO"]);
    if (!name.trim()) return actionError("Nome obrigatório.");
    await (prisma as any)[entity].update({ where: { id }, data: { name: name.trim() } });
    revalidatePath("/gestao");
    return actionOk(undefined);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao renomear.");
  }
}

// Exclui entidade simples (bloqueia se houver pedidos vinculados, quando aplicavel).
export async function deleteSimple(
  entity: SimpleEntity | "operation" | "paymentStatusOption",
  id: string,
): Promise<ActionResult<void>> {
  try {
    await requireRoleAction(["GESTAO"]);
    // checa vinculo com pedidos para entidades que o possuem
    const fk: Record<string, string | null> = {
      store: "storeId", orderType: "orderTypeId", operation: "operationId",
      shippingMethod: "shippingMethodId", paymentMethod: "paymentMethodId",
      paymentStatusOption: "paymentStatusId", bank: null,
    };
    const field = fk[entity];
    if (field) {
      const count = await prisma.order.count({ where: { [field]: id } as any });
      if (count > 0) return actionError(`Não é possível excluir: ${count} pedido(s) vinculado(s). Desative em vez de excluir.`);
    }
    await (prisma as any)[entity].delete({ where: { id } });
    revalidatePath("/gestao");
    return actionOk(undefined);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao excluir.");
  }
}

export async function renameOperation(
  id: string,
  code: string,
  name: string,
): Promise<ActionResult<void>> {
  try {
    await requireRoleAction(["GESTAO"]);
    if (!code.trim() || !name.trim()) return actionError("Código e nome obrigatórios.");
    await prisma.operation.update({ where: { id }, data: { code: code.trim(), name: name.trim() } });
    revalidatePath("/gestao");
    return actionOk(undefined);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao editar operação.");
  }
}

export async function createOperation(args: {
  code: string;
  name: string;
}): Promise<ActionResult<void>> {
  try {
    await requireRoleAction(["GESTAO"]);
    if (!args.code.trim() || !args.name.trim()) return actionError("Código e nome obrigatórios.");
    await prisma.operation.create({ data: { code: args.code.trim(), name: args.name.trim() } });
    revalidatePath("/gestao");
    return actionOk(undefined);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao criar operação.");
  }
}

export async function createPaymentStatus(args: {
  name: string;
  disposition: PaymentDisposition;
}): Promise<ActionResult<void>> {
  try {
    await requireRoleAction(["GESTAO"]);
    if (!args.name.trim()) return actionError("Nome obrigatório.");
    await prisma.paymentStatusOption.create({
      data: { name: args.name.trim(), disposition: args.disposition },
    });
    revalidatePath("/gestao");
    return actionOk(undefined);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao criar status.");
  }
}

export async function createUser(args: {
  name: string;
  email: string;
  password: string;
  role: Role;
  salesModel?: SalesModel | null;
}): Promise<ActionResult<void>> {
  try {
    await requireRoleAction(["GESTAO"]);
    if (!args.name.trim() || !args.email.trim() || args.password.length < 6) {
      return actionError("Preencha nome, e-mail e senha (mín. 6 caracteres).");
    }
    // Vendedor obrigatoriamente tem modelo de venda (Varejo/Atacado).
    if (args.role === "VENDAS" && !args.salesModel) {
      return actionError("Selecione o Modelo de Venda (Varejo ou Atacado) para o vendedor.");
    }
    const exists = await prisma.user.findUnique({ where: { email: args.email.trim() } });
    if (exists) return actionError("Já existe usuário com este e-mail.");
    await prisma.user.create({
      data: {
        name: args.name.trim(),
        email: args.email.trim(),
        password: await hashPassword(args.password),
        role: args.role,
        salesModel: args.role === "VENDAS" ? args.salesModel : null,
      },
    });
    revalidatePath("/gestao");
    return actionOk(undefined);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao criar usuário.");
  }
}

/**
 * Edita um usuario existente (Gestao).
 * A SENHA e opcional: se vier vazia, a senha atual e mantida.
 */
export async function updateUser(args: {
  id: string;
  name: string;
  email: string;
  password?: string; // vazio/undefined = nao altera
  role: Role;
  salesModel?: SalesModel | null;
}): Promise<ActionResult<void>> {
  try {
    await requireRoleAction(["GESTAO"]);

    const user = await prisma.user.findUnique({ where: { id: args.id } });
    if (!user) return actionError("Usuário não encontrado.");

    if (!args.name.trim() || !args.email.trim()) {
      return actionError("Preencha nome e usuário.");
    }
    // Se informou senha nova, ela precisa ter o tamanho minimo.
    const novaSenha = args.password?.trim();
    if (novaSenha && novaSenha.length < 6) {
      return actionError("A nova senha deve ter no mínimo 6 caracteres.");
    }
    // Vendedor obrigatoriamente tem modelo de venda (Varejo/Atacado).
    if (args.role === "VENDAS" && !args.salesModel) {
      return actionError("Selecione o Modelo de Venda (Varejo ou Atacado) para o vendedor.");
    }

    // O login (email) deve continuar unico.
    const email = args.email.trim();
    if (email !== user.email) {
      const exists = await prisma.user.findUnique({ where: { email } });
      if (exists) return actionError("Já existe usuário com este login.");
    }

    await prisma.user.update({
      where: { id: args.id },
      data: {
        name: args.name.trim(),
        email,
        role: args.role,
        salesModel: args.role === "VENDAS" ? args.salesModel : null,
        // Só regrava a senha quando uma nova foi informada.
        ...(novaSenha ? { password: await hashPassword(novaSenha) } : {}),
      },
    });

    revalidatePath("/gestao");
    return actionOk(undefined);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao editar usuário.");
  }
}

export async function toggleUser(id: string, active: boolean): Promise<ActionResult<void>> {  try {
    await requireRoleAction(["GESTAO"]);
    await prisma.user.update({ where: { id }, data: { active } });
    revalidatePath("/gestao");
    return actionOk(undefined);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao atualizar usuário.");
  }
}

export async function deleteUser(id: string): Promise<ActionResult<void>> {
  try {
    const session = await requireRoleAction(["GESTAO"]);
    if (session.userId === id) return actionError("Você não pode excluir o próprio usuário.");
    const orders = await prisma.order.count({ where: { sellerId: id } });
    const deliveries = await prisma.delivery.count({ where: { driverId: id } });
    if (orders > 0 || deliveries > 0) {
      return actionError("Usuário tem pedidos/entregas vinculados. Desative em vez de excluir.");
    }
    // Notification tem RESTRICT no banco; apaga as do usuário antes de excluí-lo.
    // SalesGoal cai por cascade automaticamente.
    await prisma.$transaction(async (tx) => {
      await tx.notification.deleteMany({ where: { userId: id } });
      await tx.user.delete({ where: { id } });
    });
    revalidatePath("/gestao");
    return actionOk(undefined);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao excluir usuário.");
  }
}
