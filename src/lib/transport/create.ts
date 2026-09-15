import { z } from "zod";
import type { TransportStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { processAndSaveImage, validateUpload } from "@/lib/image";
import { afterTransportChange } from "./notify";

/**
 * Chegada do chamado vindo do Build.Connect.
 *
 * IDEMPOTENTE por `connectId`: o Connect reenvia quando nao recebeu resposta
 * (cron de reenvio), e o segundo POST precisa devolver o mesmo registro em vez
 * de duplicar. A unicidade e garantida pelo banco (`@unique`), e a corrida
 * entre dois POSTs simultaneos cai no catch de P2002 e reconsulta.
 */

export const createFromConnectSchema = z.object({
  connectId: z.string().min(1),
  code: z.string().min(1),
  requester: z.object({
    connectId: z.string().min(1),
    name: z.string().min(1),
    sector: z.string().optional().nullable(),
  }),
  contact: z.string().optional().nullable(),
  serviceType: z.string().min(1),
  description: z.string().min(1),
  originUnit: z.string().optional().nullable(),
  originStreet: z.string().optional().nullable(),
  originNumber: z.string().optional().nullable(),
  originDistrict: z.string().optional().nullable(),
  destStreet: z.string().min(1),
  destNumber: z.string().optional().nullable(),
  destDistrict: z.string().optional().nullable(),
  driverId: z.string().optional().nullable(),
});

export type CreateFromConnectInput = z.infer<typeof createFromConnectSchema>;

const MAX_IMAGES = 5;

function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && "code" in e && (e as { code?: unknown }).code === "P2002";
}

export async function createFromConnect(
  input: CreateFromConnectInput,
  images: File[],
): Promise<{ id: string; status: TransportStatus; driver: { id: string; name: string } | null; created: boolean }> {
  const existente = await prisma.transportRequest.findUnique({
    where: { connectId: input.connectId },
    select: { id: true, status: true, driver: { select: { id: true, name: true } } },
  });
  if (existente) return { ...existente, created: false };

  // Motorista escolhido na abertura: so vale se ainda for MOTORISTA ativo.
  // Se nao, o chamado nasce Em Aberto (o Connect mostra Em Aberto).
  const driver = input.driverId
    ? await prisma.user.findFirst({
        where: { id: input.driverId, role: "MOTORISTA", active: true },
        select: { id: true, name: true },
      })
    : null;

  // Fotos ANTES da transacao (I/O de disco).
  const files = images.slice(0, MAX_IMAGES);
  for (const f of files) {
    const invalid = validateUpload(f);
    if (invalid) throw new Error(invalid);
  }
  const processed: string[] = [];
  for (let i = 0; i < files.length; i += 1) {
    const p = await processAndSaveImage(Buffer.from(await files[i]!.arrayBuffer()), {
      folder: "chamados",
      fileName: `${input.connectId}_${i}`,
    });
    processed.push(p.filePath);
  }

  try {
    const created = await prisma.$transaction(async (tx) => {
      const r = await tx.transportRequest.create({
        data: {
          connectId: input.connectId,
          code: input.code,
          status: driver ? "ATRIBUIDO" : "ABERTO",
          requesterConnectId: input.requester.connectId,
          requesterName: input.requester.name,
          requesterSector: input.requester.sector ?? null,
          contact: input.contact ?? null,
          serviceType: input.serviceType,
          description: input.description,
          originUnit: input.originUnit ?? null,
          originStreet: input.originStreet ?? null,
          originNumber: input.originNumber ?? null,
          originDistrict: input.originDistrict ?? null,
          destStreet: input.destStreet,
          destNumber: input.destNumber ?? null,
          destDistrict: input.destDistrict ?? null,
          driverId: driver?.id ?? null,
          assignedAt: driver ? new Date() : null,
          images: { create: processed.map((filePath, order) => ({ filePath, order })) },
          history: {
            create: [
              { event: "criado", actorName: "Build.Connect", note: input.requester.name },
              ...(driver ? [{ event: "atribuido", actorName: "Build.Connect", note: `para ${driver.name}` }] : []),
            ],
          },
        },
        select: { id: true, status: true },
      });
      return r;
    });
    afterTransportChange(created.id, driver ? "atribuido" : "criado");
    return { id: created.id, status: created.status, driver, created: true };
  } catch (e) {
    if (isUniqueViolation(e)) {
      const again = await prisma.transportRequest.findUnique({
        where: { connectId: input.connectId },
        select: { id: true, status: true, driver: { select: { id: true, name: true } } },
      });
      if (again) return { ...again, created: false };
    }
    throw e;
  }
}
