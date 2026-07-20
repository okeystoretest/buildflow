"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRoleAction } from "@/lib/auth";
import { processAndSaveImage, saveDocument, isPdfDataUrl, validateUpload, deleteUploadedFile } from "@/lib/image";
import { createCustomerSchema, updateCustomerSchema } from "@/lib/validations/order";
import { actionOk, actionError, type ActionResult } from "@/types/action";
import type { OrderStatus } from "@prisma/client";

/** Cadastro de cliente (Vendas/Gestao). */
export async function createCustomer(
  raw: unknown,
): Promise<ActionResult<{ id: string; name: string }>> {
  try {
    await requireRoleAction(["VENDAS", "GESTAO"]);
    const parsed = createCustomerSchema.safeParse(raw);
    if (!parsed.success) {
      return actionError("Dados invalidos.", parsed.error.flatten().fieldErrors);
    }
    const d = parsed.data;
    const exists = await prisma.customer.findUnique({ where: { code: d.code.trim() } });
    if (exists) return actionError("Ja existe um cliente com este codigo.");
    const customer = await prisma.customer.create({
      data: {
        code: d.code.trim(),
        name: d.name,
      },
      select: { id: true, name: true },
    });
    revalidatePath("/vendas/clientes");
    return actionOk(customer);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao cadastrar cliente.");
  }
}

/** Edita um cliente existente. */
export async function updateCustomer(raw: unknown): Promise<ActionResult<void>> {
  try {
    await requireRoleAction(["VENDAS", "GESTAO"]);
    const parsed = updateCustomerSchema.safeParse(raw);
    if (!parsed.success) {
      return actionError("Dados invalidos.", parsed.error.flatten().fieldErrors);
    }
    const d = parsed.data;
    const dup = await prisma.customer.findFirst({
      where: { code: d.code.trim(), NOT: { id: d.id } },
    });
    if (dup) return actionError("Ja existe outro cliente com este codigo.");
    await prisma.customer.update({
      where: { id: d.id },
      data: {
        code: d.code.trim(),
        name: d.name,
      },
    });
    revalidatePath("/vendas/clientes");
    return actionOk(undefined);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao editar cliente.");
  }
}

/** Exclui um cliente (bloqueia se houver pedidos vinculados). */
export async function deleteCustomer(id: string): Promise<ActionResult<void>> {
  try {
    await requireRoleAction(["VENDAS", "GESTAO"]);
    const count = await prisma.order.count({ where: { customerId: id } });
    if (count > 0) {
      return actionError(`Não é possível excluir: cliente possui ${count} pedido(s) vinculado(s).`);
    }
    await prisma.customer.delete({ where: { id } });
    revalidatePath("/vendas/clientes");
    return actionOk(undefined);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao excluir cliente.");
  }
}

/** Upload do comprovante de pagamento (imagem -> webp, so caminho no banco). */
export async function uploadPaymentProof(
  formData: FormData,
): Promise<ActionResult<{ filePath: string }>> {
  return uploadOrderFile(formData, "paymentProofPath", "comprovantes-pagamento");
}

/**
 * Upload da Nota Fiscal. So permitido apos o status EMBALADO (regra do doc).
 */
export async function uploadInvoice(
  formData: FormData,
): Promise<ActionResult<{ filePath: string }>> {
  const orderId = String(formData.get("orderId") ?? "");
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return actionError("Pedido nao encontrado.");

  // EMBALADO em diante libera a NF.
  const liberados = ["EMBALADO", "PROCESSANDO", "PROCESSADO", "ENVIADO", "EM_ROTA", "ENTREGUE", "CONCLUIDO"];
  if (!liberados.includes(order.status)) {
    return actionError("Nota Fiscal so pode ser anexada a partir do status Embalado.");
  }
  return uploadOrderFile(formData, "invoicePath", "notas-fiscais");
}

/**
 * Upload da Nota Fiscal a partir do Fluxo/Logística, clicando na comanda.
 *
 * Aceita IMAGEM (jpg/png/heic/webp) ou PDF:
 *  - Imagem -> sharp converte para .webp (economiza disco da VPS).
 *  - PDF    -> salvo como esta (o sharp nao processa PDF; converter perderia
 *              o documento). Em ambos os casos, no banco vai so o CAMINHO.
 *
 * Permitido a qualquer momento após a confirmação do pagamento (comanda gerada).
 */
export async function uploadInvoiceBase64(args: {
  orderId: string;
  base64: string;
}): Promise<ActionResult<{ filePath: string }>> {
  try {
    await requireRoleAction(["GESTAO", "VENDAS", "FINANCEIRO", "LOGISTICA"]);
    if (!args.orderId) return actionError("Pedido não informado.");
    if (!args.base64) return actionError("Arquivo obrigatório.");

    const order = await prisma.order.findUnique({ where: { id: args.orderId } });
    if (!order) return actionError("Pedido não encontrado.");
    // "Após confirmação do pagamento" = comanda já gerada pelo Financeiro.
    if (!order.comandaNumber) {
      return actionError("A Nota Fiscal só pode ser anexada após a confirmação do pagamento.");
    }

    // Detecta o tipo ANTES de remover o prefixo "data:...;base64,".
    const ehPdf = isPdfDataUrl(args.base64);

    const raw = args.base64.replace(/^data:[^;]+;base64,/, "");
    const buffer = Buffer.from(raw, "base64");
    if (buffer.length === 0) return actionError("Arquivo inválido.");
    if (buffer.length > 15 * 1024 * 1024) return actionError("Arquivo muito grande (máx. 15MB).");

    const fileName = `${order.id}_invoicePath_${Date.now()}`;
    const processed = ehPdf
      ? await saveDocument(buffer, { folder: "notas-fiscais", fileName })
      : await processAndSaveImage(buffer, { folder: "notas-fiscais", fileName });

    await prisma.order.update({
      where: { id: order.id },
      data: { invoicePath: processed.filePath },
    });

    revalidatePath("/fluxo");
    revalidatePath("/logistica");
    revalidatePath("/vendas");
    return actionOk({ filePath: processed.filePath });
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao anexar Nota Fiscal.");
  }
}

/**
 * Remove a Nota Fiscal anexada ao pedido (botao "x"), liberando o campo para
 * um novo envio. Apaga o arquivo do disco e limpa Order.invoicePath.
 *
 * Trava de seguranca: a NF e pre-requisito para o pedido avancar de
 * PROCESSANDO. Se o pedido ja passou dessa etapa, remover deixaria o fluxo
 * inconsistente — entao so permitimos a troca ate PROCESSANDO/PROCESSADO.
 */
export async function removeInvoice(args: {
  orderId: string;
}): Promise<ActionResult<void>> {
  try {
    await requireRoleAction(["GESTAO", "VENDAS", "FINANCEIRO", "LOGISTICA"]);
    if (!args.orderId) return actionError("Pedido não informado.");

    const order = await prisma.order.findUnique({ where: { id: args.orderId } });
    if (!order) return actionError("Pedido não encontrado.");
    if (!order.invoicePath) return actionError("Não há Nota Fiscal anexada.");

    // Etapas em que ainda e seguro trocar a NF.
    const podeTrocar: OrderStatus[] = [
      "EM_ANALISE", "AGUARDANDO_IMPRESSAO", "SEPARANDO", "PENDENTE",
      "CONFERINDO", "EMBALANDO", "EMBALADO", "PROCESSANDO", "PROCESSADO",
    ];
    if (!podeTrocar.includes(order.status)) {
      return actionError("O pedido já avançou; não é possível remover a Nota Fiscal.");
    }

    const antigo = order.invoicePath;
    await prisma.order.update({
      where: { id: order.id },
      data: { invoicePath: null },
    });
    // Apaga o arquivo fisico depois de limpar o banco.
    await deleteUploadedFile(antigo);

    revalidatePath("/fluxo");
    revalidatePath("/logistica");
    revalidatePath("/vendas");
    return actionOk(undefined);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao remover Nota Fiscal.");
  }
}

// Helper interno reusado pelos dois uploads acima.
async function uploadOrderFile(
  formData: FormData,
  field: "paymentProofPath" | "invoicePath",
  folder: string,
): Promise<ActionResult<{ filePath: string }>> {
  try {
    const session = await requireRoleAction(["VENDAS", "GESTAO"]);
    const orderId = String(formData.get("orderId") ?? "");
    const file = formData.get("file");
    if (!orderId) return actionError("Pedido nao informado.");
    if (!(file instanceof File)) return actionError("Arquivo obrigatorio.");

    const invalid = validateUpload(file);
    if (invalid) return actionError(invalid);

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) return actionError("Pedido nao encontrado.");
    if (order.sellerId !== session.userId && session.role !== "GESTAO") {
      return actionError("Este pedido nao e seu.");
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const processed = await processAndSaveImage(buffer, {
      folder,
      fileName: `${orderId}_${field}_${Date.now()}`,
    });

    await prisma.order.update({
      where: { id: orderId },
      data: { [field]: processed.filePath },
    });

    revalidatePath("/vendas");
    revalidatePath("/dashboard");
    return actionOk({ filePath: processed.filePath });
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro no upload.");
  }
}
