"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRoleAction } from "@/lib/auth";
import { actionOk, actionError, type ActionResult } from "@/types/action";
import type { SalesModel } from "@prisma/client";

// ===========================================================================
// METAS FINANCEIRAS (SalesGoal)
// Meta Geral (campaignId = null) ou vinculada a uma Campanha ativa.
// ===========================================================================

export async function createSalesGoal(args: {
  userId: string;
  amount: number;
  month: number;
  year: number;
  scope: SalesModel;
  campaignId?: string | null;
  targetItems?: number;
}): Promise<ActionResult<void>> {
  try {
    await requireRoleAction(["GESTAO"]);
    if (!args.userId) return actionError("Selecione o vendedor.");
    if (args.month < 1 || args.month > 12) return actionError("Mês inválido.");

    const campaignId = args.campaignId || null;

    // Se vinculada, valida que a campanha existe e está ativa.
    if (campaignId) {
      const camp = await prisma.campaign.findUnique({ where: { id: campaignId } });
      if (!camp) return actionError("Campanha não encontrada.");
      if (!camp.active) return actionError("Campanha inativa. Ative-a antes de vincular a meta.");
    }

    // Geral = meta em R$ (amount). Campanha = meta por itens (targetItems).
    let amount = 0;
    let targetItems: number | null = null;
    if (campaignId) {
      targetItems = Math.trunc(args.targetItems ?? 0);
      if (!(targetItems > 0)) return actionError("Informe a quantidade de itens da meta.");
    } else {
      amount = args.amount;
      if (!(amount > 0)) return actionError("Informe um valor de meta válido.");
    }

    // upsert pela chave unica (user, mes, ano, escopo)
    const existing = await prisma.salesGoal.findFirst({
      where: { userId: args.userId, month: args.month, year: args.year, scope: args.scope },
    });
    if (existing) {
      await prisma.salesGoal.update({
        where: { id: existing.id },
        data: { amount, targetItems, campaignId },
      });
    } else {
      await prisma.salesGoal.create({
        data: {
          userId: args.userId, amount, targetItems,
          month: args.month, year: args.year, scope: args.scope, campaignId,
        },
      });
    }
    revalidatePath("/gestao");
    revalidatePath("/dashboard");
    return actionOk(undefined);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao salvar meta.");
  }
}

export async function deleteSalesGoal(id: string): Promise<ActionResult<void>> {
  try {
    await requireRoleAction(["GESTAO"]);
    await prisma.salesGoal.delete({ where: { id } });
    revalidatePath("/gestao");
    revalidatePath("/dashboard");
    return actionOk(undefined);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao excluir meta.");
  }
}

// ===========================================================================
// CAMPANHAS (Campaign) — cadastro simples: apenas o nome.
// ===========================================================================

export async function createCampaign(args: { name: string }): Promise<ActionResult<void>> {
  try {
    await requireRoleAction(["GESTAO"]);
    if (!args.name.trim()) return actionError("Nome da campanha obrigatório.");

    await prisma.campaign.create({ data: { name: args.name.trim() } });
    revalidatePath("/gestao");
    revalidatePath("/dashboard");
    return actionOk(undefined);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao criar campanha.");
  }
}

export async function renameCampaign(args: { id: string; name: string }): Promise<ActionResult<void>> {
  try {
    await requireRoleAction(["GESTAO"]);
    if (!args.name.trim()) return actionError("Nome da campanha obrigatório.");
    await prisma.campaign.update({ where: { id: args.id }, data: { name: args.name.trim() } });
    revalidatePath("/gestao");
    revalidatePath("/dashboard");
    return actionOk(undefined);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao renomear campanha.");
  }
}

export async function toggleCampaign(id: string, active: boolean): Promise<ActionResult<void>> {
  try {
    await requireRoleAction(["GESTAO"]);
    await prisma.campaign.update({ where: { id }, data: { active } });
    revalidatePath("/gestao");
    revalidatePath("/dashboard");
    return actionOk(undefined);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao atualizar campanha.");
  }
}

export async function deleteCampaign(id: string): Promise<ActionResult<void>> {
  try {
    await requireRoleAction(["GESTAO"]);
    const linked = await prisma.order.count({ where: { campaignId: id } });
    if (linked > 0) {
      return actionError(`Não é possível excluir: ${linked} pedido(s) vinculado(s). Desative a campanha.`);
    }
    // Metas vinculadas viram Geral (onDelete: SetNull no schema).
    await prisma.campaign.delete({ where: { id } });
    revalidatePath("/gestao");
    revalidatePath("/dashboard");
    return actionOk(undefined);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao excluir campanha.");
  }
}
