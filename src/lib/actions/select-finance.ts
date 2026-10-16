"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRoleAction } from "@/lib/auth";
import {
  processAndSaveImage,
  saveDocument,
  isPdfDataUrl,
  deleteUploadedFile,
  validateUploadDataUrl,
} from "@/lib/image";
import { actionOk, actionError, type ActionResult } from "@/types/action";
import { limitText } from "@/lib/utils";
import { parseDayUTC, dayUTC, money, allocatePayment, parseMoney } from "@/lib/select-contract";

/**
 * SELECT — ações financeiras sobre as parcelas.
 *
 * Quem pode: FINANCEIRO e GESTÃO, verificado no servidor.
 *
 * Pagamento PARCIAL é a regra, não a exceção: uma parcela recebe N pagamentos,
 * e `SelectInstallment.paidAmount` é a soma dos não revertidos, reescrita
 * dentro da mesma transação de todo pagamento e de toda reversão. Reverter
 * NÃO apaga o pagamento — marca `reversedAt`, para a auditoria enxergar o
 * engano e a correção, em vez de um buraco.
 */

const PERFIS = ["FINANCEIRO", "GESTAO"] as const;

/** Teto dos campos de texto livre (observacao e motivo). Colunas TEXT nao
 *  tem limite proprio, e nenhuma observacao de parcela precisa de mais. */
const MAX_TEXTO = 500;

/**
 * Recalcula `paidAmount` e o status da parcela a partir dos pagamentos vivos.
 * Roda sempre dentro da transação de quem a chamou: o denormalizado não pode
 * sobreviver um instante que seja fora de sincronia com SelectPayment.
 */
async function resyncInstallment(
  tx: Prisma.TransactionClient,
  installmentId: string,
  actorId: string,
): Promise<void> {
  const inst = await tx.selectInstallment.findUnique({
    where: { id: installmentId },
    select: { id: true, amount: true, status: true },
  });
  if (!inst) throw new Error("Parcela não encontrada.");

  const soma = await tx.selectPayment.aggregate({
    where: { installmentId, reversedAt: null },
    _sum: { amount: true },
  });
  const pago = money(Number(soma._sum.amount ?? 0));
  const valor = Number(inst.amount);
  const quitada = pago >= valor;

  await tx.selectInstallment.update({
    where: { id: installmentId },
    data: {
      paidAmount: new Prisma.Decimal(pago),
      // Parcela CANCELADA não é ressuscitada por um pagamento: cancelar é
      // decisão de contrato, e desfazê-la é outra operação.
      status: inst.status === "CANCELADA" ? "CANCELADA" : quitada ? "PAGA" : "PENDENTE",
      settledAt: inst.status === "CANCELADA" ? null : quitada ? new Date() : null,
      updatedById: actorId,
    },
  });
}

function revalidateDetail(contractId: string) {
  revalidatePath("/financeiro/select");
  revalidatePath(`/financeiro/select/${contractId}`);
}

async function contractIdOf(installmentId: string): Promise<string> {
  const i = await prisma.selectInstallment.findUnique({
    where: { id: installmentId },
    select: { contractId: true },
  });
  return i?.contractId ?? "";
}

// ---------------------------------------------------------------------------
// Pagamento
// ---------------------------------------------------------------------------

export interface RegisterPaymentInput {
  installmentId: string;
  /** "aaaa-mm-dd". */
  paidAt: string;
  /** "1.297,50" ou "1297.50". */
  amount: string;
  paymentMethodId?: string;
  bankId?: string;
  cnpjId?: string;
  /** data:...;base64,... — imagem ou PDF. Opcional. */
  proofBase64?: string;
  note?: string;
}

export interface RegisterPaymentResult {
  /** Uma entrada por parcela que recebeu dinheiro deste lançamento. */
  allocations: { number: number; amount: number; settled: boolean }[];
  /** Quanto desceu para parcelas posteriores à escolhida. */
  advancedAmount: number;
}

/**
 * Registra um pagamento de uma parcela, derramando o excedente nas seguintes.
 *
 * A cliente que paga R$ 700 numa mensalidade de R$ 500 quita a parcela e
 * adianta R$ 200 da próxima: um lançamento, duas linhas, ligadas pelo
 * `batchId`. O rateio é de `allocatePayment` — a mesma função coberta pelas
 * checagens, e não uma segunda conta escrita aqui.
 *
 * Pagar mais do que há para cobrar recusa o lançamento INTEIRO, em vez de
 * gravar o pedaço que coube: meio pagamento registrado é pior que nenhum.
 */
export async function registerSelectPayment(
  input: RegisterPaymentInput,
): Promise<ActionResult<RegisterPaymentResult>> {
  let arquivoSalvo: string | null = null;
  try {
    const session = await requireRoleAction([...PERFIS]);

    const paidAt = parseDayUTC(input.paidAt);
    if (!paidAt) return actionError("Data do pagamento inválida.");
    if (paidAt.getTime() > dayUTC().getTime()) {
      return actionError("A data do pagamento não pode ser futura.");
    }

    const valor = parseMoney(input.amount);
    if (valor == null || valor <= 0) return actionError("Informe o valor pago (maior que zero).");

    const inst = await prisma.selectInstallment.findUnique({
      where: { id: input.installmentId },
      select: { id: true, contractId: true, status: true },
    });
    if (!inst) return actionError("Parcela não encontrada.");
    if (inst.status === "CANCELADA") return actionError("Esta parcela está cancelada.");

    // Todas as parcelas do contrato: o rateio precisa enxergar as seguintes.
    const todas = await prisma.selectInstallment.findMany({
      where: { contractId: inst.contractId },
      select: { id: true, number: true, amount: true, paidAmount: true, status: true },
      orderBy: { number: "asc" },
    });

    const rateio = allocatePayment({
      amount: valor,
      targetId: inst.id,
      installments: todas.map((i) => ({
        id: i.id, number: i.number,
        amount: Number(i.amount), paidAmount: Number(i.paidAmount),
        status: i.status,
      })),
    });

    if (rateio.capacity <= 0) return actionError("Esta parcela já está quitada e não há parcela seguinte em aberto.");
    if (rateio.leftover > 0) {
      return actionError(
        `O valor passa do que há para cobrar a partir desta parcela ` +
          `(máximo R$ ${rateio.capacity.toFixed(2).replace(".", ",")}, somando as parcelas seguintes em aberto).`,
      );
    }

    // Comprovante: mesma trilha dos comprovantes de pedido (imagem vira .webp,
    // PDF vai direto ao disco; no banco fica só o caminho). É UM comprovante
    // para o lançamento inteiro, então todas as linhas do lote apontam para
    // ele — foi uma transferência só.
    if (input.proofBase64) {
      const raw = input.proofBase64.replace(/^data:[^;]+;base64,/, "");
      const buffer = Buffer.from(raw, "base64");
      // Tamanho, MIME declarado e MAGIC BYTES. O `accept=` do campo na tela não
      // é controle: o formato é decidido aqui, antes de o arquivo alcançar o
      // sharp. Sem isto, um SVG chega ao librsvg (CVE-2026-96889).
      const invalido = validateUploadDataUrl(input.proofBase64, buffer);
      if (invalido) return actionError(invalido);
      const nome = `${inst.id}_selectPayment_${Date.now()}`;
      const processed = isPdfDataUrl(input.proofBase64)
        ? await saveDocument(buffer, { folder: "select-pagamentos", fileName: nome })
        : await processAndSaveImage(buffer, { folder: "select-pagamentos", fileName: nome });
      arquivoSalvo = processed.filePath;
    }

    // Só vira lote quando de fato atravessou parcelas; pagamento que coube
    // numa só continua com batchId null.
    const batchId = rateio.allocations.length > 1 ? randomUUID() : null;
    const alvoNumero = todas.find((i) => i.id === inst.id)?.number ?? 0;

    const res = await prisma.$transaction(async (tx) => {
      for (const a of rateio.allocations) {
        await tx.selectPayment.create({
          data: {
            installmentId: a.installmentId,
            paidAt,
            amount: new Prisma.Decimal(a.amount),
            paymentMethodId: input.paymentMethodId || null,
            bankId: input.bankId || null,
            cnpjId: input.cnpjId || null,
            proofPath: arquivoSalvo,
            note: limitText(input.note, MAX_TEXTO),
            batchId,
            createdById: session.userId,
          },
        });
        await resyncInstallment(tx, a.installmentId, session.userId);
      }

      const atualizadas = await tx.selectInstallment.findMany({
        where: { id: { in: rateio.allocations.map((a) => a.installmentId) } },
        select: { id: true, number: true, status: true },
      });

      return {
        allocations: rateio.allocations.map((a) => ({
          number: a.number,
          amount: a.amount,
          settled: atualizadas.find((u) => u.id === a.installmentId)?.status === "PAGA",
        })),
        advancedAmount: money(
          rateio.allocations.filter((a) => a.number > alvoNumero).reduce((s, a) => s + a.amount, 0),
        ),
      };
    });

    revalidateDetail(inst.contractId);
    return actionOk(res);
  } catch (err) {
    // O arquivo é gravado antes da transação; se ela falhar, ele não pode
    // ficar órfão no disco apontado por ninguém.
    if (arquivoSalvo) await deleteUploadedFile(arquivoSalvo).catch(() => {});
    return actionError(err instanceof Error ? err.message : "Erro ao registrar o pagamento.");
  }
}

/**
 * Reverte um pagamento lançado por engano. A linha permanece, marcada.
 *
 * Quando o pagamento faz parte de um lote (um valor que atravessou parcelas),
 * reverte o LOTE INTEIRO: foi uma transferência só, e desfazer metade dela
 * deixaria o adiantamento de pé sem o pagamento que o originou.
 */
export async function reverseSelectPayment(args: {
  paymentId: string;
  reason: string;
}): Promise<ActionResult<{ reverted: number }>> {
  try {
    const session = await requireRoleAction([...PERFIS]);
    const reason = limitText(args.reason, MAX_TEXTO);
    if (!reason) return actionError("Informe o motivo da reversão.");

    const pag = await prisma.selectPayment.findUnique({
      where: { id: args.paymentId },
      select: { id: true, installmentId: true, reversedAt: true, batchId: true },
    });
    if (!pag) return actionError("Pagamento não encontrado.");
    if (pag.reversedAt) return actionError("Este pagamento já foi revertido.");

    const irmaos = pag.batchId
      ? await prisma.selectPayment.findMany({
          where: { batchId: pag.batchId, reversedAt: null },
          select: { id: true, installmentId: true },
        })
      : [{ id: pag.id, installmentId: pag.installmentId }];

    await prisma.$transaction(async (tx) => {
      await tx.selectPayment.updateMany({
        where: { id: { in: irmaos.map((p) => p.id) } },
        data: { reversedAt: new Date(), reversedById: session.userId, reversalReason: reason },
      });
      for (const parcela of new Set(irmaos.map((p) => p.installmentId))) {
        await resyncInstallment(tx, parcela, session.userId);
      }
    });

    revalidateDetail(await contractIdOf(pag.installmentId));
    return actionOk({ reverted: irmaos.length });
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao reverter o pagamento.");
  }
}

/** Cancela uma parcela (deixa de ser devida). Não mexe no que já foi pago. */
export async function cancelSelectInstallment(args: {
  installmentId: string;
  reason: string;
}): Promise<ActionResult<void>> {
  try {
    const session = await requireRoleAction([...PERFIS]);
    const reason = limitText(args.reason, MAX_TEXTO);
    if (!reason) return actionError("Informe o motivo do cancelamento.");

    const inst = await prisma.selectInstallment.findUnique({
      where: { id: args.installmentId },
      select: { id: true, contractId: true, status: true, note: true },
    });
    if (!inst) return actionError("Parcela não encontrada.");
    if (inst.status === "CANCELADA") return actionError("Esta parcela já está cancelada.");
    if (inst.status === "PAGA") return actionError("Parcela paga não é cancelada. Reverta o pagamento antes.");

    const carimbo = `[cancelada] ${reason}`;
    await prisma.selectInstallment.update({
      where: { id: inst.id },
      data: {
        status: "CANCELADA",
        settledAt: null,
        note: inst.note ? `${inst.note}\n${carimbo}` : carimbo,
        updatedById: session.userId,
      },
    });

    revalidateDetail(inst.contractId);
    return actionOk(undefined);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao cancelar a parcela.");
  }
}

/** Grava a observação livre de uma parcela. */
export async function setSelectInstallmentNote(args: {
  installmentId: string;
  note: string;
}): Promise<ActionResult<void>> {
  try {
    const session = await requireRoleAction([...PERFIS]);
    const inst = await prisma.selectInstallment.findUnique({
      where: { id: args.installmentId },
      select: { id: true, contractId: true },
    });
    if (!inst) return actionError("Parcela não encontrada.");

    await prisma.selectInstallment.update({
      where: { id: inst.id },
      data: { note: limitText(args.note, MAX_TEXTO), updatedById: session.userId },
    });

    revalidateDetail(inst.contractId);
    return actionOk(undefined);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao salvar a observação.");
  }
}
