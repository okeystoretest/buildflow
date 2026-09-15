import { prisma } from "@/lib/prisma";
import type { TransportStatus } from "@prisma/client";
import { CONCLUDED_WINDOW_MIN, isFinal } from "./status";
import { addressLabel } from "./geocode";

/**
 * Leituras do chamado de transporte e o DTO de tela.
 *
 * O DTO e plano e serializavel (datas em ISO) porque atravessa a fronteira
 * RSC -> client (quadro, cards, modais).
 */

export const TRANSPORT_VIEW_SELECT = {
  id: true,
  connectId: true,
  code: true,
  status: true,
  requesterName: true,
  requesterSector: true,
  contact: true,
  serviceType: true,
  description: true,
  originUnit: true,
  originStreet: true,
  originNumber: true,
  originDistrict: true,
  destStreet: true,
  destNumber: true,
  destDistrict: true,
  driverId: true,
  driver: { select: { name: true } },
  assignedById: true,
  assignedAt: true,
  startedAt: true,
  finishedAt: true,
  distanceKm: true,
  proofPath: true,
  cancelReason: true,
  createdAt: true,
  images: { orderBy: { order: "asc" as const }, select: { id: true, filePath: true } },
  history: {
    orderBy: { createdAt: "asc" as const },
    select: { event: true, actorName: true, note: true, createdAt: true },
  },
} as const;

type Row = {
  id: string;
  connectId: string;
  code: string;
  status: TransportStatus;
  requesterName: string;
  requesterSector: string | null;
  contact: string | null;
  serviceType: string;
  description: string;
  originUnit: string | null;
  originStreet: string | null;
  originNumber: string | null;
  originDistrict: string | null;
  destStreet: string;
  destNumber: string | null;
  destDistrict: string | null;
  driverId: string | null;
  driver: { name: string } | null;
  assignedById: string | null;
  assignedAt: Date | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  distanceKm: number | null;
  proofPath: string | null;
  cancelReason: string | null;
  createdAt: Date;
  images: { id: string; filePath: string }[];
  history: { event: string; actorName: string | null; note: string | null; createdAt: Date }[];
};

export interface TransportHistoryView {
  event: string;
  actorName: string | null;
  note: string | null;
  at: string;
}

export interface TransportView {
  id: string;
  connectId: string;
  code: string;
  status: TransportStatus;
  requesterName: string;
  requesterSector: string | null;
  contact: string | null;
  serviceType: string;
  description: string;
  originLabel: string;
  destLabel: string;
  driverId: string | null;
  driverName: string | null;
  assignedById: string | null;
  assignedAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  distanceKm: number | null;
  proofPath: string | null;
  cancelReason: string | null;
  createdAt: string;
  images: { id: string; filePath: string }[];
  history: TransportHistoryView[];
}

export function toView(r: Row): TransportView {
  return {
    id: r.id,
    connectId: r.connectId,
    code: r.code,
    status: r.status,
    requesterName: r.requesterName,
    requesterSector: r.requesterSector,
    contact: r.contact,
    serviceType: r.serviceType,
    description: r.description,
    originLabel:
      r.originUnit ??
      addressLabel(
        { street: r.originStreet, number: r.originNumber, district: r.originDistrict },
        "Origem não informada",
      ),
    destLabel: addressLabel(
      { street: r.destStreet, number: r.destNumber, district: r.destDistrict },
      "Destino não informado",
    ),
    driverId: r.driverId,
    driverName: r.driver?.name ?? null,
    assignedById: r.assignedById,
    assignedAt: r.assignedAt?.toISOString() ?? null,
    startedAt: r.startedAt?.toISOString() ?? null,
    finishedAt: r.finishedAt?.toISOString() ?? null,
    distanceKm: r.distanceKm,
    proofPath: r.proofPath,
    cancelReason: r.cancelReason,
    createdAt: r.createdAt.toISOString(),
    images: r.images,
    history: r.history.map((h) => ({
      event: h.event,
      actorName: h.actorName,
      note: h.note,
      at: h.createdAt.toISOString(),
    })),
  };
}

/**
 * Quadro: tudo que nao e final + concluidos dentro da janela de 15 min.
 * Cancelados nunca aparecem (vao direto ao historico).
 */
export async function listBoard(): Promise<TransportView[]> {
  const desde = new Date(Date.now() - CONCLUDED_WINDOW_MIN * 60 * 1000);
  const rows = await prisma.transportRequest.findMany({
    where: {
      OR: [
        { status: { in: ["ABERTO", "ATRIBUIDO", "EM_ROTA"] } },
        { status: "CONCLUIDO", finishedAt: { gte: desde } },
      ],
    },
    orderBy: { createdAt: "asc" },
    select: TRANSPORT_VIEW_SELECT,
  });
  return rows.map(toView);
}

/** Historico: finais (concluidos e cancelados), mais recentes primeiro. */
export async function listHistory(limit = 100): Promise<TransportView[]> {
  const rows = await prisma.transportRequest.findMany({
    where: { status: { in: ["CONCLUIDO", "CANCELADO"] } },
    orderBy: { finishedAt: "desc" },
    take: limit,
    select: TRANSPORT_VIEW_SELECT,
  });
  return rows.map(toView);
}

export async function getTransportByConnectId(connectId: string): Promise<TransportView | null> {
  const row = await prisma.transportRequest.findUnique({
    where: { connectId },
    select: TRANSPORT_VIEW_SELECT,
  });
  return row ? toView(row) : null;
}

/** MOTORISTA ativos, para atribuir e para o formulario do Connect. */
export async function listActiveDrivers(): Promise<{ id: string; name: string }[]> {
  return prisma.user.findMany({
    where: { role: "MOTORISTA", active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}

/** Exposto para o quadro decidir se ainda mostra o card concluido. */
export function stillOnBoard(status: TransportStatus, finishedAt: string | null, now = Date.now()): boolean {
  if (!isFinal(status)) return true;
  if (status !== "CONCLUIDO" || !finishedAt) return false;
  return now - new Date(finishedAt).getTime() < CONCLUDED_WINDOW_MIN * 60 * 1000;
}
