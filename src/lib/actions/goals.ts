"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { WholesaleBrand } from "@prisma/client";
import { SELECT_BRAND_LABEL } from "@/lib/select-brand";
import { requireRoleAction } from "@/lib/auth";
import { actionOk, actionError, type ActionResult } from "@/types/action";
import type { SalesModel } from "@prisma/client";

// ===========================================================================
// METAS FINANCEIRAS (SalesGoal)
// Meta Geral (campaignId = null) ou vinculada a uma Campanha ativa.
//
// REGRA: Geral e Campanhas convivem por (user, mes, ano, escopo).
//  - Geral:    unica por (user, mes, ano, escopo)            -> campaignId NULL
//  - Campanha: unica por (user, mes, ano, escopo, campanha)  -> campaignId NOT NULL
// Por isso a busca da meta existente SEMPRE considera o campaignId. Antes ela
// ignorava a campanha e por isso uma meta de campanha sobrescrevia a Geral.
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
    if (!(args.year > 2000)) return actionError("Ano inválido.");

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

    // Busca a meta existente considerando o campaignId. Isto e o conserto:
    //  - Geral    -> procura registro com o MESMO campaignId NULL.
    //  - Campanha -> procura registro com o MESMO campaignId daquela campanha.
    // Uma nao acha a outra; portanto nao se sobrescrevem.
    const existing = await prisma.salesGoal.findFirst({
      where: {
        userId: args.userId,
        month: args.month,
        year: args.year,
        scope: args.scope,
        campaignId, // null para Geral, id para Campanha
      },
    });

    if (existing) {
      // Atualiza apenas a meta daquele tipo (mesma campanha ou a Geral).
      await prisma.salesGoal.update({
        where: { id: existing.id },
        data: { amount, targetItems },
      });
    } else {
      await prisma.salesGoal.create({
        data: {
          userId: args.userId,
          amount,
          targetItems,
          month: args.month,
          year: args.year,
          scope: args.scope,
          campaignId,
        },
      });
    }

    revalidatePath("/gestao");
    revalidatePath("/dashboard");
    return actionOk(undefined);
  } catch (err) {
    // P2002 = violacao de indice unico (corrida/concorrencia). Mensagem clara.
    if (err && typeof err === "object" && "code" in err && (err as { code?: string }).code === "P2002") {
      return actionError("Já existe uma meta desse tipo para esse vendedor neste período.");
    }
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

/**
 * CAMPANHA DE SELECT — uma por marca, criada pelo botao proprio.
 *
 * Existe separada de `createCampaign` porque nao e a mesma coisa: campanha
 * comum acompanha PECAS vendidas em pedidos; esta acompanha CONTRATOS de
 * servico de uma marca, e o vinculo com a marca e o que leva a venda ate ela.
 * Criada a mao como campanha comum, nao atribuiria venda nenhuma — era o que
 * acontecia quando o reconhecimento era pelo nome.
 *
 * O nome sai da marca e nao e digitado: o que identifica a campanha e a marca,
 * e dois nomes diferentes para a mesma marca so confundiriam quem le o painel.
 *
 * UMA POR MARCA, garantido pelo UNIQUE da coluna. A recusa e traduzida aqui
 * porque "Unique constraint failed on the fields: (`selectBrand`)" nao diz a
 * ninguem que ja existe a campanha daquela marca.
 */
export async function createSelectCampaign(args: {
  brand: string;
}): Promise<ActionResult<void>> {
  try {
    await requireRoleAction(["GESTAO"]);

    const brand = (args?.brand ?? "").trim();
    if (!(Object.values(WholesaleBrand) as string[]).includes(brand)) {
      return actionError("Escolha a marca da campanha.");
    }
    const marca = brand as WholesaleBrand;

    const existente = await prisma.campaign.findUnique({ where: { selectBrand: marca } });
    if (existente) {
      return actionError(`Já existe a campanha de Select da marca ${SELECT_BRAND_LABEL[marca]}.`);
    }

    await prisma.campaign.create({
      data: { name: `Select ${SELECT_BRAND_LABEL[marca]}`, selectBrand: marca },
    });
    revalidatePath("/gestao");
    revalidatePath("/dashboard");
    return actionOk(undefined);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao criar a campanha de Select.");
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

    // METAS VINCULADAS BARRAM A EXCLUSÃO, como os pedidos.
    //
    // O schema tem `onDelete: SetNull` no `campaignId` da meta, então apagar a
    // campanha deixava as metas dela com campaignId nulo — isto é, virando META
    // GERAL. Duas coisas davam errado aí, e a segunda é pior que a primeira:
    //
    //  1. Com a vendedora já tendo meta geral naquele mês/ano/escopo, as duas
    //     colidem em `salesgoal_geral_unique` e o delete falha com um erro de
    //     constraint do Prisma, que não diz a ninguém o que aconteceu.
    //  2. Quando NÃO colide, a conversão acontece em silêncio — e meta de
    //     campanha é medida em QUANTIDADE DE ITENS (`targetItems`), não em R$.
    //     Ela entrava na Meta Geral do dashboard com o `amount` que estivesse
    //     gravado, como um valor que ninguém cadastrou.
    //
    // Recusar, e não apagar as metas junto: meta é histórico de performance. O
    // ranking de um mês fechado lê as metas daquele mês, e apagá-las reescreve
    // o passado para fechar uma campanha do presente.
    const metas = await prisma.salesGoal.count({ where: { campaignId: id } });
    if (metas > 0) {
      return actionError(
        `Não é possível excluir: ${metas} meta(s) vinculada(s) a esta campanha. ` +
          `Remova as metas na aba Metas, ou desative a campanha.`,
      );
    }

    await prisma.campaign.delete({ where: { id } });
    revalidatePath("/gestao");
    revalidatePath("/dashboard");
    return actionOk(undefined);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao excluir campanha.");
  }
}
