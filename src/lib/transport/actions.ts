"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRoleAction } from "@/lib/auth";
import { processAndSaveImage, validateUpload } from "@/lib/image";
import { actionOk, actionError, type ActionResult } from "@/types/action";
import { canTransition } from "./status";
import { geocodeEndpoints } from "./geocode";
import { trailDistanceKm } from "./geo";
import { afterTransportChange } from "./notify";

/**
 * Server Actions do chamado de transporte. Mesmo comportamento do quadro do
 * Build.Connect:
 *   - Logistica/Gestao: atribuir a alguem, desatribuir, cancelar.
 *   - Motorista: assumir (Em Aberto), iniciar rota (liga o GPS), concluir com
 *     foto. Gestao pode agir no lugar do motorista.
 * Toda transicao passa por canTransition — a regra e uma so.
 */

const GESTORES = ["LOGISTICA", "GESTAO"] as const;
const MOTORISTAS = ["MOTORISTA", "GESTAO"] as const;

const PATHS = ["/motorista", "/motorista/chamados", "/motorista/dashboard"];
function revalidar(): void {
  for (const p of PATHS) revalidatePath(p);
}

async function registrar(
  tx: Prisma.TransactionClient,
  requestId: string,
  event: string,
  actorName: string | null,
  note?: string | null,
): Promise<void> {
  await tx.transportHistory.create({ data: { requestId, event, actorName, note: note ?? null } });
}

const idSchema = z.object({ requestId: z.string().min(1) });

/** Logistica/Gestao atribui a um motorista ativo. */
export async function assignTransport(input: {
  requestId: string;
  driverId: string;
}): Promise<ActionResult<void>> {
  try {
    const session = await requireRoleAction([...GESTORES]);
    const parsed = idSchema.extend({ driverId: z.string().min(1) }).safeParse(input);
    if (!parsed.success) return actionError("Dados inválidos.");
    const { requestId, driverId } = parsed.data;

    const driver = await prisma.user.findFirst({
      where: { id: driverId, role: "MOTORISTA", active: true },
      select: { id: true, name: true },
    });
    if (!driver) return actionError("Motorista inválido ou inativo.");

    await prisma.$transaction(async (tx) => {
      const r = await tx.transportRequest.findUnique({ where: { id: requestId }, select: { status: true } });
      if (!r) throw new Error("Chamado não encontrado.");
      // Reatribuir um ja atribuido e permitido (ATRIBUIDO -> ATRIBUIDO nao e
      // transicao; e troca de dono). Qualquer outro estado precisa poder ir a ATRIBUIDO.
      if (r.status !== "ATRIBUIDO" && !canTransition(r.status, "ATRIBUIDO")) {
        throw new Error("Este chamado não pode ser atribuído neste estado.");
      }
      await tx.transportRequest.update({
        where: { id: requestId },
        data: { status: "ATRIBUIDO", driverId: driver.id, assignedById: session.userId, assignedAt: new Date() },
      });
      await registrar(tx, requestId, "atribuido", session.name, `para ${driver.name}`);
    });
    revalidar();
    afterTransportChange(requestId, "atribuido");
    return actionOk(undefined);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao atribuir.");
  }
}

/**
 * Motorista assume um chamado Em Aberto. ATOMICO: dois motoristas podem clicar
 * no mesmo instante; o updateMany condicionado a driverId null decide quem
 * chegou primeiro (mesma tecnica de startRoute em deliveries.ts).
 */
export async function claimTransport(input: { requestId: string }): Promise<ActionResult<void>> {
  try {
    const session = await requireRoleAction([...MOTORISTAS]);
    const parsed = idSchema.safeParse(input);
    if (!parsed.success) return actionError("Dados inválidos.");
    const { requestId } = parsed.data;

    await prisma.$transaction(async (tx) => {
      const { count } = await tx.transportRequest.updateMany({
        where: { id: requestId, status: "ABERTO", driverId: null },
        data: { status: "ATRIBUIDO", driverId: session.userId, assignedById: null, assignedAt: new Date() },
      });
      if (count !== 1) throw new Error("Este chamado acabou de ser assumido por outro motorista.");
      await registrar(tx, requestId, "assumido", session.name);
    });
    revalidar();
    afterTransportChange(requestId, "assumido");
    return actionOk(undefined);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao assumir.");
  }
}

/** Devolve para Em Aberto. O proprio motorista, ou Logistica/Gestao. */
export async function unassignTransport(input: { requestId: string }): Promise<ActionResult<void>> {
  try {
    const session = await requireRoleAction();
    const parsed = idSchema.safeParse(input);
    if (!parsed.success) return actionError("Dados inválidos.");
    const { requestId } = parsed.data;

    await prisma.$transaction(async (tx) => {
      const r = await tx.transportRequest.findUnique({
        where: { id: requestId },
        select: { status: true, driverId: true },
      });
      if (!r) throw new Error("Chamado não encontrado.");
      const gestor = session.role === "LOGISTICA" || session.role === "GESTAO";
      if (!gestor && r.driverId !== session.userId) throw new Error("Este chamado não é seu.");
      if (!canTransition(r.status, "ABERTO")) throw new Error("Só um chamado atribuído pode ser desatribuído.");
      await tx.transportRequest.update({
        where: { id: requestId },
        data: { status: "ABERTO", driverId: null, assignedById: null, assignedAt: null },
      });
      await registrar(tx, requestId, "desatribuido", session.name);
    });
    revalidar();
    afterTransportChange(requestId, "desatribuido");
    return actionOk(undefined);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao desatribuir.");
  }
}

/**
 * Motorista inicia a rota: geocodifica origem/destino UMA vez (fora da
 * transacao — e rede externa) e liga o GPS. Idempotente: ja EM_ROTA -> ok.
 */
export async function startTransportRoute(input: { requestId: string }): Promise<ActionResult<void>> {
  try {
    const session = await requireRoleAction([...MOTORISTAS]);
    const parsed = idSchema.safeParse(input);
    if (!parsed.success) return actionError("Dados inválidos.");
    const { requestId } = parsed.data;

    const r = await prisma.transportRequest.findUnique({
      where: { id: requestId },
      select: {
        status: true, driverId: true,
        originUnit: true, originStreet: true, originNumber: true, originDistrict: true,
        destStreet: true, destNumber: true, destDistrict: true,
      },
    });
    if (!r) return actionError("Chamado não encontrado.");
    if (r.driverId !== session.userId && session.role !== "GESTAO") {
      return actionError("Apenas o motorista responsável inicia a rota.");
    }
    if (r.status === "EM_ROTA") return actionOk(undefined);
    if (!canTransition(r.status, "EM_ROTA")) return actionError("O chamado precisa estar atribuído para iniciar.");

    const coords = await geocodeEndpoints(
      r.originUnit
        ? { street: r.originUnit, number: null, district: null }
        : { street: r.originStreet, number: r.originNumber, district: r.originDistrict },
      { street: r.destStreet, number: r.destNumber, district: r.destDistrict },
    );

    await prisma.$transaction(async (tx) => {
      // Reconfere dentro da transacao: alguem pode ter cancelado durante a geocodificacao.
      const atual = await tx.transportRequest.findUnique({ where: { id: requestId }, select: { status: true } });
      if (!atual || !canTransition(atual.status, "EM_ROTA")) throw new Error("O chamado mudou de estado.");
      await tx.transportRequest.update({
        where: { id: requestId },
        data: {
          status: "EM_ROTA",
          startedAt: new Date(),
          originLat: coords.origin?.lat ?? null,
          originLng: coords.origin?.lng ?? null,
          destLat: coords.destination?.lat ?? null,
          destLng: coords.destination?.lng ?? null,
        },
      });
      await registrar(tx, requestId, "em_rota", session.name);
    });
    revalidar();
    afterTransportChange(requestId, "em_rota");
    return actionOk(undefined);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao iniciar a rota.");
  }
}

const positionSchema = z.object({
  requestId: z.string().min(1),
  lat: z.number().gte(-90).lte(90),
  lng: z.number().gte(-180).lte(180),
  heading: z.number().gte(0).lt(360).optional(),
  speed: z.number().gte(0).lte(400).optional(),
});

/**
 * Posicao GPS durante a corrida. So o motorista responsavel, so EM_ROTA. O
 * throttle fica no cliente. Corrida encerrada ignora posicao tardia com ok
 * (o app do motorista offline/atrasado nao deve ver erro).
 */
export async function pushTransportPosition(input: {
  requestId: string;
  lat: number;
  lng: number;
  heading?: number;
  speed?: number;
}): Promise<ActionResult<void>> {
  try {
    const session = await requireRoleAction([...MOTORISTAS]);
    const parsed = positionSchema.safeParse(input);
    if (!parsed.success) return actionError("Posição inválida.");
    const { requestId, lat, lng, heading, speed } = parsed.data;

    const r = await prisma.transportRequest.findUnique({
      where: { id: requestId },
      select: { status: true, driverId: true },
    });
    if (!r) return actionError("Chamado não encontrado.");
    if (r.driverId !== session.userId && session.role !== "GESTAO") {
      return actionError("Apenas o motorista responsável envia posição.");
    }
    if (r.status !== "EM_ROTA") return actionOk(undefined);

    await prisma.transportPosition.create({ data: { requestId, lat, lng, heading, speed } });
    return actionOk(undefined);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao registrar posição.");
  }
}

/**
 * Conclui com UMA foto de comprovante (obrigatoria). A quilometragem sai do
 * rastro gravado. Foto processada ANTES da transacao (I/O de disco fora dela).
 */
export async function completeTransport(formData: FormData): Promise<ActionResult<void>> {
  try {
    const session = await requireRoleAction([...MOTORISTAS]);
    const requestId = String(formData.get("requestId") ?? "");
    if (!requestId) return actionError("Chamado não informado.");
    const photo = formData.get("photo");
    if (!(photo instanceof File) || photo.size === 0) return actionError("Envie a foto do comprovante.");
    const invalid = validateUpload(photo);
    if (invalid) return actionError(invalid);

    const r = await prisma.transportRequest.findUnique({
      where: { id: requestId },
      select: {
        status: true, driverId: true,
        positions: { orderBy: { recordedAt: "asc" }, select: { lat: true, lng: true } },
      },
    });
    if (!r) return actionError("Chamado não encontrado.");
    if (r.driverId !== session.userId && session.role !== "GESTAO") return actionError("Este chamado não é seu.");
    if (!canTransition(r.status, "CONCLUIDO")) return actionError("O chamado precisa estar em rota para concluir.");

    const processed = await processAndSaveImage(Buffer.from(await photo.arrayBuffer()), {
      folder: "chamados",
      fileName: `${requestId}_${Date.now()}`,
    });
    const km = Math.round(trailDistanceKm(r.positions) * 10) / 10;

    await prisma.$transaction(async (tx) => {
      await tx.transportRequest.update({
        where: { id: requestId },
        data: { status: "CONCLUIDO", finishedAt: new Date(), proofPath: processed.filePath, distanceKm: km },
      });
      await registrar(tx, requestId, "concluido", session.name, km > 0 ? `${km} km` : null);
    });
    revalidar();
    afterTransportChange(requestId, "concluido");
    return actionOk(undefined);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao concluir.");
  }
}

/** Logistica/Gestao cancela, com motivo. */
export async function cancelTransport(input: {
  requestId: string;
  reason: string;
}): Promise<ActionResult<void>> {
  try {
    const session = await requireRoleAction([...GESTORES]);
    const parsed = idSchema.extend({ reason: z.string().trim().min(3, "Informe o motivo.").max(500) }).safeParse(input);
    if (!parsed.success) return actionError(parsed.error.issues[0]?.message ?? "Dados inválidos.");
    const { requestId, reason } = parsed.data;

    await prisma.$transaction(async (tx) => {
      const r = await tx.transportRequest.findUnique({ where: { id: requestId }, select: { status: true } });
      if (!r) throw new Error("Chamado não encontrado.");
      if (!canTransition(r.status, "CANCELADO")) throw new Error("Este chamado já foi encerrado.");
      await tx.transportRequest.update({
        where: { id: requestId },
        data: { status: "CANCELADO", finishedAt: new Date(), cancelReason: reason },
      });
      await registrar(tx, requestId, "cancelado", session.name, reason);
    });
    revalidar();
    afterTransportChange(requestId, "cancelado");
    return actionOk(undefined);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao cancelar.");
  }
}
