"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRoleAction } from "@/lib/auth";
import { processAndSaveImage, validateUpload } from "@/lib/image";
import { actionOk, actionError, type ActionResult } from "@/types/action";

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
 * Motorista conclui a entrega com foto.
 *  sharp -> redimensiona, reduz qualidade, converte p/ webp -> salva em disco.
 *  Banco grava SO o caminho. Apos salvar: pedido -> CONCLUIDO (sai do dashboard ativo,
 *  vai pro Historico de Vendas).
 */
export async function completeDelivery(
  formData: FormData,
): Promise<ActionResult<{ filePath: string }>> {
  try {
    const session = await requireRoleAction(["MOTORISTA", "GESTAO"]);

    const orderId = String(formData.get("orderId") ?? "");
    const file = formData.get("photo");
    if (!orderId) return actionError("Pedido nao informado.");
    if (!(file instanceof File)) return actionError("Foto de comprovacao obrigatoria.");

    const invalid = validateUpload(file);
    if (invalid) return actionError(invalid);

    const order = await prisma.order.findUnique({ where: { id: orderId }, include: { delivery: true } });
    if (!order || !order.delivery) return actionError("Entrega nao encontrada.");
    if (order.delivery.driverId !== session.userId && session.role !== "GESTAO") {
      return actionError("Esta entrega nao e sua.");
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const processed = await processAndSaveImage(buffer, {
      folder: "comprovantes",
      fileName: `${order.delivery.id}_${Date.now()}`,
    });

    await prisma.$transaction(async (tx) => {
      await tx.proof.create({
        data: {
          deliveryId: order.delivery!.id,
          filePath: processed.filePath,
          width: processed.width,
          height: processed.height,
          sizeBytes: processed.sizeBytes,
        },
      });
      await tx.delivery.update({
        where: { id: order.delivery!.id },
        data: { status: "ENTREGUE", deliveredAt: new Date() },
      });
      // doc: apos foto salva -> CONCLUIDO
      await tx.order.update({ where: { id: orderId }, data: { status: "CONCLUIDO" } });
      await tx.orderStatusHistory.create({
        data: { orderId, status: "CONCLUIDO", changedBy: session.userId, note: "Entregue com comprovante" },
      });
    });

    revalidatePath("/motorista");
    revalidatePath("/dashboard");
    revalidatePath("/vendas");
    return actionOk({ filePath: processed.filePath });
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao concluir entrega.");
  }
}
