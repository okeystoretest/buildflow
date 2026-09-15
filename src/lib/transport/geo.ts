/**
 * Geometria da corrida. Puro (sem I/O), compartilhado pelo DTO de
 * rastreamento, pelo calculo de quilometragem na conclusao e pelos checks.
 */

export interface GeoPoint {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_KM = 6371;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Distancia em km entre dois pontos (Haversine). */
export function distanceKm(a: GeoPoint, b: GeoPoint): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/** Rumo em graus (0 = norte, 90 = leste) de `a` para `b`. */
export function bearing(a: GeoPoint, b: GeoPoint): number {
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLng = toRad(b.lng - a.lng);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  const deg = (Math.atan2(y, x) * 180) / Math.PI;
  return (deg + 360) % 360;
}

/**
 * Reduz uma lista a no maximo `cap` pontos, preservando o mais recente
 * (pode devolver cap+1 quando o ultimo nao cai na grade).
 */
export function subsample<T>(items: readonly T[], cap: number): T[] {
  if (items.length <= cap) return [...items];
  const step = items.length / cap;
  const out: T[] = [];
  for (let i = 0; i < cap; i += 1) {
    out.push(items[Math.floor(i * step)]!);
  }
  const last = items[items.length - 1]!;
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

/** Soma das distancias entre pontos consecutivos do rastro, em km. */
export function trailDistanceKm(points: readonly GeoPoint[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    total += distanceKm(points[i - 1]!, points[i]!);
  }
  return total;
}
