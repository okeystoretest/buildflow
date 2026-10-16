import type { TransportStatus } from "@prisma/client";

/**
 * CONTA do Dashboard de chamados de transporte.
 *
 * Puro — sem I/O — pelo mesmo motivo do status.ts desta pasta: a porta do
 * banco (dashboard.ts) só lê as linhas e delega, e a checagem em
 * scripts/checks/transport-dashboard.ts roda a conta inteira sem subir o
 * Prisma. Cancelados ficam fora do total e das médias.
 */

/** Linha já achatada pela porta do banco — só o que a conta usa. */
export interface TransportRow {
  status: TransportStatus;
  serviceType: string;
  requesterSector: string | null;
  createdAt: Date;
  finishedAt: Date | null;
  distanceKm: number | null;
  driverId: string | null;
  driverName: string | null;
}

export interface Fatia {
  label: string;
  count: number;
}

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
  byService: Fatia[];
  bySector: Fatia[];
  byDriver: Fatia[];
}

/** Percentual inteiro, protegido do total zero (recorte vazio ou filtrado). */
export function pct(count: number, total: number): number {
  return total === 0 ? 0 : Math.round((count / total) * 100);
}

function distribute(values: string[]): Fatia[] {
  const map = new Map<string, number>();
  for (const v of values) map.set(v, (map.get(v) ?? 0) + 1);
  return [...map.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}

export function buildTransportDashboard(
  rows: TransportRow[],
  agora: Date = new Date(),
): TransportDashboard {
  const ativos = rows.filter((r) => r.status !== "CANCELADO");

  const byStatus: Record<TransportStatus, number> = {
    ABERTO: 0,
    ATRIBUIDO: 0,
    EM_ROTA: 0,
    CONCLUIDO: 0,
    CANCELADO: 0,
  };
  for (const r of rows) byStatus[r.status] += 1;

  const hoje = new Date(agora);
  hoje.setHours(0, 0, 0, 0);
  const d30 = new Date(agora.getTime() - 30 * 24 * 60 * 60 * 1000);

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

  // Quilometragem: só corrida concluída com distância gravada entra na média —
  // um chamado sem distanceKm não é uma corrida de 0 km, é uma corrida sem
  // medição, e contá-la derrubaria a média.
  const kms = concluidos.map((r) => r.distanceKm ?? 0).filter((v) => v > 0);
  const totalKm = kms.reduce((a, b) => a + b, 0);
  const avgKmPerTrip = kms.length ? totalKm / kms.length : 0;

  const activeDrivers = new Set(
    rows.filter((r) => r.driverId && r.createdAt >= d30).map((r) => r.driverId),
  ).size;

  const byDriver = distribute(concluidos.map((r) => r.driverName ?? "").filter(Boolean));

  return {
    total: ativos.length,
    byStatus,
    concludedToday,
    concluded30d,
    avgResolution,
    completionRate: pct(concluidos.length, ativos.length),
    totalKm: Math.round(totalKm * 10) / 10,
    avgKmPerTrip: Math.round(avgKmPerTrip * 10) / 10,
    activeDrivers,
    topDriver: byDriver[0]?.label ?? "—",
    byService: distribute(ativos.map((r) => r.serviceType)),
    bySector: distribute(ativos.map((r) => r.requesterSector ?? "Sem setor")),
    byDriver,
  };
}
