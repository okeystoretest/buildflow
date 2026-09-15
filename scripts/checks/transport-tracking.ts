// Checagem do rastreamento: distancia, rumo, subamostragem e o DTO que o
// Connect consome no mapa do solicitante.
// Rodar com: npx tsx scripts/checks/transport-tracking.ts
import { distanceKm, bearing, subsample, trailDistanceKm } from "../../src/lib/transport/geo";
import { buildTracking, type TrackingRow } from "../../src/lib/transport/tracking";

let falhas = 0;
function check(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) {
    falhas++;
    console.log(`FALHOU ${nome}\n  esperado=${JSON.stringify(esperado)}\n  obtido  =${JSON.stringify(obtido)}`);
  }
}
function aprox(nome: string, obtido: number, esperado: number, tol: number) {
  if (Math.abs(obtido - esperado) > tol) {
    falhas++;
    console.log(`FALHOU ${nome}\n  esperado~${esperado} (+-${tol})\n  obtido  =${obtido}`);
  }
}

// Sao Paulo (Se) -> Campinas (centro): ~83 km em linha reta.
const se = { lat: -23.5505, lng: -46.6333 };
const campinas = { lat: -22.9056, lng: -47.0608 };
aprox("distancia SP-Campinas", distanceKm(se, campinas), 83, 3);
check("distancia zero", distanceKm(se, se), 0);
aprox("rumo para o norte", bearing({ lat: 0, lng: 0 }, { lat: 1, lng: 0 }), 0, 0.5);
aprox("rumo para o leste", bearing({ lat: 0, lng: 0 }, { lat: 0, lng: 1 }), 90, 0.5);

const cem = Array.from({ length: 100 }, (_, i) => i);
const amostra = subsample(cem, 10);
check("subamostra cabe no teto (+1 do ultimo)", amostra.length <= 11, true);
check("subamostra preserva o ultimo", amostra[amostra.length - 1], 99);
check("subamostra abaixo do teto e copia", subsample([1, 2, 3], 10), [1, 2, 3]);

aprox("km do rastro", trailDistanceKm([se, campinas, se]), 166, 6);
check("km de rastro vazio", trailDistanceKm([]), 0);

const agora = new Date("2026-09-15T12:00:00Z");
const base: TrackingRow = {
  id: "r1",
  status: "EM_ROTA",
  originLat: -23.55, originLng: -46.63, originLabel: "Rua A, 1, Centro",
  destLat: -23.60, destLng: -46.70, destLabel: "Rua B, 2, Bairro",
  startedAt: new Date("2026-09-15T11:30:00Z"),
  driverName: "Joao",
  positions: [
    { lat: -23.55, lng: -46.63, heading: null, speed: null, recordedAt: new Date("2026-09-15T11:31:00Z") },
    { lat: -23.56, lng: -46.64, heading: null, speed: 40, recordedAt: new Date("2026-09-15T11:35:00Z") },
  ],
};
const dto = buildTracking(base, agora);
check("dto: id", dto.ticketId, "r1");
check("dto: status", dto.status, "EM_ROTA");
check("dto: motorista", dto.driverName, "Joao");
check("dto: tem origem e destino", [dto.hasOrigin, dto.hasDestination], [true, true]);
check("dto: posicao e a ultima", dto.position?.lat, -23.56);
check("dto: rumo derivado das duas ultimas", typeof dto.position?.heading, "number");
check("dto: rastro com 2 pontos", dto.trail.length, 2);
check("dto: km restantes > 0", (dto.remainingKm ?? 0) > 0, true);
check("dto: eta > 0", (dto.etaMinutes ?? 0) > 0, true);
check("dto: iniciado ha 30 min", dto.startedAtLabel, "há 30 min");

const semDestino = buildTracking({ ...base, destLat: null, destLng: null }, agora);
check("sem destino: nao inventa km", semDestino.remainingKm, null);
check("sem destino: hasDestination false", semDestino.hasDestination, false);

const concluido = buildTracking({ ...base, status: "CONCLUIDO" }, agora);
check("concluido: km 0 e eta 0", [concluido.remainingKm, concluido.etaMinutes], [0, 0]);

const semPosicao = buildTracking({ ...base, positions: [] }, agora);
check("sem posicao: position null", semPosicao.position, null);

if (falhas > 0) {
  console.log(`\n${falhas} checagem(ns) falharam.`);
  process.exit(1);
}
console.log("transport-tracking: OK");
