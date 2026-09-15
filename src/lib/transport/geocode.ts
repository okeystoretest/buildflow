import type { GeoPoint } from "./geo";

/**
 * Geocodificacao de enderecos via Nominatim (OpenStreetMap). Porta do
 * modulo do Build.Connect.
 *
 * Uso deliberadamente conservador:
 *  - O endereco e texto livre (rua/numero/bairro), sem CEP nem cidade. A taxa
 *    de acerto e baixa, entao a falha e o caso normal, nao a excecao: sem
 *    resultado confiavel devolvemos null e o mapa degrada para "so GPS".
 *  - So chamamos em "Iniciar rota" (origem + destino, uma vez). A coordenada
 *    e persistida no TransportRequest. NUNCA geocodificamos a cada leitura.
 *  - Nominatim exige User-Agent identificavel e limita a ~1 req/s.
 */

const ENDPOINT = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "BuildFlow/1.0 (chamados de motoristas)";
const TIMEOUT_MS = 6_000;
// Cidade padrao acrescentada a consulta: o formulario do Connect nao pede.
const DEFAULT_CITY = process.env.GEOCODE_DEFAULT_CITY ?? "";

export interface AddressParts {
  street?: string | null;
  number?: string | null;
  district?: string | null;
}

/** "Rua A, 10, Centro" — ou o fallback quando nao ha nada. */
export function addressLabel(parts: AddressParts, fallback: string): string {
  return [parts.street, parts.number, parts.district].filter(Boolean).join(", ") || fallback;
}

function espera(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Resolve um endereco em coordenadas. null em QUALQUER falha. */
export async function geocodeAddress(query: string | null): Promise<GeoPoint | null> {
  if (!query || !query.trim()) return null;
  const q = DEFAULT_CITY ? `${query}, ${DEFAULT_CITY}` : query;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const url = `${ENDPOINT}?format=json&limit=1&countrycodes=br&q=${encodeURIComponent(q)}`;
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{ lat?: string; lon?: string }>;
    const first = data[0];
    if (!first?.lat || !first?.lon) return null;
    const lat = Number(first.lat);
    const lng = Number(first.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Geocodifica origem e destino em sequencia (respeitando o rate limit).
 * Qualquer lado pode voltar null independentemente.
 */
export async function geocodeEndpoints(
  origin: AddressParts,
  destination: AddressParts,
): Promise<{ origin: GeoPoint | null; destination: GeoPoint | null }> {
  const o = await geocodeAddress(addressLabel(origin, ""));
  await espera(1_100);
  const d = await geocodeAddress(addressLabel(destination, ""));
  return { origin: o, destination: d };
}
