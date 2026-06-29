"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRoleAction } from "@/lib/auth";
import { actionOk, actionError, type ActionResult } from "@/types/action";

// Mantem so digitos do CNPJ (14). Vazio = invalido.
function onlyDigits(v: string): string {
  return (v || "").replace(/\D/g, "");
}

// ===========================================================================
// CRUD de CNPJ (acesso FINANCEIRO e GESTAO)
// ===========================================================================

export async function cnpjCreate(args: {
  name: string;
  document: string;
}): Promise<ActionResult<void>> {
  try {
    await requireRoleAction(["FINANCEIRO", "GESTAO"]);
    const name = args.name?.trim();
    const document = onlyDigits(args.document);
    if (!name) return actionError("Razao social / nome obrigatorio.");
    if (document.length !== 14) return actionError("CNPJ deve ter 14 digitos.");

    const exists = await prisma.cnpj.findUnique({ where: { document } });
    if (exists) return actionError("Ja existe um CNPJ com este numero.");

    await prisma.cnpj.create({ data: { name, document } });
    revalidatePath("/financeiro");
    return actionOk(undefined);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao cadastrar CNPJ.");
  }
}

export async function cnpjUpdate(args: {
  id: string;
  name: string;
  document: string;
}): Promise<ActionResult<void>> {
  try {
    await requireRoleAction(["FINANCEIRO", "GESTAO"]);
    const name = args.name?.trim();
    const document = onlyDigits(args.document);
    if (!name) return actionError("Razao social / nome obrigatorio.");
    if (document.length !== 14) return actionError("CNPJ deve ter 14 digitos.");

    const dup = await prisma.cnpj.findFirst({
      where: { document, NOT: { id: args.id } },
    });
    if (dup) return actionError("Ja existe outro CNPJ com este numero.");

    await prisma.cnpj.update({ where: { id: args.id }, data: { name, document } });
    revalidatePath("/financeiro");
    return actionOk(undefined);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao editar CNPJ.");
  }
}

export async function cnpjToggle(id: string, active: boolean): Promise<ActionResult<void>> {
  try {
    await requireRoleAction(["FINANCEIRO", "GESTAO"]);
    await prisma.cnpj.update({ where: { id }, data: { active } });
    revalidatePath("/financeiro");
    return actionOk(undefined);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao atualizar CNPJ.");
  }
}

export async function cnpjDelete(id: string): Promise<ActionResult<void>> {
  try {
    await requireRoleAction(["FINANCEIRO", "GESTAO"]);
    const count = await prisma.order.count({ where: { cnpjId: id } });
    if (count > 0) {
      return actionError(
        `Nao e possivel excluir: ${count} pedido(s) vinculado(s). Desative em vez de excluir.`,
      );
    }
    await prisma.cnpj.delete({ where: { id } });
    revalidatePath("/financeiro");
    return actionOk(undefined);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao excluir CNPJ.");
  }
}

/**
 * Vincula um CNPJ ao pedido (chamado na Analise do Pedido, antes do "Pago").
 * So aceita pedido ainda em analise e CNPJ ativo.
 */
export async function linkCnpjToOrder(args: {
  orderId: string;
  cnpjId: string;
}): Promise<ActionResult<void>> {
  try {
    await requireRoleAction(["FINANCEIRO", "GESTAO"]);

    const order = await prisma.order.findUnique({ where: { id: args.orderId } });
    if (!order) return actionError("Pedido nao encontrado.");
    if (order.status !== "EM_ANALISE") return actionError("Pedido nao esta em analise.");

    const cnpj = await prisma.cnpj.findUnique({ where: { id: args.cnpjId } });
    if (!cnpj || !cnpj.active) return actionError("CNPJ invalido ou inativo.");

    await prisma.order.update({
      where: { id: args.orderId },
      data: { cnpjId: args.cnpjId },
    });
    revalidatePath("/financeiro");
    return actionOk(undefined);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao vincular CNPJ.");
  }
}
