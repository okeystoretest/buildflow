import type { TransportStatus } from "@prisma/client";
import { bearing, distanceKm, subsample, type GeoPoint } from "./geo";

/**
 * DTO de rastreamento. E EXATAMENTE o `TripTracking` que o mapa do Build.Connect
 * ja consome (src/types/tracking.ts de la) — o Connect passa a busca-lo aqui
 * sem mudar uma linha do mapa. Por isso os nomes (`ticketId`, `status` no
 * vocabulario da corrida) nao seguem o vocabulario do Flow.
 */

export type TripStatus = "AGUARDANDO" | "EM_ROTA" | "CONCLUIDA" | "CANCELADA";

export interface TrackedAddress extends GeoPoint {
  label: string;
}

export interface DriverPosition extends GeoPoint {
  /** ISO 8601. */
  recordedAt: string;
  /** Graus, 0 = norte. Ausente quando parado. */
  heading?: number;
  /** km/h. */
  speed?: number;
}

export interface TripTracking {
  ticketId: string;
  status: TripStatus;
  driverName: string;
  vehicleLabel?: string;
  origin: TrackedAddress;
  destination: TrackedAddress;
  position: DriverPosition | null;
  /** Rastro percorrido, do mais antigo ao mais recente. */
  trail: readonly GeoPoint[];
  etaMinutes: number | null;
  remainingKm: number | null;
  startedAtLabel?: string;
  hasOrigin: boolean;
  hasDestination: boolean;
}

export interface TrackingRow {
  id: string;
  status: TransportStatus;
  originLat: number | null;
  originLng: number | null;
  originLabel: string;
  destLat: number | null;
  destLng: number | null;
  destLabel: string;
  startedAt: Date | null;
  driverName: string;
  positions: {
    lat: number;
    lng: number;
    heading: number | null;
    speed: number | null;
    recordedAt: Date;
  }[];
}

const TRAIL_CAP = 60;
/** Velocidade media de fallback (km/h) para o ETA sem leitura de speed. */
const FALLBACK_SPEED_KMH = 30;

function tripStatus(status: TransportStatus): TripStatus {
  switch (status) {
    case "EM_ROTA":
      return "EM_ROTA";
    case "CONCLUIDO":
      return "CONCLUIDA";
    case "CANCELADO":
      return "CANCELADA";
    default:
      return "AGUARDANDO";
  }
}

function relativeLabel(date: Date | null, now: Date): string | undefined {
  if (!date) return undefined;
  const diffMin = Math.round((now.getTime() - date.getTime()) / 60000);
  if (diffMin < 1) return "há poucos instantes";
  if (diffMin < 60) return `há ${diffMin} min`;
  const h = Math.floor(diffMin / 60);
  return `há ${h} h`;
}

/** Monta o DTO. Puro: recebe a linha ja carregada e o "agora" (testavel). */
export function buildTracking(row: TrackingRow, now: Date = new Date()): TripTracking {
  const positions = row.positions;
  const latest = positions[positions.length - 1];

  const hasDestination = row.destLat !== null && row.destLng !== null;
  const destPoint: GeoPoint | null = hasDestination
    ? { lat: row.destLat as number, lng: row.destLng as number }
    : null;

  let position: DriverPosition | null = null;
  if (latest) {
    let heading = latest.heading ?? undefined;
    if (heading === undefined && positions.length >= 2) {
      const prev = positions[positions.length - 2]!;
      heading = bearing({ lat: prev.lat, lng: prev.lng }, { lat: latest.lat, lng: latest.lng });
    }
    position = {
      lat: latest.lat,
      lng: latest.lng,
      recordedAt: latest.recordedAt.toISOString(),
      heading,
      speed: latest.speed ?? undefined,
    };
  }

  const trail: GeoPoint[] = subsample(
    positions.map((p) => ({ lat: p.lat, lng: p.lng })),
    TRAIL_CAP,
  );

  const status = tripStatus(row.status);
  const done = status === "CONCLUIDA" || status === "CANCELADA";

  let remainingKm: number | null = null;
  let etaMinutes: number | null = null;
  if (!done && position && destPoint) {
    const remaining = distanceKm({ lat: position.lat, lng: position.lng }, destPoint);
    remainingKm = Number(remaining.toFixed(1));
    const speedKmh = position.speed && position.speed > 3 ? position.speed : FALLBACK_SPEED_KMH;
    etaMinutes = Math.max(1, Math.round((remaining / speedKmh) * 60));
  } else if (done) {
    remainingKm = 0;
    etaMinutes = 0;
  }

  return {
    ticketId: row.id,
    status,
    driverName: row.driverName,
    origin: { lat: row.originLat ?? 0, lng: row.originLng ?? 0, label: row.originLabel },
    destination: { lat: row.destLat ?? 0, lng: row.destLng ?? 0, label: row.destLabel },
    position,
    trail,
    etaMinutes,
    remainingKm,
    startedAtLabel: relativeLabel(row.startedAt, now),
    hasOrigin: row.originLat !== null && row.originLng !== null,
    hasDestination,
  };
}
