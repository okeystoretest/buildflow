"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRoleAction } from "@/lib/auth";
import { actionOk, actionError, type ActionResult } from "@/types/action";
import { limitText } from "@/lib/utils";
import { resolvePlanForm, type PlanFormInput } from "@/lib/select-contract";

/**
 * PLANOS DO SELECT — cadastro, em Gestão.
 *
 * Quem pode: só GESTAO, conferido no servidor. É cadastro de preço: o valor
 * daqui vira a mensalidade de todo contrato novo.
 *
 * O que NÃO acontece aqui: mexer em contrato já vendido. Cada `SelectContract`
 * carrega o próprio snapshot (`planNameSnapshot`, `monthlyAmount`,
 * `totalAmount`), e é por isso que reajustar um plano ou renomeá-lo não
 * reescreve nada que já foi assinado. Quem edita precisa saber disso, e por
 * isso a tela mostra quantos contratos cada plano tem.
 *
 * A mensalidade gravada é a BASE, sem o Build.Sales — o servidor soma os
 * R$ 67,00 na adesão. Cadastrar o valor já somado cobraria duas vezes.
 */

const MAX_BENEFIT = 200;
const MAX_BENEFITS = 30;

export interface PlanActionInput extends PlanFormInput {
  /** Um texto por benefício, na ordem em que aparecem na tela. */
  benefits: string[];
}

/**
 * Benefícios: aparam, descartam linhas vazias e são CORTADOS no teto (texto
 * descritivo aceita corte, ao contrário do nome do plano, que é identidade).
 */
function normalizeBenefits(raw: string[]): string[] | { error: string } {
  // `limitText` já apara e devolve null para linha vazia — o filtro abaixo
  // descarta justamente as linhas que o usuário adicionou e não preencheu.
  const limpos = raw
    .map((t) => limitText(t, MAX_BENEFIT))
    .filter((t): t is string => t != null);
  if (limpos.length > MAX_BENEFITS) {
    return { error: `No máximo ${MAX_BENEFITS} benefícios por plano.` };
  }
  return limpos;
}

/**
 * Nome já usado por OUTRO plano.
 *
 * Por que recusar: o seed é idempotente POR NOME (`findFirst where name`) e a
 * migration de rename também casou por nome. Dois planos "Rubi" fariam a
 * próxima execução do seed criar um terceiro, e a lista da adesão mostraria
 * dois iguais sem jeito de distinguir.
 */
async function nomeEmUso(name: string, exceptId?: string): Promise<boolean> {
  const existe = await prisma.selectPlan.findFirst({
    where: {
      name: { equals: name, mode: "insensitive" },
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    select: { id: true },
  });
  return existe != null;
}

function revalidar(): void {
  revalidatePath("/gestao");
  // A lista de planos da adesão vem do banco a cada carregamento desta rota.
  revalidatePath("/vendas/novo-select");
}

export async function createSelectPlan(
  input: PlanActionInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    await requireRoleAction(["GESTAO"]);

    const resolvido = resolvePlanForm(input);
    if ("error" in resolvido) return actionError(resolvido.error);
    const benefits = normalizeBenefits(input.benefits);
    if ("error" in benefits) return actionError(benefits.error);

    if (await nomeEmUso(resolvido.plan.name)) {
      return actionError(`Já existe um plano chamado "${resolvido.plan.name}".`);
    }

    // Entra no fim da ordem de exibição. Nunca no meio: a ordem dos planos é
    // a sequência comercial (do mais simples ao mais completo), e um plano
    // novo não tem por que se enfiar entre dois existentes.
    const ultimo = await prisma.selectPlan.aggregate({ _max: { sortOrder: true } });

    const criado = await prisma.selectPlan.create({
      data: {
        ...resolvido.plan,
        monthlyAmount:
          resolvido.plan.monthlyAmount == null
            ? null
            : new Prisma.Decimal(resolvido.plan.monthlyAmount),
        minMonthlyPurchase:
          resolvido.plan.minMonthlyPurchase == null
            ? null
            : new Prisma.Decimal(resolvido.plan.minMonthlyPurchase),
        sortOrder: (ultimo._max.sortOrder ?? 0) + 1,
        benefits: {
          create: benefits.map((text, i) => ({ text, sortOrder: i + 1 })),
        },
      },
      select: { id: true },
    });

    revalidar();
    return actionOk(criado);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao criar o plano.");
  }
}

export async function updateSelectPlan(
  input: PlanActionInput & { id: string },
): Promise<ActionResult<void>> {
  try {
    await requireRoleAction(["GESTAO"]);

    const resolvido = resolvePlanForm(input);
    if ("error" in resolvido) return actionError(resolvido.error);
    const benefits = normalizeBenefits(input.benefits);
    if ("error" in benefits) return actionError(benefits.error);

    if (await nomeEmUso(resolvido.plan.name, input.id)) {
      return actionError(`Já existe um plano chamado "${resolvido.plan.name}".`);
    }

    await prisma.$transaction(async (tx) => {
      const atual = await tx.selectPlan.findUnique({
        where: { id: input.id },
        select: { id: true },
      });
      if (!atual) throw new Error("Plano não encontrado.");

      await tx.selectPlan.update({
        where: { id: input.id },
        data: {
          ...resolvido.plan,
          monthlyAmount:
            resolvido.plan.monthlyAmount == null
              ? null
              : new Prisma.Decimal(resolvido.plan.monthlyAmount),
          minMonthlyPurchase:
            resolvido.plan.minMonthlyPurchase == null
              ? null
              : new Prisma.Decimal(resolvido.plan.minMonthlyPurchase),
        },
      });

      // Benefícios são substituídos por inteiro, e não casados um a um: a
      // tela manda a lista final, com a ordem já resolvida por quem arrastou
      // as linhas. Casar por id exigiria a tela carregar ids de benefício só
      // para reenviá-los, e um reenvio incompleto deixaria órfãos.
      await tx.selectPlanBenefit.deleteMany({ where: { planId: input.id } });
      if (benefits.length > 0) {
        await tx.selectPlanBenefit.createMany({
          data: benefits.map((text, i) => ({
            planId: input.id,
            text,
            sortOrder: i + 1,
          })),
        });
      }
    });

    revalidar();
    return actionOk(undefined);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao salvar o plano.");
  }
}

/**
 * Ativa / desativa. Desativar é a forma certa de retirar um plano de
 * circulação: ele some da lista da adesão (`where active`) e os contratos já
 * vendidos nele seguem intactos.
 */
export async function toggleSelectPlan(
  id: string,
  active: boolean,
): Promise<ActionResult<void>> {
  try {
    await requireRoleAction(["GESTAO"]);
    await prisma.selectPlan.update({ where: { id }, data: { active } });
    revalidar();
    return actionOk(undefined);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao alterar o plano.");
  }
}

/**
 * Exclui — somente plano SEM contrato.
 *
 * `SelectContract.planId` é FK obrigatória: sem esta checagem o Prisma estoura
 * um erro de restrição cru na cara de quem clicou. E apagar o plano de um
 * contrato vendido tiraria do Financeiro a referência do que foi vendido,
 * mesmo com o snapshot do nome preservado.
 */
export async function deleteSelectPlan(id: string): Promise<ActionResult<void>> {
  try {
    await requireRoleAction(["GESTAO"]);

    const contratos = await prisma.selectContract.count({ where: { planId: id } });
    if (contratos > 0) {
      return actionError(
        `Não é possível excluir: ${contratos} contrato(s) neste plano. Desative em vez de excluir.`,
      );
    }

    // Os benefícios caem com o plano (onDelete: Cascade no schema).
    await prisma.selectPlan.delete({ where: { id } });
    revalidar();
    return actionOk(undefined);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao excluir o plano.");
  }
}
