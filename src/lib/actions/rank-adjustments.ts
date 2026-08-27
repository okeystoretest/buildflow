"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRoleAction } from "@/lib/auth";
import { actionOk, actionError, type ActionResult } from "@/types/action";
import { computeRankData } from "@/lib/rank-data";

/**
 * AJUSTE MANUAL DO RANKING DE VENDAS
 * ---------------------------------------------------------------------------
 * Permite corrigir o valor realizado de um vendedor quando a venda aconteceu
 * mas o pedido não foi registrado na plataforma.
 *
 * O valor digitado SUBSTITUI o consolidado daquele vendedor no período — não
 * soma. Junto dele guardamos `systemAmount` (quanto o sistema calculava no
 * instante do ajuste), para que a tela consiga avisar quando pedidos novos
 * entraram depois e o ajuste ficou defasado.
 *
 * PERFIL: exclusivo de GESTÃO. O dashboard é liberado para VENDAS também, mas
 * deixar a vendedora editar o próprio número realizado é conflito de interesse
 * — o ranking deixaria de ser auditável.
 */

/** Mês/ano válidos? Evita gravar ajuste em período inexistente. */
function periodoValido(month: number, year: number): boolean {
  return (
    Number.isInteger(month) &&
    month >= 1 &&
    month <= 12 &&
    Number.isInteger(year) &&
    year > 2000 &&
    year < 3000
  );
}

/**
 * Cria ou atualiza o ajuste de UM vendedor no período.
 * `amount` chega já normalizado em número (o parse do texto acontece na tela).
 */
export async function setRankAdjustment(args: {
  userId: string;
  month: number;
  year: number;
  amount: number;
  note?: string;
}): Promise<ActionResult<{ amount: number }>> {
  try {
    const session = await requireRoleAction(["GESTAO"]);

    if (!args.userId) return actionError("Vendedor não informado.");
    if (!periodoValido(args.month, args.year)) return actionError("Período inválido.");
    if (!Number.isFinite(args.amount) || args.amount < 0) {
      return actionError("Informe um valor válido (não negativo).");
    }
    // Teto defensivo: o campo é Decimal(12,2).
    if (args.amount > 9_999_999_999) return actionError("Valor acima do limite permitido.");

    const user = await prisma.user.findUnique({
      where: { id: args.userId },
      select: { id: true, name: true },
    });
    if (!user) return actionError("Vendedor não encontrado.");

    // Consolidado ATUAL do vendedor no período — guardado junto do ajuste para
    // permitir detectar defasagem depois.
    const dados = await computeRankData({ month: args.month, year: args.year });
    const linha = dados.rankGeral.find((r) => r.userId === args.userId);
    const systemAmount = linha?.vendidoSistema ?? 0;

    await prisma.rankAdjustment.upsert({
      where: {
        userId_month_year: { userId: args.userId, month: args.month, year: args.year },
      },
      create: {
        userId: args.userId,
        month: args.month,
        year: args.year,
        amount: args.amount,
        systemAmount,
        note: args.note?.trim() || null,
        changedBy: session.userId,
      },
      update: {
        amount: args.amount,
        systemAmount,
        note: args.note?.trim() || null,
        changedBy: session.userId,
      },
    });

    revalidatePath("/dashboard");
    return actionOk({ amount: args.amount });
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao salvar o ajuste.");
  }
}

/**
 * Remove o ajuste de UM vendedor: a linha volta ao valor consolidado.
 */
export async function clearRankAdjustment(args: {
  userId: string;
  month: number;
  year: number;
}): Promise<ActionResult<void>> {
  try {
    await requireRoleAction(["GESTAO"]);
    if (!periodoValido(args.month, args.year)) return actionError("Período inválido.");

    await prisma.rankAdjustment.deleteMany({
      where: { userId: args.userId, month: args.month, year: args.year },
    });

    revalidatePath("/dashboard");
    return actionOk(undefined);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao restaurar o valor.");
  }
}

/**
 * "Restaurar padrão": descarta TODOS os ajustes manuais do período e o quadro
 * volta a exibir apenas os valores consolidados pelo sistema.
 */
export async function clearRankAdjustments(args: {
  month: number;
  year: number;
}): Promise<ActionResult<{ removidos: number }>> {
  try {
    await requireRoleAction(["GESTAO"]);
    if (!periodoValido(args.month, args.year)) return actionError("Período inválido.");

    const { count } = await prisma.rankAdjustment.deleteMany({
      where: { month: args.month, year: args.year },
    });

    revalidatePath("/dashboard");
    return actionOk({ removidos: count });
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao restaurar os valores.");
  }
}
