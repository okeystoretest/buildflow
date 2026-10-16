import { prisma } from "@/lib/prisma";
import {
  buildTransportDashboard,
  type TransportDashboard,
  type TransportRow,
} from "@/lib/transport/dashboard-math";

/**
 * Porta do banco da ferramenta Dashboard (painel de Motoristas do Connect).
 * Só lê as linhas e delega a conta para dashboard-math.ts, que é puro.
 */
export type { TransportDashboard };

/**
 * `driverId` recorta TODO o painel num motorista só — KPIs, tempo médio,
 * quilometragem e as distribuições. O filtro entra no `where`, e não depois
 * em memória, para o recorte não depender de quem consome.
 */
export async function getTransportDashboard(driverId?: string): Promise<TransportDashboard> {
  const rows = await prisma.transportRequest.findMany({
    where: driverId ? { driverId } : {},
    select: {
      status: true,
      serviceType: true,
      requesterSector: true,
      createdAt: true,
      finishedAt: true,
      distanceKm: true,
      driverId: true,
      driver: { select: { name: true } },
    },
  });

  const flat: TransportRow[] = rows.map((r) => ({
    status: r.status,
    serviceType: r.serviceType,
    requesterSector: r.requesterSector,
    createdAt: r.createdAt,
    finishedAt: r.finishedAt,
    distanceKm: r.distanceKm,
    driverId: r.driverId,
    driverName: r.driver?.name ?? null,
  }));

  return buildTransportDashboard(flat);
}

/** Motoristas do seletor do painel — mesma lista que o quadro usa para atribuir. */
export async function getTransportDrivers(): Promise<{ id: string; name: string }[]> {
  return prisma.user.findMany({
    where: { role: "MOTORISTA", active: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}
