"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRoleAction } from "@/lib/auth";
import { actionOk, actionError, type ActionResult } from "@/types/action";
import { canCompleteStep, canUndoStep } from "@/lib/select-roadmap";

/**
 * AVANÇO DO ROADMAP DE ENTREGA — o clique que marca uma etapa concluída.
 *
 * Arquivo próprio pelo mesmo motivo de `select-finance.ts`: `selects.ts` já
 * tem a adesão, a troca e o cancelamento, e entrega de benefício é outro
 * assunto.
 *
 * A ORDEM é a regra de pré-requisito (requisito 2.2): não se conclui a etapa N
 * com a N-1 pendente, e não se desfaz a N com a N+1 concluída. As duas guardas
 * são a mesma invariante — "nenhuma concluída depois de uma pendente" — vista
 * dos dois lados, e as duas vivem AQUI, no servidor. A tela desabilita o botão
 * por conveniência; isso não é a guarda.
 *
 * CONTRATO CANCELADO NÃO SE MEXE. Cancelar é o fim da linha ("um Select
 * cancelado não volta atrás"), e registrar entrega depois disso criaria
 * histórico de uma entrega que o contrato não mais prevê.
 */
export async function setSelectStepDone(input: {
  stepId: string;
  done: boolean;
}): Promise<ActionResult<void>> {
  try {
    const session = await requireRoleAction(["FINANCEIRO", "GESTAO"]);

    // Limite de confiança: chega o que o navegador mandou. `stepId` não-texto
    // recebe a mesma resposta de etapa inexistente.
    const stepId = typeof input?.stepId === "string" ? input.stepId : "";
    if (!stepId) return actionError("Etapa não encontrada.");
    const done = input?.done === true;

    const etapa = await prisma.selectContractStep.findUnique({
      where: { id: stepId },
      select: {
        id: true,
        sortOrder: true,
        contractId: true,
        contract: { select: { status: true } },
      },
    });
    if (!etapa) return actionError("Etapa não encontrada.");
    if (etapa.contract.status === "CANCELADO") {
      return actionError("Este Select foi cancelado: a régua de entrega não se altera.");
    }

    // A régua inteira, lida junto, porque a decisão é sobre a VIZINHANÇA da
    // etapa e não sobre ela sozinha.
    const regua = await prisma.selectContractStep.findMany({
      where: { contractId: etapa.contractId },
      orderBy: { sortOrder: "asc" },
      select: { sortOrder: true, doneAt: true },
    });
    const estados = regua.map((e) => ({ sortOrder: e.sortOrder, done: e.doneAt != null }));

    if (done && !canCompleteStep(estados, etapa.sortOrder)) {
      return actionError("Conclua a etapa anterior antes desta.");
    }
    if (!done && !canUndoStep(estados, etapa.sortOrder)) {
      return actionError("Desfaça a etapa seguinte antes desta.");
    }

    await prisma.selectContractStep.update({
      where: { id: etapa.id },
      data: done
        ? { doneAt: new Date(), doneById: session.userId }
        : { doneAt: null, doneById: null },
    });

    revalidatePath(`/financeiro/select/${etapa.contractId}`);
    return actionOk(undefined);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao atualizar a etapa.");
  }
}
