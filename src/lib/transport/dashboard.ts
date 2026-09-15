import { prisma } from "@/lib/prisma";
import type { TransportStatus } from "@prisma/client";

/**
 * Numeros da ferramenta Dashboard (porta do painel de Motoristas do Connect):
 * volume por status, tempo medio de conclusao, taxa de conclusao,
 * quilometragem e motoristas ativos. Cancelados ficam fora das medias.
 */
export interface TransportDashboard {
  total: number;
  byStatus: Record<TransportStatus, number>;
  concludedToday: number;
  concluded30d: number;
  avgResolution: string;
  completionRate: number;
  totalKm: number;
  avgKmPerTrip: number;
  activeDrivers: number;
  topDriver: string;
  byService: { label: string; count: number }[];
  bySector: { label: string; count: number }[];
}

function distribute(values: string[]): { label: string; count: number }[] {
  const map = new Map<string, number>();
  for (const v of values) map.set(v, (map.get(v) ?? 0) + 1);
  return [...map.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
}

export async function getTransportDashboard(): Promise<TransportDashboard> {
  const rows = await prisma.transportRequest.findMany({
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

  const ativos = rows.filter((r) => r.status !== "CANCELADO");
  const byStatus: Record<TransportStatus, number> = { ABERTO: 0, ATRIBUIDO: 0, EM_ROTA: 0, CONCLUIDO: 0, CANCELADO: 0 };
  for (const r of rows) byStatus[r.status] += 1;

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const d30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const concluidos = ativos.filter((r) => r.status === "CONCLUIDO" && r.finishedAt);
  const concludedToday = concluidos.filter((r) => r.finishedAt! >= hoje).length;
  const concluded30d = concluidos.filter((r) => r.finishedAt! >= d30).length;

  const durations = concluidos
    .map((r) => r.finishedAt!.getTime() - r.createdAt.getTime())
    .filter((ms) => ms > 0);
  const avgMin = durations.length
    ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length / 60000)
    : 0;
  const avgResolution = avgMin > 0 ? `${Math.floor(avgMin / 60)}h ${avgMin % 60}m` : "—";
  const completionRate = ativos.length === 0 ? 0 : Math.round((concluidos.length / ativos.length) * 100);

  const kms = concluidos.map((r) => r.distanceKm ?? 0).filter((v) => v > 0);
  const totalKm = kms.reduce((a, b) => a + b, 0);
  const avgKmPerTrip = kms.length ? totalKm / kms.length : 0;

  const activeDrivers = new Set(rows.filter((r) => r.driverId && r.createdAt >= d30).map((r) => r.driverId)).size;
  const porMotorista = distribute(concluidos.map((r) => r.driver?.name ?? "").filter(Boolean));
  const topDriver = porMotorista[0]?.label ?? "—";

  return {
    total: ativos.length,
    byStatus,
    concludedToday,
    concluded30d,
    avgResolution,
    completionRate,
    totalKm: Math.round(totalKm * 10) / 10,
    avgKmPerTrip: Math.round(avgKmPerTrip * 10) / 10,
    activeDrivers,
    topDriver,
    byService: distribute(ativos.map((r) => r.serviceType)),
    bySector: distribute(ativos.map((r) => r.requesterSector ?? "Sem setor")),
  };
}
