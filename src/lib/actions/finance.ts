"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRoleAction } from "@/lib/auth";
import { processAndSaveImage, saveDocument, isPdfDataUrl, deleteUploadedFile } from "@/lib/image";
import { actionOk, actionError, type ActionResult } from "@/types/action";
import { PENDING_PAYMENT_STATUS_NAME, PAYMENT_CONFIRMED_NOTE } from "@/lib/finance-constants";
import { emitOrderUpdated } from "@/lib/realtime/emit";
import { sendPushToUser } from "@/lib/push";
import { isDoacao } from "@/lib/validations/order";
import type { PaymentDisposition } from "@prisma/client";

/**
 * Financeiro define o BANCO e a FORMA DE PAGAMENTO do pedido.
 * Esses campos sairam do formulario de Vendas e agora sao preenchidos aqui,
 * na Analise de Pedidos. Sao pre-requisito para aprovar (ver auditOrder).
 */
export async function setOrderPaymentInfo(args: {
  orderId: string;
  paymentMethodId: string;
  bankId: string;
}): Promise<ActionResult<void>> {
  try {
    await requireRoleAction(["FINANCEIRO", "GESTAO"]);
    if (!args.paymentMethodId) return actionError("Selecione a forma de pagamento.");
    if (!args.bankId) return actionError("Selecione o banco.");

    const order = await prisma.order.findUnique({ where: { id: args.orderId } });
    if (!order) return actionError("Pedido não encontrado.");

    await prisma.order.update({
      where: { id: args.orderId },
      data: { paymentMethodId: args.paymentMethodId, bankId: args.bankId },
    });

    revalidatePath("/financeiro");
    revalidatePath("/fluxo");
    return actionOk(undefined);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao salvar dados de pagamento.");
  }
}

/**
 * Financeiro anexa o SEGUNDO comprovante de pagamento.
 * Regra do projeto: a imagem NUNCA vai para o banco. O Sharp converte para
 * .webp e grava no disco; no banco fica apenas a string do caminho.
 */
export async function uploadSecondPaymentProof(args: {
  orderId: string;
  // Um ou varios comprovantes (ate 5) em data URL base64.
  base64?: string;
  base64List?: string[];
}): Promise<ActionResult<{ count: number; created: { id: string; filePath: string }[] }>> {
  try {
    await requireRoleAction(["FINANCEIRO", "GESTAO"]);
    if (!args.orderId) return actionError("Pedido não informado.");

    // Aceita tanto o formato antigo (base64 unico) quanto a lista.
    const entradas = (args.base64List ?? (args.base64 ? [args.base64] : []))
      .filter(Boolean)
      .slice(0, 5);
    if (entradas.length === 0) return actionError("Arquivo obrigatório.");

    const order = await prisma.order.findUnique({
      where: { id: args.orderId },
      include: { financeProofs: true },
    });
    if (!order) return actionError("Pedido não encontrado.");

    // Respeita o teto de 5 no total (ja anexados + novos).
    const espacoLivre = 5 - order.financeProofs.length;
    if (espacoLivre <= 0) return actionError("Limite de 5 comprovantes atingido.");
    const aProcessar = entradas.slice(0, espacoLivre);

    let salvos = 0;
    const created: { id: string; filePath: string }[] = [];
    for (const [i, dataUrl] of aProcessar.entries()) {
      const raw = dataUrl.replace(/^data:[^;]+;base64,/, "");
      const buffer = Buffer.from(raw, "base64");
      if (buffer.length === 0) continue;
      if (buffer.length > 15 * 1024 * 1024) {
        return actionError("Arquivo muito grande (máx. 15MB).");
      }
      // Comprovante de pagamento aceita imagem OU PDF. PDF vai direto ao disco
      // (sem sharp); imagem passa pelo pipeline .webp. No banco, so o caminho.
      const processed = isPdfDataUrl(dataUrl)
        ? await saveDocument(buffer, {
            folder: "comprovantes-pagamento",
            fileName: `${order.id}_financeProof_${order.financeProofs.length + i + 1}_${Date.now()}`,
          })
        : await processAndSaveImage(buffer, {
            folder: "comprovantes-pagamento",
            fileName: `${order.id}_financeProof_${order.financeProofs.length + i + 1}_${Date.now()}`,
          });
      const rec = await prisma.orderFinanceProof.create({
        data: {
          orderId: order.id,
          filePath: processed.filePath,
          width: processed.width,
          height: processed.height,
          sizeBytes: processed.sizeBytes,
        },
        select: { id: true, filePath: true },
      });
      created.push(rec);
      // Espelha o PRIMEIRO comprovante em paymentProof2Path (trava de aprovacao).
      if (order.financeProofs.length === 0 && i === 0) {
        await prisma.order.update({
          where: { id: order.id },
          data: { paymentProof2Path: processed.filePath },
        });
      }
      salvos++;
    }

    if (salvos === 0) return actionError("Nenhum comprovante válido para anexar.");

    revalidatePath("/financeiro");
    revalidatePath("/fluxo");
    return actionOk({ count: salvos, created });
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao anexar comprovante.");
  }
}

/**
 * Remove UM comprovante do Financeiro (2o comprovante) pelo id.
 * - Apaga o registro OrderFinanceProof e o arquivo fisico do disco.
 * - Se o removido era o espelhado em Order.paymentProof2Path (a trava de
 *   aprovacao), re-aponta para o comprovante mais antigo restante — ou null se
 *   nao sobrar nenhum. Assim a regra de "precisa de ao menos 1" continua valida.
 */
export async function deleteSecondPaymentProof(args: {
  proofId: string;
}): Promise<ActionResult<{ remaining: number }>> {
  try {
    await requireRoleAction(["FINANCEIRO", "GESTAO"]);
    if (!args.proofId) return actionError("Comprovante não informado.");

    const proof = await prisma.orderFinanceProof.findUnique({
      where: { id: args.proofId },
    });
    if (!proof) return actionError("Comprovante não encontrado.");

    const order = await prisma.order.findUnique({
      where: { id: proof.orderId },
      include: { financeProofs: { orderBy: { createdAt: "asc" } } },
    });
    if (!order) return actionError("Pedido não encontrado.");

    // Comprovantes que sobram apos remover este.
    const restantes = order.financeProofs.filter((p) => p.id !== proof.id);
    // O espelho (paymentProof2Path) precisa apontar para um arquivo valido.
    const eraEspelho = order.paymentProof2Path === proof.filePath;
    const novoEspelho = eraEspelho ? (restantes[0]?.filePath ?? null) : order.paymentProof2Path;

    await prisma.$transaction(async (tx) => {
      await tx.orderFinanceProof.delete({ where: { id: proof.id } });
      if (eraEspelho) {
        await tx.order.update({
          where: { id: order.id },
          data: { paymentProof2Path: novoEspelho },
        });
      }
    });

    // Remove o arquivo fisico apos o commit (nao bloqueia o fluxo se falhar).
    await deleteUploadedFile(proof.filePath);

    revalidatePath("/financeiro");
    revalidatePath("/fluxo");
    return actionOk({ remaining: restantes.length });
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao remover comprovante.");
  }
}

/**
 * Financeiro audita o pedido: define numero da comanda + status de pagamento.
 *
 * Regra do doc:
 *  - status com disposicao APROVA (Pago, Liberado, Transferencia, Troca)
 *    -> baixa estoque, cria entrega e manda p/ Logistica (AGUARDANDO_IMPRESSAO).
 *  - status com disposicao INTERROMPE (Estorno, Estorno Parcial, Cancelado)
 *    -> interrompe o fluxo (status do pedido vira o de excecao).
 *
 * Tudo em transacao: faturar + baixar estoque dependem um do outro.
 */
export async function auditOrder(args: {
  orderId: string;
  comandaNumber: string;
  paymentStatusId?: string;
}): Promise<ActionResult<{ status: string }>> {
  try {
    const session = await requireRoleAction(["FINANCEIRO", "GESTAO"]);

    const result = await prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: args.orderId },
        include: { orderType: { select: { name: true } } },
      });
      if (!order) throw new Error("Pedido nao encontrado.");
      if (order.status !== "EM_ANALISE") {
        throw new Error("Pedido nao esta em analise.");
      }

      // Doação: passa pelo Financeiro, mas dispensa CNPJ, forma de pagamento,
      // banco e comprovante. O Financeiro vê os dados básicos e aprova direto
      // (sem status de pagamento).
      const doacao = isDoacao(order.orderType?.name);

      if (doacao) {
        if (!args.comandaNumber?.trim()) {
          throw new Error("Informe o Nº da Comanda para aprovar.");
        }
        await tx.order.update({
          where: { id: order.id },
          data: {
            comandaNumber: args.comandaNumber,
            status: "AGUARDANDO_IMPRESSAO",
          },
        });
        await tx.orderStatusHistory.create({
          data: { orderId: order.id, status: "AGUARDANDO_IMPRESSAO", changedBy: session.userId, note: "Aprovado: Doação" },
        });
        await tx.delivery.create({
          data: { orderId: order.id, status: "AGUARDANDO" },
        });
        return { status: "AGUARDANDO_IMPRESSAO" };
      }

      if (!args.paymentStatusId) throw new Error("Selecione o status de pagamento.");
      const payStatus = await tx.paymentStatusOption.findUnique({
        where: { id: args.paymentStatusId },
      });
      if (!payStatus) throw new Error("Status de pagamento invalido.");

      // Regras de APROVACAO (disposicao APROVA, ex.: "Pago"):
      // o pedido so e liberado com todos os dados do Financeiro preenchidos.
      if (payStatus.disposition === "APROVA") {
        if (!order.cnpjId) {
          throw new Error("Vincule um CNPJ ao pedido antes de aprovar.");
        }
        if (!order.paymentMethodId) {
          throw new Error("Informe a Forma de Pagamento antes de aprovar.");
        }
        if (!order.bankId) {
          throw new Error("Informe o Banco antes de aprovar.");
        }
        if (!order.paymentProof2Path) {
          throw new Error("Anexe o segundo comprovante de pagamento antes de aprovar.");
        }
      }

      // Caminho de excecao: interrompe o fluxo.
      if (payStatus.disposition === "INTERROMPE") {
        const exceptionStatus =
          payStatus.name.toLowerCase().includes("parcial")
            ? "ESTORNO_PARCIAL"
            : payStatus.name.toLowerCase().includes("cancel")
              ? "CANCELADO"
              : "ESTORNO";

        await tx.order.update({
          where: { id: order.id },
          data: {
            comandaNumber: args.comandaNumber,
            paymentStatusId: args.paymentStatusId,
            status: exceptionStatus,
          },
        });
        await tx.orderStatusHistory.create({
          data: { orderId: order.id, status: exceptionStatus, changedBy: session.userId, note: payStatus.name },
        });
        return { status: exceptionStatus };
      }

      // Caminho de aprovacao: libera para a logistica.
      await tx.order.update({
        where: { id: order.id },
        data: {
          comandaNumber: args.comandaNumber,
          paymentStatusId: args.paymentStatusId,
          status: "AGUARDANDO_IMPRESSAO",
        },
      });
      await tx.orderStatusHistory.create({
        data: { orderId: order.id, status: "AGUARDANDO_IMPRESSAO", changedBy: session.userId, note: `Aprovado: ${payStatus.name}` },
      });
      await tx.delivery.create({
        data: { orderId: order.id, status: "AGUARDANDO" },
      });

      return { status: "AGUARDANDO_IMPRESSAO" };
    });

    revalidatePath("/financeiro");
    revalidatePath("/logistica");
    revalidatePath("/dashboard");
    emitOrderUpdated({ orderId: args.orderId, status: result.status });
    return actionOk(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro ao auditar pedido.";
    return actionError(msg);
  }
}

// ===========================================================================
// FLUXO SIMPLIFICADO (Loja de Origem): botao "Pago" do Financeiro.
// Move EM_ANALISE -> PAGO. So exige comprovante de pagamento (sem NF, CNPJ,
// forma de pagamento, banco ou comanda). Nao cria Delivery (o fluxo
// simplificado nao tem fase de motorista; Embalado/Entregue sao operados
// por quem tem a loja atrelada).
// ===========================================================================
export async function markOrderPaid(orderId: string): Promise<ActionResult<{ status: string }>> {
  try {
    const session = await requireRoleAction(["FINANCEIRO", "GESTAO"]);

    const result = await prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: {
          originStore: { select: { simplifiedFlow: true } },
          _count: { select: { paymentProofs: true } },
        },
      });
      if (!order) throw new Error("Pedido nao encontrado.");
      if (!order.originStore?.simplifiedFlow) {
        throw new Error("Este pedido nao usa o fluxo simplificado.");
      }
      if (order.status !== "EM_ANALISE") {
        throw new Error("Pedido nao esta em analise.");
      }
      // Comprovante obrigatorio (mirror ou tabela).
      const temComprovante = order.paymentProofPath != null || order._count.paymentProofs > 0;
      if (!temComprovante) {
        throw new Error("Anexe o comprovante de pagamento antes de marcar como Pago.");
      }

      await tx.order.update({
        where: { id: order.id },
        data: { status: "PAGO" },
      });
      await tx.orderStatusHistory.create({
        data: { orderId: order.id, status: "PAGO", changedBy: session.userId, note: "Pago (fluxo simplificado)" },
      });
      return { status: "PAGO" };
    });

    revalidatePath("/financeiro");
    revalidatePath("/fluxo");
    revalidatePath("/logistica");
    revalidatePath("/dashboard");
    emitOrderUpdated({ orderId, status: result.status });
    return actionOk(result);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao marcar como Pago.");
  }
}


// ===========================================================================
// Coluna "Pagamento pendente" — pedidos aprovados com o status de pagamento
// "Liberado (Pendente)" que ainda aguardam a confirmacao do recebimento.
//
// O pedido segue o fluxo normal (ja foi para AGUARDANDO_IMPRESSAO na auditoria).
// Aqui apenas registramos a confirmacao do pagamento SEM alterar o status do
// pedido — usamos o OrderStatusHistory como marcador (sem migration).
//
// As constantes vivem em @/lib/finance-constants porque este arquivo e
// "use server" e so pode exportar funcoes async.
// ===========================================================================

/**
 * Financeiro confirma que o pagamento do pedido "Liberado (Pendente)" caiu.
 * Nao muda o status do pedido (o fluxo ja segue normalmente); apenas grava
 * um marcador no historico, o que faz o card sair da coluna "Pagamento pendente".
 */
export async function confirmPayment(orderId: string): Promise<ActionResult<void>> {
  try {
    const session = await requireRoleAction(["FINANCEIRO", "GESTAO"]);

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { paymentStatus: true },
    });
    if (!order) return actionError("Pedido não encontrado.");
    if (order.paymentStatus?.name !== PENDING_PAYMENT_STATUS_NAME) {
      return actionError("Pedido não está com pagamento pendente.");
    }

    // Idempotente: se ja existe confirmacao, nao duplica.
    const already = await prisma.orderStatusHistory.findFirst({
      where: { orderId, note: PAYMENT_CONFIRMED_NOTE },
    });
    if (already) {
      revalidatePath("/financeiro");
      return actionOk(undefined);
    }

    await prisma.orderStatusHistory.create({
      data: {
        orderId,
        status: order.status, // preserva o status atual do fluxo
        changedBy: session.userId,
        note: PAYMENT_CONFIRMED_NOTE,
      },
    });

    revalidatePath("/financeiro");
    emitOrderUpdated({ orderId, status: order.status });
    return actionOk(undefined);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao confirmar pagamento.");
  }
}

// ===========================================================================
// Ferramentas do Financeiro: Formas de Pagamento, Bancos, Status de Pagamento
// (acesso para FINANCEIRO e GESTAO)
// ===========================================================================

export async function finCreatePaymentMethod(name: string): Promise<ActionResult<void>> {
  try {
    await requireRoleAction(["FINANCEIRO", "GESTAO"]);
    if (!name.trim()) return actionError("Nome obrigatório.");
    await prisma.paymentMethod.create({ data: { name: name.trim() } });
    revalidatePath("/financeiro");
    return actionOk(undefined);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao criar.");
  }
}

export async function finCreateBank(name: string): Promise<ActionResult<void>> {
  try {
    await requireRoleAction(["FINANCEIRO", "GESTAO"]);
    if (!name.trim()) return actionError("Nome obrigatório.");
    await prisma.bank.create({ data: { name: name.trim() } });
    revalidatePath("/financeiro");
    return actionOk(undefined);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao criar.");
  }
}

export async function finCreatePaymentStatus(
  name: string,
  disposition: PaymentDisposition,
): Promise<ActionResult<void>> {
  try {
    await requireRoleAction(["FINANCEIRO", "GESTAO"]);
    if (!name.trim()) return actionError("Nome obrigatório.");
    await prisma.paymentStatusOption.create({ data: { name: name.trim(), disposition } });
    revalidatePath("/financeiro");
    return actionOk(undefined);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao criar.");
  }
}

export async function finToggle(
  entity: "paymentMethod" | "bank" | "paymentStatusOption",
  id: string,
  active: boolean,
): Promise<ActionResult<void>> {
  try {
    await requireRoleAction(["FINANCEIRO", "GESTAO"]);
    await (prisma as any)[entity].update({ where: { id }, data: { active } });
    revalidatePath("/financeiro");
    return actionOk(undefined);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao atualizar.");
  }
}

export async function finRename(
  entity: "paymentMethod" | "bank" | "paymentStatusOption",
  id: string,
  name: string,
): Promise<ActionResult<void>> {
  try {
    await requireRoleAction(["FINANCEIRO", "GESTAO"]);
    if (!name.trim()) return actionError("Nome obrigatório.");
    await (prisma as any)[entity].update({ where: { id }, data: { name: name.trim() } });
    revalidatePath("/financeiro");
    return actionOk(undefined);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao renomear.");
  }
}

export async function finDelete(
  entity: "paymentMethod" | "bank" | "paymentStatusOption",
  id: string,
): Promise<ActionResult<void>> {
  try {
    await requireRoleAction(["FINANCEIRO", "GESTAO"]);
    if (entity !== "bank") {
      const field = entity === "paymentMethod" ? "paymentMethodId" : "paymentStatusId";
      const count = await prisma.order.count({ where: { [field]: id } as any });
      if (count > 0) return actionError(`Não é possível excluir: ${count} pedido(s) vinculado(s). Desative em vez de excluir.`);
    }
    await (prisma as any)[entity].delete({ where: { id } });
    revalidatePath("/financeiro");
    return actionOk(undefined);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao excluir.");
  }
}

/**
 * FINANCEIRO sinaliza uma pendencia ("Atencao") num pedido, descrevendo o
 * problema. O pedido aparece avermelhado em Vendas ate ser resolvido.
 */
export async function flagOrderIssue(args: {
  orderId: string;
  issue: string;
}): Promise<ActionResult<void>> {
  try {
    await requireRoleAction(["FINANCEIRO", "GESTAO"]);
    const texto = args.issue.trim();
    if (!texto) return actionError("Descreva o problema.");
    if (texto.length > 1000) return actionError("Descrição muito longa (máx. 1000).");

    const order = await prisma.order.findUnique({ where: { id: args.orderId } });
    if (!order) return actionError("Pedido não encontrado.");

    await prisma.order.update({
      where: { id: args.orderId },
      data: {
        financeIssue: texto,
        financeIssueAt: new Date(),
        financeIssueResolvedAt: null, // nova pendencia reabre (limpa resolucao anterior)
      },
    });

    // Notifica a vendedora responsável pelo pedido sobre a pendência financeira:
    // registro in-app (bell) + Web Push (chega mesmo com o app fechado).
    try {
      await prisma.notification.create({
        data: {
          userId: order.sellerId,
          orderId: order.id,
          message: `Pendência financeira no pedido ${order.orderNumber}: ${texto}`,
        },
      });
    } catch (e) {
      console.error("[notif] falha ao registrar pendência financeira:", e);
    }
    void sendPushToUser(order.sellerId, {
      title: "Pendência financeira",
      body: `Pedido ${order.orderNumber}: ${texto}`,
      url: "/vendas",
      tag: `order-${order.id}`,
    }).catch((err) => console.error("[push] envio falhou:", err));

    revalidatePath("/financeiro");
    revalidatePath("/vendas");
    revalidatePath("/fluxo");
    return actionOk(undefined);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao sinalizar pendência.");
  }
}
