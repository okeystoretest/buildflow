"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRoleAction } from "@/lib/auth";
import { processAndSaveImage, validateUpload, type ProcessedImage } from "@/lib/image";
import { actionOk, actionError, type ActionResult } from "@/types/action";
import { ativarPecaAoEntregar } from "@/lib/piece-sync";

/** Motorista inicia a rota (ENVIADO -> EM_ROTA). */
export async function startRoute(orderId: string): Promise<ActionResult<void>> {
  try {
    const session = await requireRoleAction(["MOTORISTA", "GESTAO"]);
    await prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: orderId }, include: { delivery: true } });
      if (!order || !order.delivery) throw new Error("Entrega nao encontrada.");
      if (order.delivery.driverId !== session.userId && session.role !== "GESTAO") {
        throw new Error("Esta entrega nao e sua.");
      }
      await tx.delivery.update({
        where: { id: order.delivery.id },
        data: { status: "EM_ROTA", startedAt: new Date() },
      });
      await tx.order.update({ where: { id: orderId }, data: { status: "EM_ROTA" } });
      await tx.orderStatusHistory.create({
        data: { orderId, status: "EM_ROTA", changedBy: session.userId },
      });
    });
    revalidatePath("/motorista");
    revalidatePath("/dashboard");
    return actionOk(undefined);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao iniciar rota.");
  }
}

/**
 * Motorista conclui a entrega com 1 a 3 fotos.
 *  Cada foto: sharp -> redimensiona, reduz qualidade, converte p/ webp -> disco.
 *  Banco grava SO o caminho (uma linha Proof por foto). Apos salvar: pedido ->
 *  CONCLUIDO (sai do dashboard ativo, vai pro Historico de Vendas).
 *
 * Compatibilidade: aceita tanto o campo novo "photos" (multiplas) quanto o
 * antigo "photo" (uma), para não quebrar clientes desatualizados.
 */
const MAX_PHOTOS = 3;

export async function completeDelivery(
  formData: FormData,
): Promise<ActionResult<{ filePaths: string[] }>> {
  try {
    const session = await requireRoleAction(["MOTORISTA", "GESTAO"]);

    const orderId = String(formData.get("orderId") ?? "");
    if (!orderId) return actionError("Pedido nao informado.");

    // Coleta as fotos: "photos" (novo, múltiplo) + "photo" (legado, único).
    const raw = [...formData.getAll("photos"), ...formData.getAll("photo")];
    const files = raw.filter((f): f is File => f instanceof File && f.size > 0);

    if (files.length === 0) return actionError("Envie ao menos 1 foto de comprovacao.");
    if (files.length > MAX_PHOTOS) {
      return actionError(`Máximo de ${MAX_PHOTOS} fotos por pedido.`);
    }

    // Valida cada arquivo antes de processar qualquer um.
    for (const f of files) {
      const invalid = validateUpload(f);
      if (invalid) return actionError(invalid);
    }

    const order = await prisma.order.findUnique({ where: { id: orderId }, include: { delivery: true } });
    if (!order || !order.delivery) return actionError("Entrega nao encontrada.");
    if (order.delivery.driverId !== session.userId && session.role !== "GESTAO") {
      return actionError("Esta entrega nao e sua.");
    }
    const deliveryId = order.delivery.id;

    // Processa e salva cada foto (sharp -> webp) ANTES da transação, para não
    // manter a transação aberta durante I/O de disco.
    const processedAll: ProcessedImage[] = [];
    for (let i = 0; i < files.length; i++) {
      const buffer = Buffer.from(await files[i].arrayBuffer());
      const processed = await processAndSaveImage(buffer, {
        folder: "comprovantes",
        fileName: `${deliveryId}_${Date.now()}_${i}`,
      });
      processedAll.push(processed);
    }

    await prisma.$transaction(async (tx) => {
      for (const processed of processedAll) {
        await tx.proof.create({
          data: {
            deliveryId,
            filePath: processed.filePath,
            width: processed.width,
            height: processed.height,
            sizeBytes: processed.sizeBytes,
          },
        });
      }
      await tx.delivery.update({
        where: { id: deliveryId },
        data: { status: "ENTREGUE", deliveredAt: new Date() },
      });
      // doc: apos foto(s) salva(s) -> CONCLUIDO
      await tx.order.update({ where: { id: orderId }, data: { status: "CONCLUIDO" } });
      await tx.orderStatusHistory.create({
        data: {
          orderId,
          status: "CONCLUIDO",
          changedBy: session.userId,
          note: `Entregue com ${processedAll.length} comprovante(s)`,
        },
      });
      // Controle de Peças: a entrega comprovada pelo motorista libera a peça
      // para "Em Uso" (tipo "10 - Peças p/ Blogueira").
      await ativarPecaAoEntregar(tx, orderId, session.userId);
    });

    revalidatePath("/motorista");
    revalidatePath("/dashboard");
    revalidatePath("/vendas");
    revalidatePath("/logistica/controle-pecas");
    return actionOk({ filePaths: processedAll.map((p) => p.filePath) });
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao concluir entrega.");
  }
}
