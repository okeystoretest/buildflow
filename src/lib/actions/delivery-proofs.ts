"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRoleAction } from "@/lib/auth";
import {
  processAndSaveImage,
  deleteUploadedFile,
  type ProcessedImage,
} from "@/lib/image";
import { actionOk, actionError, type ActionResult } from "@/types/action";

// Teto de fotos por entrega (mesmo limite da conclusão pelo motorista).
const MAX_PHOTOS = 3;
// Tamanho máximo por imagem recebida em base64 (~15MB no arquivo original).
const MAX_BYTES = 15 * 1024 * 1024;

const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

/**
 * Edição das fotos de comprovação de uma entrega no Histórico do Motorista.
 *
 * Permite, num único passo atômico:
 *  - EXCLUIR fotos já enviadas (por id): remove a linha `Proof` e o arquivo do
 *    disco (webp), evitando órfãos.
 *  - ADICIONAR novas fotos (base64 vindo de câmera/galeria): cada imagem passa
 *    pelo pipeline sharp → .webp e é gravada em disco; no banco vai só o caminho.
 *
 * Segurança:
 *  - Restrito a MOTORISTA (dono da entrega) e GESTAO (vê/edita todas).
 *  - O motorista só edita a PRÓPRIA entrega (delivery.driverId === userId).
 *  - Respeita o teto de MAX_PHOTOS considerando o que sobra após as exclusões.
 */
export async function updateDeliveryProofs(input: {
  deliveryId: string;
  removeProofIds?: string[];
  addPhotosBase64?: string[];
}): Promise<ActionResult<{ proofs: { id: string; filePath: string }[] }>> {
  try {
    const session = await requireRoleAction(["MOTORISTA", "GESTAO"]);

    const deliveryId = String(input.deliveryId ?? "");
    if (!deliveryId) return actionError("Entrega não informada.");

    const removeIds = (input.removeProofIds ?? []).filter(Boolean);
    const addBase64 = (input.addPhotosBase64 ?? []).filter(Boolean);
    if (removeIds.length === 0 && addBase64.length === 0) {
      return actionError("Nenhuma alteração informada.");
    }

    // Carrega a entrega + fotos atuais para validar posse e o teto de fotos.
    const delivery = await prisma.delivery.findUnique({
      where: { id: deliveryId },
      include: { proofs: { select: { id: true, filePath: true } } },
    });
    if (!delivery) return actionError("Entrega não encontrada.");
    if (delivery.driverId !== session.userId && session.role !== "GESTAO") {
      return actionError("Esta entrega não é sua.");
    }

    // As exclusões só valem para fotos que pertencem a ESTA entrega.
    const idsDaEntrega = new Set(delivery.proofs.map((p) => p.id));
    const removerValidos = removeIds.filter((id) => idsDaEntrega.has(id));
    const removerPaths = delivery.proofs
      .filter((p) => removerValidos.includes(p.id))
      .map((p) => p.filePath);

    // Quantas sobram após remover, e quantas cabem ainda.
    const restantesAposRemover = delivery.proofs.length - removerValidos.length;
    const espaco = MAX_PHOTOS - restantesAposRemover;
    if (addBase64.length > espaco) {
      return actionError(
        `Limite de ${MAX_PHOTOS} fotos por entrega. Você pode adicionar no máximo ${Math.max(
          espaco,
          0,
        )}.`,
      );
    }

    // Processa as novas fotos (sharp → webp) ANTES da transação (I/O de disco).
    const processadas: ProcessedImage[] = [];
    for (let i = 0; i < addBase64.length; i++) {
      const buffer = decodeImageDataUrl(addBase64[i]);
      if (!buffer) return actionError("Uma das imagens é inválida. Envie apenas fotos (JPG/PNG/HEIC/WebP).");
      if (buffer.length > MAX_BYTES) return actionError("Imagem muito grande. Limite: 15MB.");
      const processed = await processAndSaveImage(buffer, {
        folder: "comprovantes",
        fileName: `${deliveryId}_edit_${Date.now()}_${i}`,
      });
      processadas.push(processed);
    }

    // Transação: remove as linhas marcadas e cria as novas.
    await prisma.$transaction(async (tx) => {
      if (removerValidos.length) {
        await tx.proof.deleteMany({
          where: { id: { in: removerValidos }, deliveryId },
        });
      }
      for (const p of processadas) {
        await tx.proof.create({
          data: {
            deliveryId,
            filePath: p.filePath,
            width: p.width,
            height: p.height,
            sizeBytes: p.sizeBytes,
          },
        });
      }
    });

    // Só apaga do disco DEPOIS que a transação confirmou a remoção no banco.
    for (const path of removerPaths) {
      await deleteUploadedFile(path);
    }

    // Estado final das fotos, para a UI atualizar em tempo real.
    const proofs = await prisma.proof.findMany({
      where: { deliveryId },
      select: { id: true, filePath: true },
      orderBy: { createdAt: "asc" },
    });

    revalidatePath("/motorista/historico");
    revalidatePath("/logistica/entregas");
    revalidatePath("/vendas/historico");
    return actionOk({ proofs });
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao atualizar as fotos.");
  }
}

/**
 * Decodifica um data-URL de imagem (data:image/...;base64,XXXX) em Buffer,
 * validando o MIME. Retorna null se o formato não for uma imagem suportada.
 */
function decodeImageDataUrl(dataUrl: string): Buffer | null {
  const match = /^data:([^;]+);base64,(.+)$/i.exec(dataUrl.trim());
  if (!match) return null;
  const mime = match[1].toLowerCase();
  if (!ALLOWED_MIME.includes(mime)) return null;
  try {
    const buf = Buffer.from(match[2], "base64");
    return buf.length > 0 ? buf : null;
  } catch {
    return null;
  }
}
