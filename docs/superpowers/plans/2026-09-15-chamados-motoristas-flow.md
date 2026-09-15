# Chamados de Motoristas no Build.Flow — Plano de Implementação (etapa 1: Flow)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O Flow passa a ser o dono dos chamados de Motoristas: recebe do Connect por API, gerencia no módulo Motorista (Chamados e Dashboard), rastreia a corrida por GPS e avisa o Connect por webhook.

**Architecture:** Modelo próprio (`TransportRequest` + imagens, posições e histórico), sem tocar em `Order`/`Delivery`. Lógica de domínio em `src/lib/transport/` (puro onde possível, para os `scripts/checks`), integração em `src/lib/integration/`, API em `src/app/api/integracao/connect/`, telas em `src/app/(dashboard)/motorista/{chamados,dashboard}/` com um layout de ferramentas. Tempo real pelo bus existente (`RealtimeEvent`); avisos por push e WhatsApp existentes.

**Tech Stack:** Next.js 14.2 (App Router, params/cookies SÍNCRONOS), React 18, TypeScript strict (`noUnusedLocals`), Prisma 5.22 + PostgreSQL, zod, sharp, Tailwind + shadcn tokens, lucide-react, `tsx` para checks.

**Spec:** `docs/superpowers/specs/2026-09-15-chamados-motoristas-connect-flow-design.md`

## Global Constraints

- Arquivos nunca viram blob: só o caminho (`filePath`) vai ao banco; imagens passam por `processAndSaveImage` (sharp → `.webp`).
- Toda API de integração exige `Authorization: Bearer <CONNECT_INTEGRATION_TOKEN>`, comparado em tempo constante; token ausente no ambiente → 503.
- Status: `ABERTO`, `ATRIBUIDO`, `EM_ROTA`, `CONCLUIDO`, `CANCELADO` (enum `TransportStatus`).
- Webhook: `X-Flow-Timestamp` (epoch ms) + `X-Flow-Signature` = HMAC-SHA256(`${timestamp}.${corpo}`, `CONNECT_WEBHOOK_SECRET`) em hex; 3 tentativas (0s, 5s, 30s); sem fila persistente.
- Concluídos somem do quadro após 15 min; ficam no histórico.
- Verificação do projeto: `npx tsc --noEmit`, `npm run build`, `npx tsx scripts/checks/<arquivo>.ts`. Não há ESLint nem suíte de testes.
- Commits pequenos por tarefa. Nunca `git push` sem pedido do usuário.
- Comentários e textos de UI em português, no tom dos arquivos vizinhos.

---

### Task 1: Modelo de dados e migration

**Files:**
- Modify: `prisma/schema.prisma` (após `model DriverPayment`, antes de `// NOTIFICACOES`; e a relação em `model User`)
- Create: `prisma/migrations/<timestamp>_transport_requests/migration.sql` (gerada pelo Prisma)

**Interfaces:**
- Produces: modelos Prisma `TransportRequest`, `TransportImage`, `TransportPosition`, `TransportHistory`, enum `TransportStatus`; relação `User.transportRequests`.

- [ ] **Step 1: Adicionar os modelos ao schema**

Em `prisma/schema.prisma`, logo após o bloco `model DriverPayment { ... }`, insira:

```prisma
// ===========================================================================
// CHAMADOS DE MOTORISTAS (vindos do Build.Connect)
// ===========================================================================

// Chamado de transporte aberto no Build.Connect e gerido aqui. NAO e pedido:
// nao passa por Order/Delivery nem pelo pagamento de motoristas. O Connect
// e quem abre e acompanha; o Flow e o dono do registro a partir da chegada.
enum TransportStatus {
  ABERTO
  ATRIBUIDO
  EM_ROTA
  CONCLUIDO
  CANCELADO
}

model TransportRequest {
  id        String          @id @default(cuid())
  // Id do Ticket no Connect. Unico: reenviar o mesmo chamado nao duplica.
  connectId String          @unique
  // Codigo que a operacao fala em voz alta ("o MOT-014 ja foi?"). Vem do Connect.
  code      String
  status    TransportStatus @default(ABERTO)

  // Solicitante e SNAPSHOT do Connect — nao existe como usuario do Flow.
  requesterConnectId String
  requesterName      String
  requesterSector    String?
  contact            String?

  serviceType String
  description String

  // Origem: unidade (rotulo) OU endereco manual. Destino: endereco.
  originUnit     String?
  originStreet   String?
  originNumber   String?
  originDistrict String?
  destStreet     String
  destNumber     String?
  destDistrict   String?

  // Coordenadas geocodificadas UMA vez em "Iniciar rota" (nulas se falhar:
  // o mapa do Connect degrada para "so GPS ao vivo").
  originLat Float?
  originLng Float?
  destLat   Float?
  destLng   Float?

  driver   User?   @relation("TransportDriver", fields: [driverId], references: [id])
  driverId String?
  // Quem atribuiu (Logistica/Gestao) — null quando o proprio motorista assumiu.
  assignedById String?

  assignedAt   DateTime?
  startedAt    DateTime?
  finishedAt   DateTime?
  distanceKm   Float?
  // Comprovante (.webp). So o caminho, como todo arquivo do sistema.
  proofPath    String?
  cancelReason String?

  images    TransportImage[]
  positions TransportPosition[]
  history   TransportHistory[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([status])
  @@index([driverId])
  @@index([createdAt])
}

// Fotos anexadas na abertura (copia das do Connect).
model TransportImage {
  id        String           @id @default(cuid())
  request   TransportRequest @relation(fields: [requestId], references: [id], onDelete: Cascade)
  requestId String
  filePath  String
  order     Int              @default(0)

  @@index([requestId, order])
}

// Rastro GPS da corrida.
model TransportPosition {
  id         String           @id @default(cuid())
  request    TransportRequest @relation(fields: [requestId], references: [id], onDelete: Cascade)
  requestId  String
  lat        Float
  lng        Float
  heading    Float?
  speed      Float?
  recordedAt DateTime         @default(now())

  @@index([requestId, recordedAt])
}

// Linha do tempo mostrada nos dois sistemas.
model TransportHistory {
  id        String           @id @default(cuid())
  request   TransportRequest @relation(fields: [requestId], references: [id], onDelete: Cascade)
  requestId String
  // "criado" | "atribuido" | "assumido" | "desatribuido" | "em_rota" | "concluido" | "cancelado"
  event     String
  // Nome de quem fez (motorista/gestao) ou "Build.Connect".
  actorName String?
  note      String?
  createdAt DateTime         @default(now())

  @@index([requestId, createdAt])
}
```

Em `model User`, após a linha `driverPayments   DriverPayment[] @relation("DriverPaymentDriver")`, adicione:

```prisma
  transportRequests TransportRequest[] @relation("TransportDriver")
```

- [ ] **Step 2: Gerar e aplicar a migration no banco local**

Run: `npx prisma migrate dev --name transport_requests`
Expected: pasta `prisma/migrations/<timestamp>_transport_requests/` criada com `CREATE TYPE "TransportStatus"` e as quatro `CREATE TABLE`; client regenerado; sem erro.

- [ ] **Step 3: Conferir a tipagem**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "Chamados de motoristas: modelo TransportRequest (imagens, posicoes, historico)"
```

---

### Task 2: Regras de status (puro) + check

**Files:**
- Create: `src/lib/transport/status.ts`
- Create: `scripts/checks/transport-status.ts`

**Interfaces:**
- Produces:
  - `TRANSPORT_COLUMNS: readonly TransportStatus[]` = `["ABERTO","ATRIBUIDO","EM_ROTA","CONCLUIDO"]`
  - `TRANSPORT_STATUS_STYLE: Record<TransportStatus, { label; badge; dot; header }>`
  - `toConnectStatus(status: TransportStatus): "PENDENTE"|"ATRIBUIDO"|"EM_ANDAMENTO"|"CONCLUIDO"|"CANCELADO"`
  - `canTransition(from: TransportStatus, to: TransportStatus): boolean`
  - `isFinal(status: TransportStatus): boolean`
  - `CONCLUDED_WINDOW_MIN = 15`

- [ ] **Step 1: Escrever o check (falha primeiro)**

`scripts/checks/transport-status.ts`:

```ts
// Checagem das regras de status do chamado de transporte.
// Rodar com: npx tsx scripts/checks/transport-status.ts
//
// O que esta em jogo: a transicao decide o que cada botao do quadro pode
// fazer, e o mapeamento e o que o Connect grava no espelho. Errar aqui
// aparece nos DOIS sistemas.
import {
  TRANSPORT_COLUMNS,
  TRANSPORT_STATUS_STYLE,
  toConnectStatus,
  canTransition,
  isFinal,
  CONCLUDED_WINDOW_MIN,
} from "../../src/lib/transport/status";

let falhas = 0;
function check(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) {
    falhas++;
    console.log(`FALHOU ${nome}\n  esperado=${JSON.stringify(esperado)}\n  obtido  =${JSON.stringify(obtido)}`);
  }
}

check("colunas do quadro", TRANSPORT_COLUMNS, ["ABERTO", "ATRIBUIDO", "EM_ROTA", "CONCLUIDO"]);
check("janela de concluidos", CONCLUDED_WINDOW_MIN, 15);

// Mapeamento para o Connect (enum TicketStatus de la).
check("aberto -> pendente", toConnectStatus("ABERTO"), "PENDENTE");
check("atribuido -> atribuido", toConnectStatus("ATRIBUIDO"), "ATRIBUIDO");
check("em rota -> em andamento", toConnectStatus("EM_ROTA"), "EM_ANDAMENTO");
check("concluido -> concluido", toConnectStatus("CONCLUIDO"), "CONCLUIDO");
check("cancelado -> cancelado", toConnectStatus("CANCELADO"), "CANCELADO");

// Transicoes permitidas (o fluxo do Connect: Em Aberto -> Atribuido -> Em Rota -> Concluido).
check("aberto -> atribuido", canTransition("ABERTO", "ATRIBUIDO"), true);
check("atribuido -> em rota", canTransition("ATRIBUIDO", "EM_ROTA"), true);
check("atribuido -> aberto (desatribuir)", canTransition("ATRIBUIDO", "ABERTO"), true);
check("em rota -> concluido", canTransition("EM_ROTA", "CONCLUIDO"), true);
check("aberto -> cancelado", canTransition("ABERTO", "CANCELADO"), true);
check("atribuido -> cancelado", canTransition("ATRIBUIDO", "CANCELADO"), true);
check("em rota -> cancelado", canTransition("EM_ROTA", "CANCELADO"), true);
// Proibidas.
check("aberto -> em rota (pula atribuicao)", canTransition("ABERTO", "EM_ROTA"), false);
check("aberto -> concluido", canTransition("ABERTO", "CONCLUIDO"), false);
check("em rota -> aberto", canTransition("EM_ROTA", "ABERTO"), false);
check("concluido -> qualquer", canTransition("CONCLUIDO", "ABERTO"), false);
check("cancelado -> qualquer", canTransition("CANCELADO", "ATRIBUIDO"), false);
check("mesmo status", canTransition("ABERTO", "ABERTO"), false);

check("final: concluido", isFinal("CONCLUIDO"), true);
check("final: cancelado", isFinal("CANCELADO"), true);
check("final: em rota", isFinal("EM_ROTA"), false);

// Todo status tem estilo com rotulo (o badge nunca cai em undefined).
for (const s of ["ABERTO", "ATRIBUIDO", "EM_ROTA", "CONCLUIDO", "CANCELADO"] as const) {
  check(`estilo ${s} tem label`, typeof TRANSPORT_STATUS_STYLE[s].label, "string");
}

if (falhas > 0) {
  console.log(`\n${falhas} checagem(ns) falharam.`);
  process.exit(1);
}
console.log("transport-status: OK");
```

- [ ] **Step 2: Rodar o check para vê-lo falhar**

Run: `npx tsx scripts/checks/transport-status.ts`
Expected: erro de módulo não encontrado (`src/lib/transport/status`).

- [ ] **Step 3: Implementar o módulo**

`src/lib/transport/status.ts`:

```ts
import type { TransportStatus } from "@prisma/client";

/**
 * Regras de status do chamado de transporte (vindo do Build.Connect).
 *
 * Puro — sem I/O — para servir tanto as Server Actions quanto os
 * scripts/checks. O fluxo e o MESMO do Connect: Em Aberto -> Atribuido ->
 * Em Rota -> Concluido, com Cancelado como saida a qualquer momento antes do
 * fim. "Desatribuir" devolve para Em Aberto.
 */

/** Colunas do quadro, na ordem. Cancelado nao tem coluna: vai ao historico. */
export const TRANSPORT_COLUMNS: readonly TransportStatus[] = [
  "ABERTO",
  "ATRIBUIDO",
  "EM_ROTA",
  "CONCLUIDO",
];

/** Concluido fica este tempo no quadro e depois so aparece no historico. */
export const CONCLUDED_WINDOW_MIN = 15;

export interface TransportStatusStyle {
  label: string;
  badge: string;
  dot: string;
  header: string;
}

// Mesma forma do STATUS_STYLE de order-flow.ts, para o badge e o cabecalho
// de coluna ficarem iguais aos do resto do sistema.
export const TRANSPORT_STATUS_STYLE: Record<TransportStatus, TransportStatusStyle> = {
  ABERTO:    { label: "Em Aberto",  badge: "bg-amber-500/15 text-amber-600 dark:text-amber-400", dot: "bg-amber-600",  header: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40" },
  ATRIBUIDO: { label: "Atribuído",  badge: "bg-sky-400/15 text-sky-700 dark:text-sky-300",       dot: "bg-sky-400",    header: "bg-sky-400/15 text-sky-700 dark:text-sky-300 border-sky-400/40" },
  EM_ROTA:   { label: "Em Rota",    badge: "bg-motorista/15 text-motorista",                     dot: "bg-motorista",  header: "bg-motorista/15 text-motorista border-motorista/40" },
  CONCLUIDO: { label: "Concluído",  badge: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300", dot: "bg-emerald-600", header: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40" },
  CANCELADO: { label: "Cancelado",  badge: "bg-destructive/15 text-destructive",                 dot: "bg-destructive", header: "bg-destructive/15 text-destructive border-destructive/40" },
};

/** Status como o Connect o grava no espelho (enum TicketStatus de la). */
export type ConnectTicketStatus =
  | "PENDENTE"
  | "ATRIBUIDO"
  | "EM_ANDAMENTO"
  | "CONCLUIDO"
  | "CANCELADO";

export function toConnectStatus(status: TransportStatus): ConnectTicketStatus {
  switch (status) {
    case "ABERTO":
      return "PENDENTE";
    case "ATRIBUIDO":
      return "ATRIBUIDO";
    case "EM_ROTA":
      return "EM_ANDAMENTO";
    case "CONCLUIDO":
      return "CONCLUIDO";
    case "CANCELADO":
      return "CANCELADO";
  }
}

const ALLOWED: Record<TransportStatus, readonly TransportStatus[]> = {
  ABERTO: ["ATRIBUIDO", "CANCELADO"],
  ATRIBUIDO: ["EM_ROTA", "ABERTO", "CANCELADO"],
  EM_ROTA: ["CONCLUIDO", "CANCELADO"],
  CONCLUIDO: [],
  CANCELADO: [],
};

export function canTransition(from: TransportStatus, to: TransportStatus): boolean {
  return ALLOWED[from].includes(to);
}

export function isFinal(status: TransportStatus): boolean {
  return status === "CONCLUIDO" || status === "CANCELADO";
}
```

- [ ] **Step 4: Rodar o check e o tsc**

Run: `npx tsx scripts/checks/transport-status.ts && npx tsc --noEmit`
Expected: `transport-status: OK` e tsc limpo.

- [ ] **Step 5: Commit**

```bash
git add src/lib/transport/status.ts scripts/checks/transport-status.ts
git commit -m "Chamados de motoristas: regras de status e mapeamento para o Connect"
```

---

### Task 3: Geocodificação e DTO de rastreamento (porta do Connect) + check

**Files:**
- Create: `src/lib/transport/geo.ts` (puro: Haversine, bearing, subamostragem, km do rastro)
- Create: `src/lib/transport/geocode.ts` (Nominatim)
- Create: `src/lib/transport/tracking.ts` (monta o DTO a partir de uma linha do banco — puro)
- Create: `scripts/checks/transport-tracking.ts`

**Interfaces:**
- Produces:
  - `geo.ts`: `distanceKm(a: GeoPoint, b: GeoPoint): number`, `bearing(a, b): number`, `subsample<T>(items, cap): T[]`, `trailDistanceKm(points: GeoPoint[]): number`, `GeoPoint { lat; lng }`.
  - `geocode.ts`: `geocodeAddress(query: string | null): Promise<GeoPoint | null>`, `geocodeEndpoints(origin: AddressParts, destination: AddressParts): Promise<{ origin: GeoPoint | null; destination: GeoPoint | null }>`, `AddressParts { street; number; district }` (todos `string | null | undefined`), `addressLabel(parts: AddressParts, fallback: string): string`.
  - `tracking.ts`: `TripTracking` (mesmo DTO do Connect), `TrackingRow`, `buildTracking(row: TrackingRow, now?: Date): TripTracking`.

- [ ] **Step 1: Escrever o check (falha primeiro)**

`scripts/checks/transport-tracking.ts`:

```ts
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
    console.log(`FALHOU ${nome}\n  esperado~${esperado} (±${tol})\n  obtido  =${obtido}`);
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
```

- [ ] **Step 2: Rodar o check para vê-lo falhar**

Run: `npx tsx scripts/checks/transport-tracking.ts`
Expected: módulo não encontrado.

- [ ] **Step 3: Implementar `geo.ts`**

`src/lib/transport/geo.ts`:

```ts
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
```

- [ ] **Step 4: Implementar `geocode.ts`**

`src/lib/transport/geocode.ts`:

```ts
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
```

- [ ] **Step 5: Implementar `tracking.ts`**

`src/lib/transport/tracking.ts`:

```ts
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
```

- [ ] **Step 6: Rodar o check e o tsc**

Run: `npx tsx scripts/checks/transport-tracking.ts && npx tsc --noEmit`
Expected: `transport-tracking: OK`, tsc limpo.

- [ ] **Step 7: Commit**

```bash
git add src/lib/transport/geo.ts src/lib/transport/geocode.ts src/lib/transport/tracking.ts scripts/checks/transport-tracking.ts
git commit -m "Chamados de motoristas: geometria, geocodificacao e DTO de rastreamento (porta do Connect)"
```

---

### Task 4: Autenticação da API e assinatura do webhook (puro) + check

**Files:**
- Create: `src/lib/integration/signature.ts` (puro)
- Create: `src/lib/integration/connect-auth.ts` (lê env + Request)
- Create: `scripts/checks/integration-signature.ts`

**Interfaces:**
- Produces:
  - `signature.ts`: `signWebhook(secret: string, timestamp: number, body: string): string` (hex), `safeEqual(a: string, b: string): boolean`, `verifyBearer(header: string | null, expected: string): boolean`.
  - `connect-auth.ts`: `requireConnectToken(req: Request): Response | null` (null = autorizado; senão a resposta 401/503 pronta), `integrationEnv(): { token: string; webhookUrl: string; webhookSecret: string } | null`.

- [ ] **Step 1: Escrever o check (falha primeiro)**

`scripts/checks/integration-signature.ts`:

```ts
// Checagem da assinatura do webhook e da comparacao do token de servico.
// Rodar com: npx tsx scripts/checks/integration-signature.ts
import { createHmac } from "node:crypto";
import { signWebhook, safeEqual, verifyBearer } from "../../src/lib/integration/signature";

let falhas = 0;
function check(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) {
    falhas++;
    console.log(`FALHOU ${nome}\n  esperado=${JSON.stringify(esperado)}\n  obtido  =${JSON.stringify(obtido)}`);
  }
}

const secret = "segredo-de-teste";
const ts = 1757937600000;
const body = JSON.stringify({ connectId: "abc", status: "EM_ROTA" });
const esperado = createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex");
check("assinatura = HMAC(ts.body)", signWebhook(secret, ts, body), esperado);
check("assinatura muda com o corpo", signWebhook(secret, ts, body + " ") === esperado, false);
check("assinatura muda com o timestamp", signWebhook(secret, ts + 1, body) === esperado, false);

check("safeEqual iguais", safeEqual("abc", "abc"), true);
check("safeEqual diferentes", safeEqual("abc", "abd"), false);
check("safeEqual tamanhos diferentes", safeEqual("abc", "abcd"), false);
check("safeEqual vazio", safeEqual("", ""), true);

check("bearer correto", verifyBearer("Bearer tok-123", "tok-123"), true);
check("bearer errado", verifyBearer("Bearer tok-999", "tok-123"), false);
check("bearer sem prefixo", verifyBearer("tok-123", "tok-123"), false);
check("bearer ausente", verifyBearer(null, "tok-123"), false);
check("bearer com esperado vazio nunca passa", verifyBearer("Bearer ", ""), false);

if (falhas > 0) {
  console.log(`\n${falhas} checagem(ns) falharam.`);
  process.exit(1);
}
console.log("integration-signature: OK");
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `npx tsx scripts/checks/integration-signature.ts`
Expected: módulo não encontrado.

- [ ] **Step 3: Implementar `signature.ts`**

`src/lib/integration/signature.ts`:

```ts
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Primitivas de seguranca da integracao com o Build.Connect. Puras, para os
 * checks: nao leem env nem Request.
 */

/** HMAC-SHA256 de `${timestamp}.${body}`, em hex. O Connect verifica o mesmo. */
export function signWebhook(secret: string, timestamp: number, body: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

/** Comparacao em tempo constante. Tamanhos diferentes = falso, sem vazar onde. */
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/** `Authorization: Bearer <token>` bate com o esperado? Esperado vazio nunca passa. */
export function verifyBearer(header: string | null, expected: string): boolean {
  if (!expected) return false;
  if (!header || !header.startsWith("Bearer ")) return false;
  const given = header.slice("Bearer ".length).trim();
  return safeEqual(given, expected);
}
```

- [ ] **Step 4: Implementar `connect-auth.ts`**

`src/lib/integration/connect-auth.ts`:

```ts
import { NextResponse } from "next/server";
import { verifyBearer } from "./signature";

/**
 * Variaveis da integracao com o Build.Connect. Sem as tres, a integracao fica
 * DESLIGADA com erro explicito (503 na API, log no webhook) — nunca aberta.
 *
 *   CONNECT_INTEGRATION_TOKEN  bearer aceito na API de integracao
 *   CONNECT_WEBHOOK_URL        base do Connect na rede interna (http://buildconnect:3000)
 *   CONNECT_WEBHOOK_SECRET     chave do HMAC do webhook
 */
export function integrationEnv(): {
  token: string;
  webhookUrl: string;
  webhookSecret: string;
} | null {
  const token = process.env.CONNECT_INTEGRATION_TOKEN?.trim();
  const webhookUrl = process.env.CONNECT_WEBHOOK_URL?.trim().replace(/\/+$/, "");
  const webhookSecret = process.env.CONNECT_WEBHOOK_SECRET?.trim();
  if (!token || !webhookUrl || !webhookSecret) return null;
  return { token, webhookUrl, webhookSecret };
}

/**
 * Porta da API de integracao. Devolve null quando o chamador esta autorizado;
 * caso contrario, a resposta pronta (503 sem configuracao, 401 sem token).
 */
export function requireConnectToken(req: Request): Response | null {
  const env = integrationEnv();
  if (!env) {
    console.error("[integracao] CONNECT_INTEGRATION_TOKEN/WEBHOOK_URL/WEBHOOK_SECRET ausentes.");
    return NextResponse.json(
      { error: "Integração com o Build.Connect não configurada." },
      { status: 503 },
    );
  }
  if (!verifyBearer(req.headers.get("authorization"), env.token)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  return null;
}
```

- [ ] **Step 5: Rodar check e tsc**

Run: `npx tsx scripts/checks/integration-signature.ts && npx tsc --noEmit`
Expected: `integration-signature: OK`, tsc limpo.

- [ ] **Step 6: Commit**

```bash
git add src/lib/integration scripts/checks/integration-signature.ts
git commit -m "Integracao Connect: token de servico e assinatura HMAC do webhook"
```

---

### Task 5: Consultas, avisos e Server Actions do chamado

**Files:**
- Modify: `src/lib/realtime/bus.ts:18` (tipo do evento)
- Create: `src/lib/integration/webhook.ts` (envio ao Connect com 3 tentativas)
- Create: `src/lib/transport/notify.ts` (realtime + push + WhatsApp + webhook)
- Create: `src/lib/transport/queries.ts` (leituras + DTO de tela)
- Create: `src/lib/transport/actions.ts` (Server Actions)

**Interfaces:**
- Consumes: `canTransition`, `isFinal`, `CONCLUDED_WINDOW_MIN`, `toConnectStatus` (Task 2); `geocodeEndpoints`, `addressLabel` (Task 3); `trailDistanceKm` (Task 3); `signWebhook`, `integrationEnv` (Task 4).
- Produces:
  - `queries.ts`: `TransportView` (DTO de tela), `listBoard(): Promise<TransportView[]>` (não finais + concluídos na janela), `listHistory(limit = 100): Promise<TransportView[]>`, `getTransportByConnectId(connectId)`, `listActiveDrivers(): Promise<{ id; name }[]>`, `toView(row): TransportView`, `TRANSPORT_VIEW_SELECT`.
  - `actions.ts`: `assignTransport({ requestId, driverId })`, `claimTransport({ requestId })`, `unassignTransport({ requestId })`, `startTransportRoute({ requestId })`, `pushTransportPosition({ requestId, lat, lng, heading?, speed? })`, `completeTransport(formData)` (campos `requestId`, `photo`), `cancelTransport({ requestId, reason })` — todas `Promise<ActionResult<void>>`.
  - `notify.ts`: `afterTransportChange(requestId: string, event: TransportEventKind): void` (fire-and-forget).
  - `webhook.ts`: `sendConnectWebhook(payload: ConnectWebhookPayload): Promise<void>`.

- [ ] **Step 1: Estender o tipo de evento do bus**

Em `src/lib/realtime/bus.ts`, troque a linha 18:

```ts
export type RealtimeEventType = "order.created" | "order.updated";
```

por:

```ts
// `transport.*`: chamado de motorista (vindo do Connect). `orderId` guarda o
// id do TransportRequest — o bus e generico por id, so o tipo diferencia.
export type RealtimeEventType =
  | "order.created"
  | "order.updated"
  | "transport.created"
  | "transport.updated";
```

- [ ] **Step 2: Criar `webhook.ts`**

`src/lib/integration/webhook.ts`:

```ts
import { signWebhook } from "./signature";
import { integrationEnv } from "./connect-auth";
import type { ConnectTicketStatus } from "@/lib/transport/status";

/**
 * Aviso ao Build.Connect a cada mudanca de status do chamado.
 *
 * Melhor esforco: 3 tentativas (0s, 5s, 30s) e depois so o log. Nao ha fila
 * persistente de proposito — a rede de seguranca e o Connect reconciliar na
 * leitura (ele reconsulta chamados nao finais com espelho velho). O receptor
 * de la aplica ESTADO, nao transicao, entao repeticao e desordem sao inofensivas.
 */

export interface ConnectWebhookPayload {
  connectId: string;
  flowId: string;
  status: ConnectTicketStatus;
  driverName: string | null;
  assignedAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  distanceKm: number | null;
  cancelReason: string | null;
}

const RETRY_DELAYS_MS = [0, 5_000, 30_000];
const TIMEOUT_MS = 8_000;

function espera(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function tentar(url: string, secret: string, body: string): Promise<boolean> {
  const timestamp = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-flow-timestamp": String(timestamp),
        "x-flow-signature": signWebhook(secret, timestamp, body),
      },
      body,
      signal: controller.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function sendConnectWebhook(payload: ConnectWebhookPayload): Promise<void> {
  const env = integrationEnv();
  if (!env) {
    console.error("[webhook] integracao nao configurada; aviso ao Connect nao enviado.");
    return;
  }
  const url = `${env.webhookUrl}/api/integracao/flow/webhook`;
  const body = JSON.stringify(payload);

  for (let i = 0; i < RETRY_DELAYS_MS.length; i += 1) {
    if (RETRY_DELAYS_MS[i]! > 0) await espera(RETRY_DELAYS_MS[i]!);
    if (await tentar(url, env.webhookSecret, body)) return;
    console.warn(`[webhook] tentativa ${i + 1} falhou para ${payload.connectId}`);
  }
  console.error(`[webhook] desistiu apos ${RETRY_DELAYS_MS.length} tentativas: ${payload.connectId}`);
}
```

- [ ] **Step 3: Criar `queries.ts`**

`src/lib/transport/queries.ts`:

```ts
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
```

- [ ] **Step 4: Criar `notify.ts`**

`src/lib/transport/notify.ts`:

```ts
import { prisma } from "@/lib/prisma";
import { publish } from "@/lib/realtime/bus";
import { sendPushToRole, sendPushToUser } from "@/lib/push";
import { sendWhatsappToDrivers } from "@/lib/whatsapp";
import { sendConnectWebhook } from "@/lib/integration/webhook";
import { toConnectStatus } from "./status";

/**
 * Efeitos de uma mudanca no chamado: tempo real (quadro), aviso ativo
 * (push/WhatsApp) e webhook ao Connect. Fire-and-forget em tudo — aviso nunca
 * derruba a acao que o causou.
 */

export type TransportEventKind =
  | "criado"
  | "atribuido"
  | "assumido"
  | "desatribuido"
  | "em_rota"
  | "concluido"
  | "cancelado";

const MSG_CHAMADO_ATRIBUIDO =
  "Um chamado de transporte foi atribuído a você no Build.Flow. Abra o módulo Motorista para ver os detalhes.";
const MSG_CHAMADO_ABERTO =
  "Há um novo chamado de transporte em aberto no Build.Flow. Quem assumir primeiro leva.";

export function afterTransportChange(requestId: string, kind: TransportEventKind): void {
  void (async () => {
    const r = await prisma.transportRequest.findUnique({
      where: { id: requestId },
      select: {
        id: true,
        connectId: true,
        code: true,
        status: true,
        driverId: true,
        driver: { select: { name: true } },
        assignedAt: true,
        startedAt: true,
        finishedAt: true,
        distanceKm: true,
        cancelReason: true,
      },
    });
    if (!r) return;

    // 1) Quadro (todos que estao olhando) — e aviso em foco para o motorista
    //    afetado, via notifyRoles.
    const notifyRoles =
      kind === "criado" && !r.driverId ? (["MOTORISTA"] as const) : ([] as const);
    publish({
      type: kind === "criado" ? "transport.created" : "transport.updated",
      orderId: r.id,
      orderNumber: r.code,
      status: r.status,
      notifyRoles: [...notifyRoles],
    });

    // 2) Aviso ativo ao motorista.
    if (kind === "atribuido" && r.driverId) {
      void sendPushToUser(r.driverId, {
        title: "Chamado de transporte atribuído",
        body: `${r.code} foi atribuído a você.`,
        url: "/motorista/chamados",
        tag: `transport-${r.id}`,
      }).catch((err) => console.error("[push] chamado p/ motorista falhou:", err));
      void sendWhatsappToDrivers({ driverId: r.driverId, text: MSG_CHAMADO_ATRIBUIDO }).catch(
        (err) => console.error("[whatsapp] chamado p/ motorista falhou:", err),
      );
    } else if (kind === "criado" && !r.driverId) {
      void sendPushToRole("MOTORISTA", {
        title: "Chamado de transporte em aberto",
        body: `${r.code} aguardando motorista.`,
        url: "/motorista/chamados",
        tag: `transport-${r.id}`,
      }).catch((err) => console.error("[push] chamado aberto falhou:", err));
      void sendWhatsappToDrivers({ text: MSG_CHAMADO_ABERTO }).catch((err) =>
        console.error("[whatsapp] chamado aberto falhou:", err),
      );
    }

    // 3) Connect. "criado" nao avisa: quem criou foi o proprio Connect.
    if (kind !== "criado") {
      await sendConnectWebhook({
        connectId: r.connectId,
        flowId: r.id,
        status: toConnectStatus(r.status),
        driverName: r.driver?.name ?? null,
        assignedAt: r.assignedAt?.toISOString() ?? null,
        startedAt: r.startedAt?.toISOString() ?? null,
        finishedAt: r.finishedAt?.toISOString() ?? null,
        distanceKm: r.distanceKm,
        cancelReason: r.cancelReason,
      });
    }
  })().catch((err) => console.error("[transporte] pos-mudanca falhou:", err));
}
```

- [ ] **Step 5: Criar `actions.ts`**

`src/lib/transport/actions.ts`:

```ts
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
```

- [ ] **Step 6: tsc**

Run: `npx tsc --noEmit`
Expected: limpo.

- [ ] **Step 7: Commit**

```bash
git add src/lib/realtime/bus.ts src/lib/integration/webhook.ts src/lib/transport
git commit -m "Chamados de motoristas: consultas, actions e avisos (tempo real, push, WhatsApp, webhook)"
```

---

### Task 6: API de integração para o Connect

**Files:**
- Create: `src/lib/transport/create.ts` (upsert idempotente por `connectId`)
- Create: `src/app/api/integracao/connect/motoristas/route.ts`
- Create: `src/app/api/integracao/connect/chamados/route.ts` (POST)
- Create: `src/app/api/integracao/connect/chamados/[connectId]/route.ts` (GET)
- Create: `src/app/api/integracao/connect/chamados/[connectId]/rastreamento/route.ts`
- Create: `src/app/api/integracao/connect/chamados/[connectId]/comprovante/route.ts`
- Modify: `src/middleware.ts:12` (`PUBLIC_PATHS`)

**Interfaces:**
- Consumes: `requireConnectToken` (Task 4); `listActiveDrivers`, `getTransportByConnectId` (Task 5); `buildTracking` (Task 3); `afterTransportChange` (Task 5); `resolveUploadedFilePath` (`@/lib/image`); `checkRate` (`@/lib/rate-limit`); `getClientIp` (`@/lib/request-ip`).
- Produces: `createFromConnect(input: CreateFromConnectInput, images: File[]): Promise<{ id: string; status: TransportStatus; driver: { id: string; name: string } | null; created: boolean }>`.

- [ ] **Step 1: Liberar o prefixo no middleware**

Em `src/middleware.ts`, troque:

```ts
const PUBLIC_PATHS = ["/login", "/api/health", "/acompanhar"];
```

por:

```ts
// /api/integracao e maquina-a-maquina (Build.Connect): autentica por token de
// servico dentro de cada rota, nao por cookie de sessao.
const PUBLIC_PATHS = ["/login", "/api/health", "/acompanhar", "/api/integracao"];
```

- [ ] **Step 2: Criar `create.ts`**

`src/lib/transport/create.ts`:

```ts
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
```

- [ ] **Step 3: Rota `motoristas`**

`src/app/api/integracao/connect/motoristas/route.ts`:

```ts
import { NextResponse } from "next/server";
import { requireConnectToken } from "@/lib/integration/connect-auth";
import { listActiveDrivers } from "@/lib/transport/queries";

// GET /api/integracao/connect/motoristas — MOTORISTA ativos para o formulario
// do Connect. Sem dados alem de id e nome.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const denied = requireConnectToken(req);
  if (denied) return denied;
  const drivers = await listActiveDrivers();
  return NextResponse.json({ drivers }, { headers: { "Cache-Control": "no-store" } });
}
```

- [ ] **Step 4: Rota `chamados` (POST)**

`src/app/api/integracao/connect/chamados/route.ts`:

```ts
import { NextResponse } from "next/server";
import { requireConnectToken } from "@/lib/integration/connect-auth";
import { checkRate } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-ip";
import { createFromConnect, createFromConnectSchema } from "@/lib/transport/create";

// POST /api/integracao/connect/chamados — multipart: campo `payload` (JSON com
// o chamado) + `images` (0..5 fotos). Idempotente por connectId.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const denied = requireConnectToken(req);
  if (denied) return denied;

  // Teto generoso: e uma maquina falando, mas um loop de reenvio com bug nao
  // pode afogar o banco.
  const rate = checkRate(`integracao:${getClientIp()}`, { max: 120, windowMs: 60_000 });
  if (!rate.allowed) {
    return NextResponse.json({ error: "Muitas requisições." }, { status: 429 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Corpo inválido (esperado multipart)." }, { status: 400 });
  }

  let raw: unknown;
  try {
    raw = JSON.parse(String(form.get("payload") ?? ""));
  } catch {
    return NextResponse.json({ error: "Campo payload inválido." }, { status: 400 });
  }
  const parsed = createFromConnectSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Chamado inválido.", issues: parsed.error.issues }, { status: 422 });
  }

  const images = form.getAll("images").filter((f): f is File => f instanceof File && f.size > 0);

  try {
    const result = await createFromConnect(parsed.data, images);
    return NextResponse.json(
      { id: result.id, status: result.status, driver: result.driver },
      { status: result.created ? 201 : 200 },
    );
  } catch (err) {
    console.error("[integracao] criar chamado falhou:", err);
    const msg = err instanceof Error ? err.message : "Falha ao criar o chamado.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
```

- [ ] **Step 5: Rota de detalhe**

`src/app/api/integracao/connect/chamados/[connectId]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { requireConnectToken } from "@/lib/integration/connect-auth";
import { getTransportByConnectId } from "@/lib/transport/queries";
import { toConnectStatus } from "@/lib/transport/status";

// GET /api/integracao/connect/chamados/:connectId — detalhe + status no
// vocabulario do Connect + historico.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: { connectId: string } },
): Promise<Response> {
  const denied = requireConnectToken(req);
  if (denied) return denied;

  const r = await getTransportByConnectId(params.connectId);
  if (!r) return NextResponse.json({ error: "Chamado não encontrado." }, { status: 404 });

  return NextResponse.json(
    {
      id: r.id,
      connectId: r.connectId,
      code: r.code,
      status: toConnectStatus(r.status),
      flowStatus: r.status,
      driver: r.driverId ? { id: r.driverId, name: r.driverName } : null,
      assignedAt: r.assignedAt,
      startedAt: r.startedAt,
      finishedAt: r.finishedAt,
      distanceKm: r.distanceKm,
      hasProof: Boolean(r.proofPath),
      cancelReason: r.cancelReason,
      history: r.history,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
```

- [ ] **Step 6: Rota de rastreamento**

`src/app/api/integracao/connect/chamados/[connectId]/rastreamento/route.ts`:

```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireConnectToken } from "@/lib/integration/connect-auth";
import { buildTracking } from "@/lib/transport/tracking";
import { addressLabel } from "@/lib/transport/geocode";

// GET .../rastreamento — DTO TripTracking (o mesmo do mapa do Connect).
// 404 enquanto a rota nao foi iniciada: o front do Connect ja trata como
// "sem tracking".
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: { connectId: string } },
): Promise<Response> {
  const denied = requireConnectToken(req);
  if (denied) return denied;

  const r = await prisma.transportRequest.findUnique({
    where: { connectId: params.connectId },
    select: {
      id: true,
      status: true,
      startedAt: true,
      originUnit: true, originStreet: true, originNumber: true, originDistrict: true,
      destStreet: true, destNumber: true, destDistrict: true,
      originLat: true, originLng: true, destLat: true, destLng: true,
      driver: { select: { name: true } },
      positions: {
        orderBy: { recordedAt: "asc" },
        select: { lat: true, lng: true, heading: true, speed: true, recordedAt: true },
      },
    },
  });
  if (!r) return NextResponse.json({ error: "Chamado não encontrado." }, { status: 404 });
  if (!r.startedAt) return NextResponse.json({ error: "Corrida não iniciada." }, { status: 404 });

  const dto = buildTracking({
    id: r.id,
    status: r.status,
    originLat: r.originLat,
    originLng: r.originLng,
    originLabel:
      r.originUnit ??
      addressLabel({ street: r.originStreet, number: r.originNumber, district: r.originDistrict }, "Origem não informada"),
    destLat: r.destLat,
    destLng: r.destLng,
    destLabel: addressLabel({ street: r.destStreet, number: r.destNumber, district: r.destDistrict }, "Destino não informado"),
    startedAt: r.startedAt,
    driverName: r.driver?.name ?? "Motorista",
    positions: r.positions,
  });
  return NextResponse.json(dto, { headers: { "Cache-Control": "no-store" } });
}
```

- [ ] **Step 7: Rota do comprovante**

`src/app/api/integracao/connect/chamados/[connectId]/comprovante/route.ts`:

```ts
import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { prisma } from "@/lib/prisma";
import { requireConnectToken } from "@/lib/integration/connect-auth";
import { resolveUploadedFilePath } from "@/lib/image";

// GET .../comprovante — bytes do .webp. O Connect serve ao solicitante pela
// propria rota autenticada; aqui so o token de servico entra.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: { connectId: string } },
): Promise<Response> {
  const denied = requireConnectToken(req);
  if (denied) return denied;

  const r = await prisma.transportRequest.findUnique({
    where: { connectId: params.connectId },
    select: { proofPath: true },
  });
  if (!r?.proofPath) return NextResponse.json({ error: "Sem comprovante." }, { status: 404 });

  const absolute = resolveUploadedFilePath(r.proofPath);
  if (!absolute) return NextResponse.json({ error: "Arquivo indisponível." }, { status: 404 });

  try {
    const data = await readFile(absolute);
    return new NextResponse(data, {
      status: 200,
      headers: { "content-type": "image/webp", "Cache-Control": "private, max-age=300" },
    });
  } catch {
    return NextResponse.json({ error: "Arquivo indisponível." }, { status: 404 });
  }
}
```

- [ ] **Step 8: tsc**

Run: `npx tsc --noEmit`
Expected: limpo. (Confira em `src/lib/image.ts:205` que `resolveUploadedFilePath` devolve `string | null` — é o contrato usado acima.)

- [ ] **Step 9: Teste manual com curl (servidor local)**

Adicione ao `.env` local (valores de desenvolvimento):

```
CONNECT_INTEGRATION_TOKEN=dev-token-connect
CONNECT_WEBHOOK_URL=http://localhost:3001
CONNECT_WEBHOOK_SECRET=dev-webhook-secret
```

Run: `npm run dev` (em outro terminal) e então:

```bash
curl -s -H "Authorization: Bearer dev-token-connect" http://localhost:3000/api/integracao/connect/motoristas
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/integracao/connect/motoristas   # sem token
curl -s -X POST -H "Authorization: Bearer dev-token-connect" \
  -F 'payload={"connectId":"teste-1","code":"MOT-901","requester":{"connectId":"u1","name":"Ana Teste","sector":"Comercial"},"serviceType":"Entrega","description":"Levar amostras","originUnit":"Matriz","destStreet":"Rua Augusta","destNumber":"100","destDistrict":"Consolação"}' \
  http://localhost:3000/api/integracao/connect/chamados
curl -s -X POST -H "Authorization: Bearer dev-token-connect" -F 'payload={"connectId":"teste-1","code":"MOT-901","requester":{"connectId":"u1","name":"Ana Teste"},"serviceType":"Entrega","description":"x","destStreet":"y"}' http://localhost:3000/api/integracao/connect/chamados
curl -s -H "Authorization: Bearer dev-token-connect" http://localhost:3000/api/integracao/connect/chamados/teste-1
curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer dev-token-connect" http://localhost:3000/api/integracao/connect/chamados/teste-1/rastreamento
```

Expected, na ordem: `{"drivers":[...]}`; `401`; `201` com `{id,status:"ABERTO",driver:null}`; `200` com o MESMO `id` (idempotência); detalhe com `status:"PENDENTE"`; `404` (rota não iniciada).

- [ ] **Step 10: Commit**

```bash
git add src/middleware.ts src/lib/transport/create.ts src/app/api/integracao
git commit -m "Integracao Connect: API de chamados (motoristas, criar, detalhe, rastreamento, comprovante)"
```

---

### Task 7: Módulo Motorista com ferramentas + tela Chamados

**Files:**
- Create: `src/app/(dashboard)/motorista/layout.tsx` (abas de ferramentas)
- Create: `src/app/(dashboard)/motorista/tool-tabs.tsx` (client: aba ativa pelo pathname)
- Modify: `src/app/(dashboard)/motorista/page.tsx:24` (LOGISTICA → redireciona para Chamados)
- Modify: `src/app/(dashboard)/layout.tsx:22` (LOGISTICA entra em `/motorista`)
- Create: `src/app/(dashboard)/motorista/chamados/page.tsx`
- Create: `src/app/(dashboard)/motorista/chamados/board.tsx` (client)
- Create: `src/app/(dashboard)/motorista/chamados/card.tsx` (client)
- Create: `src/app/(dashboard)/motorista/chamados/detail-modal.tsx` (client)
- Create: `src/app/(dashboard)/motorista/chamados/assign-modal.tsx` (client)
- Create: `src/app/(dashboard)/motorista/chamados/cancel-modal.tsx` (client)
- Create: `src/app/(dashboard)/motorista/chamados/complete-modal.tsx` (client)
- Create: `src/app/(dashboard)/motorista/chamados/route-controller.tsx` (client: Iniciar + GPS)
- Create: `src/lib/transport/use-position-broadcast.ts` (client hook)
- Create: `src/app/(dashboard)/motorista/chamados/historico/page.tsx`

**Interfaces:**
- Consumes: `listBoard`, `listHistory`, `listActiveDrivers`, `TransportView`, `stillOnBoard` (Task 5); as actions (Task 5); `TRANSPORT_COLUMNS`, `TRANSPORT_STATUS_STYLE` (Task 2).
- Produces: componentes de tela; `usePositionBroadcast(requestId: string | null, active: boolean)`.

- [ ] **Step 1: Navegação e layout de ferramentas**

Em `src/app/(dashboard)/layout.tsx`, troque a linha 22:

```ts
  { href: "/motorista", label: "Motorista", roles: ["GESTAO", "MOTORISTA"] },
```

por:

```ts
  // LOGISTICA entra para as ferramentas Chamados e Dashboard (nao ve Entregas).
  { href: "/motorista", label: "Motorista", roles: ["GESTAO", "MOTORISTA", "LOGISTICA"] },
```

`src/app/(dashboard)/motorista/tool-tabs.tsx`:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Truck, ClipboardList, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ToolTab {
  href: string;
  label: string;
  icon: "entregas" | "chamados" | "dashboard";
}

const ICON = {
  entregas: <Truck className="h-4 w-4" />,
  chamados: <ClipboardList className="h-4 w-4" />,
  dashboard: <BarChart3 className="h-4 w-4" />,
};

// Ferramentas do modulo Motorista. Aba ativa = prefixo mais longo do pathname
// (assim /motorista/chamados/historico acende "Chamados", e /motorista/historico
// acende "Entregas").
export function ToolTabs({ tabs }: { tabs: ToolTab[] }) {
  const pathname = usePathname();
  let active: string | null = null;
  for (const t of tabs) {
    const hit = pathname === t.href || pathname.startsWith(t.href + "/");
    if (hit && (!active || t.href.length > active.length)) active = t.href;
  }
  // "/motorista" tambem cobre "/motorista/historico" (Entregas), mas nao os
  // prefixos das outras ferramentas — o mais longo vence acima.

  return (
    <nav aria-label="Ferramentas do módulo Motorista" className="mb-6 flex flex-wrap gap-2">
      {tabs.map((t) => {
        const isActive = t.href === active;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors",
              isActive
                ? "border-motorista bg-motorista/15 text-motorista"
                : "border-border bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            {ICON[t.icon]}
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
```

`src/app/(dashboard)/motorista/layout.tsx`:

```tsx
import { requireRole } from "@/lib/auth";
import { ToolTabs, type ToolTab } from "./tool-tabs";

/**
 * Modulo Motorista = ferramentas. Cada uma confere o proprio papel na pagina;
 * aqui so decidimos QUAIS abas aparecem:
 *   Entregas  MOTORISTA, GESTAO
 *   Chamados  MOTORISTA, LOGISTICA, GESTAO   (vindos do Build.Connect)
 *   Dashboard LOGISTICA, GESTAO
 */
export default async function MotoristaLayout({ children }: { children: React.ReactNode }) {
  const session = await requireRole(["MOTORISTA", "LOGISTICA", "GESTAO"]);
  const role = session.role;

  const tabs: ToolTab[] = [];
  if (role === "MOTORISTA" || role === "GESTAO") {
    tabs.push({ href: "/motorista", label: "Entregas", icon: "entregas" });
  }
  tabs.push({ href: "/motorista/chamados", label: "Chamados", icon: "chamados" });
  if (role === "LOGISTICA" || role === "GESTAO") {
    tabs.push({ href: "/motorista/dashboard", label: "Dashboard", icon: "dashboard" });
  }

  return (
    <div>
      <ToolTabs tabs={tabs} />
      {children}
    </div>
  );
}
```

Em `src/app/(dashboard)/motorista/page.tsx`, troque a linha:

```ts
  const session = await requireRole(["MOTORISTA", "GESTAO"]);
```

por:

```ts
  const session = await requireRole(["MOTORISTA", "GESTAO", "LOGISTICA"]);
  // LOGISTICA nao entrega: a ferramenta dela e Chamados.
  if (session.role === "LOGISTICA") redirect("/motorista/chamados");
```

e acrescente `import { redirect } from "next/navigation";` no topo do arquivo.

- [ ] **Step 2: Hook de GPS**

`src/lib/transport/use-position-broadcast.ts`:

```ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { pushTransportPosition } from "@/lib/transport/actions";

/**
 * Emissor de posicao do app do motorista (porta do Build.Connect).
 *
 * Liga navigator.geolocation.watchPosition() e envia pontos via
 * pushTransportPosition, com throttle DUPLO no cliente para nao inundar o
 * Postgres: tempo minimo entre envios e deslocamento minimo. O envio e o unico
 * efeito colateral — nada e renderizado por este hook.
 */

const MIN_INTERVAL_MS = 12_000;
const MIN_DISTANCE_M = 25;

function distanceMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const lat1 = (aLat * Math.PI) / 180;
  const lat2 = (bLat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

export type BroadcastState = "idle" | "acquiring" | "sending" | "error" | "denied";

export function usePositionBroadcast(
  requestId: string | null,
  active: boolean,
): { state: BroadcastState; lastSentLabel: string | null; error: string | null } {
  const [state, setState] = useState<BroadcastState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [lastSent, setLastSent] = useState<Date | null>(null);
  const lastSentAt = useRef(0);
  const lastPoint = useRef<{ lat: number; lng: number } | null>(null);
  const sending = useRef(false);

  const send = useCallback(
    async (coords: GeolocationCoordinates) => {
      if (!requestId || sending.current) return;
      const now = Date.now();
      if (now - lastSentAt.current < MIN_INTERVAL_MS) return;
      if (lastPoint.current) {
        const moved = distanceMeters(lastPoint.current.lat, lastPoint.current.lng, coords.latitude, coords.longitude);
        if (moved < MIN_DISTANCE_M) return;
      }
      sending.current = true;
      setState("sending");
      try {
        const result = await pushTransportPosition({
          requestId,
          lat: coords.latitude,
          lng: coords.longitude,
          heading: typeof coords.heading === "number" && !Number.isNaN(coords.heading) ? coords.heading : undefined,
          speed: typeof coords.speed === "number" && !Number.isNaN(coords.speed) ? coords.speed * 3.6 : undefined,
        });
        if (result.ok) {
          lastSentAt.current = now;
          lastPoint.current = { lat: coords.latitude, lng: coords.longitude };
          setLastSent(new Date());
          setError(null);
          setState("acquiring");
        } else {
          setError(result.error);
          setState("error");
        }
      } catch {
        setError("Falha ao enviar posição.");
        setState("error");
      } finally {
        sending.current = false;
      }
    },
    [requestId],
  );

  useEffect(() => {
    if (!requestId || !active) {
      setState("idle");
      return;
    }
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setState("error");
      setError("Geolocalização indisponível neste dispositivo.");
      return;
    }
    setState("acquiring");
    const watchId = navigator.geolocation.watchPosition(
      (pos) => void send(pos.coords),
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setState("denied");
          setError("Permissão de localização negada.");
        } else {
          setState("error");
          setError("Não foi possível obter a localização.");
        }
      },
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [requestId, active, send]);

  const lastSentLabel = lastSent
    ? lastSent.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : null;

  return { state, lastSentLabel, error };
}
```

- [ ] **Step 3: Controle de rota (Iniciar + status do GPS)**

`src/app/(dashboard)/motorista/chamados/route-controller.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Navigation, Loader2, AlertTriangle, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { startTransportRoute } from "@/lib/transport/actions";
import { usePositionBroadcast } from "@/lib/transport/use-position-broadcast";

/**
 * Antes de iniciar: botao "Iniciar rota" -> startTransportRoute. Depois, e
 * enquanto nao concluir: liga o emissor de GPS e mostra o estado da transmissao.
 */
export function RouteController({
  requestId,
  started,
  finished = false,
}: {
  requestId: string;
  started: boolean;
  finished?: boolean;
}) {
  const router = useRouter();
  const [isStarted, setIsStarted] = useState(started);
  const [startError, setStartError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const broadcasting = isStarted && !finished;
  const { state, lastSentLabel, error } = usePositionBroadcast(requestId, broadcasting);

  function iniciar() {
    setStartError(null);
    start(async () => {
      const res = await startTransportRoute({ requestId });
      if (res.ok) {
        setIsStarted(true);
        router.refresh();
      } else {
        setStartError(res.error);
      }
    });
  }

  if (finished) {
    return <p className="rounded-lg bg-secondary px-3 py-2 text-xs text-muted-foreground">Corrida encerrada.</p>;
  }

  if (!isStarted) {
    return (
      <div className="space-y-1.5">
        <Button className="h-11 w-full bg-motorista text-white hover:bg-motorista/90" onClick={iniciar} disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Navigation className="h-4 w-4" />}
          Iniciar rota
        </Button>
        {startError && <p className="text-xs text-destructive">{startError}</p>}
      </div>
    );
  }

  const label =
    state === "sending" ? "Enviando posição…"
    : state === "acquiring" ? (lastSentLabel ? `GPS ativo · último envio ${lastSentLabel}` : "GPS ativo · aguardando primeira leitura")
    : state === "denied" ? "Permissão de localização negada"
    : state === "error" ? (error ?? "Falha no GPS")
    : "GPS desligado";
  const problema = state === "denied" || state === "error";

  return (
    <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs ${problema ? "bg-destructive/10 text-destructive" : "bg-motorista/10 text-motorista"}`}>
      {problema ? <AlertTriangle className="h-3.5 w-3.5" /> : <MapPin className="h-3.5 w-3.5" />}
      {label}
    </div>
  );
}
```

- [ ] **Step 4: Modais (atribuir, cancelar, concluir, detalhe)**

`src/app/(dashboard)/motorista/chamados/assign-modal.tsx`:

```tsx
"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function AssignModal({
  open,
  code,
  drivers,
  onClose,
  onSelect,
}: {
  open: boolean;
  code: string | null;
  drivers: { id: string; name: string }[];
  onClose: () => void;
  onSelect: (driverId: string, driverName: string) => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[92vw] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-card p-5 shadow-xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <Dialog.Title className="text-lg font-semibold">Atribuir para…</Dialog.Title>
              <Dialog.Description className="text-sm text-muted-foreground">
                {code ? `${code} · escolha quem assume a corrida.` : "Escolha o motorista."}
              </Dialog.Description>
            </div>
            <Dialog.Close className="rounded-md p-1 text-muted-foreground hover:text-foreground" aria-label="Fechar">
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>
          <div className="mt-4 max-h-72 space-y-2 overflow-y-auto">
            {drivers.length === 0 && <p className="text-sm text-muted-foreground">Nenhum motorista ativo.</p>}
            {drivers.map((d) => (
              <Button key={d.id} variant="outline" className="w-full justify-start" onClick={() => onSelect(d.id, d.name)}>
                {d.name}
              </Button>
            ))}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
```

`src/app/(dashboard)/motorista/chamados/cancel-modal.tsx`:

```tsx
"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export function CancelModal({
  open,
  code,
  onClose,
  onConfirm,
}: {
  open: boolean;
  code: string | null;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[92vw] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-card p-5 shadow-xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <Dialog.Title className="text-lg font-semibold">Cancelar chamado</Dialog.Title>
              <Dialog.Description className="text-sm text-muted-foreground">
                {code ?? ""} · o solicitante vê o motivo no Build.Connect.
              </Dialog.Description>
            </div>
            <Dialog.Close className="rounded-md p-1 text-muted-foreground hover:text-foreground" aria-label="Fechar">
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>
          <div className="mt-4 space-y-2">
            <Label htmlFor="cancel-reason">Motivo *</Label>
            <textarea
              id="cancel-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Voltar</Button>
            <Button variant="destructive" disabled={reason.trim().length < 3} onClick={() => { onConfirm(reason.trim()); setReason(""); }}>
              Cancelar chamado
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
```

`src/app/(dashboard)/motorista/chamados/complete-modal.tsx`:

```tsx
"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Camera, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

// Uma foto de comprovante, obrigatoria — como no quadro do Connect.
export function CompleteModal({
  open,
  code,
  pending,
  error,
  onClose,
  onConfirm,
}: {
  open: boolean;
  code: string | null;
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: (photo: File) => void;
}) {
  const [photo, setPhoto] = useState<File | null>(null);
  const preview = photo ? URL.createObjectURL(photo) : null;

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && !pending && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[92vw] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-card p-5 shadow-xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <Dialog.Title className="text-lg font-semibold">Concluir chamado</Dialog.Title>
              <Dialog.Description className="text-sm text-muted-foreground">
                {code ?? ""} · envie a foto do comprovante de entrega.
              </Dialog.Description>
            </div>
            <Dialog.Close className="rounded-md p-1 text-muted-foreground hover:text-foreground" aria-label="Fechar">
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>
          <div className="mt-4 space-y-2">
            <Label htmlFor="proof">Comprovante *</Label>
            <input
              id="proof"
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
              className="block w-full text-sm"
            />
            {preview && <img src={preview} alt="Prévia do comprovante" className="max-h-56 rounded-lg object-contain" />}
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} disabled={pending}>Voltar</Button>
            <Button className="bg-motorista text-white hover:bg-motorista/90" disabled={!photo || pending} onClick={() => photo && onConfirm(photo)}>
              <Camera className="h-4 w-4" /> {pending ? "Enviando…" : "Concluir"}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
```

`src/app/(dashboard)/motorista/chamados/detail-modal.tsx`:

```tsx
"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X, MapPin, Phone, User, Clock } from "lucide-react";
import type { TransportView } from "@/lib/transport/queries";
import { TRANSPORT_STATUS_STYLE } from "@/lib/transport/status";
import { cn } from "@/lib/utils";

const EVENT_LABEL: Record<string, string> = {
  criado: "Aberto no Build.Connect",
  atribuido: "Atribuído",
  assumido: "Assumido",
  desatribuido: "Desatribuído",
  em_rota: "Em rota",
  concluido: "Concluído",
  cancelado: "Cancelado",
};

function dataHora(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function DetailModal({ item, onClose }: { item: TransportView | null; onClose: () => void }) {
  const s = item ? TRANSPORT_STATUS_STYLE[item.status] : null;
  return (
    <Dialog.Root open={item !== null} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[92vw] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-xl">
          {item && s && (
            <>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-data text-xs text-muted-foreground">{item.code}</p>
                  <Dialog.Title className="text-lg font-semibold">{item.serviceType}</Dialog.Title>
                  <Dialog.Description className="sr-only">Detalhes do chamado {item.code}</Dialog.Description>
                </div>
                <div className="flex items-center gap-2">
                  <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium", s.badge)}>
                    <span className={cn("h-1.5 w-1.5 rounded-full", s.dot)} />{s.label}
                  </span>
                  <Dialog.Close className="rounded-md p-1 text-muted-foreground hover:text-foreground" aria-label="Fechar">
                    <X className="h-4 w-4" />
                  </Dialog.Close>
                </div>
              </div>

              <p className="mt-3 whitespace-pre-wrap text-sm">{item.description}</p>

              <div className="mt-4 space-y-2 text-sm">
                <p className="flex items-center gap-2"><User className="h-4 w-4 text-muted-foreground" />{item.requesterName}{item.requesterSector ? ` · ${item.requesterSector}` : ""}</p>
                {item.contact && <p className="flex items-center gap-2"><Phone className="h-4 w-4 text-muted-foreground" />{item.contact}</p>}
                <p className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 text-muted-foreground" /><span><span className="text-muted-foreground">De:</span> {item.originLabel}<br /><span className="text-muted-foreground">Para:</span> {item.destLabel}</span></p>
                {item.driverName && <p className="flex items-center gap-2"><Clock className="h-4 w-4 text-muted-foreground" />Responsável: {item.driverName}</p>}
                {item.distanceKm !== null && <p className="text-muted-foreground">{item.distanceKm} km percorridos</p>}
                {item.cancelReason && <p className="text-destructive">Cancelado: {item.cancelReason}</p>}
              </div>

              {item.images.length > 0 && (
                <div className="mt-4 grid grid-cols-3 gap-2">
                  {item.images.map((img) => (
                    <a key={img.id} href={img.filePath} target="_blank" rel="noreferrer">
                      <img src={img.filePath} alt="" className="h-24 w-full rounded-lg object-cover" />
                    </a>
                  ))}
                </div>
              )}
              {item.proofPath && (
                <div className="mt-4">
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Comprovante</p>
                  <a href={item.proofPath} target="_blank" rel="noreferrer">
                    <img src={item.proofPath} alt="Comprovante de entrega" className="max-h-48 rounded-lg object-contain" />
                  </a>
                </div>
              )}

              <div className="mt-4 border-t border-border pt-3">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Histórico</p>
                <ul className="space-y-1 text-xs">
                  {item.history.map((h, i) => (
                    <li key={i} className="flex justify-between gap-3">
                      <span>{EVENT_LABEL[h.event] ?? h.event}{h.actorName ? ` · ${h.actorName}` : ""}{h.note ? ` — ${h.note}` : ""}</span>
                      <span className="shrink-0 text-muted-foreground">{dataHora(h.at)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
```

- [ ] **Step 5: Card**

`src/app/(dashboard)/motorista/chamados/card.tsx`:

```tsx
"use client";

import { Eye, UserPlus, UserCog, UserMinus, Ban, Paperclip, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TransportView } from "@/lib/transport/queries";
import { RouteController } from "./route-controller";

export interface TransportCardProps {
  item: TransportView;
  currentUserId: string;
  /** LOGISTICA/GESTAO: atribuir a outro, desatribuir de terceiros, cancelar. */
  isManager: boolean;
  /** GESTAO: age no lugar do motorista (iniciar, concluir). */
  canActAsDriver: boolean;
  /** MOTORISTA/GESTAO: assumir para si. */
  canClaim: boolean;
  onOpen: (item: TransportView) => void;
  onClaim: (item: TransportView) => void;
  onAssignOther: (item: TransportView) => void;
  onUnassign: (item: TransportView) => void;
  onComplete: (item: TransportView) => void;
  onCancel: (item: TransportView) => void;
}

function dataHora(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/**
 * Card do quadro de chamados. Sem arrastar: cada coluna expoe botoes conforme
 * status e papel (mesma regra do Build.Connect):
 *   ABERTO      "Atribuir para mim" (motorista) · "Atribuir para…" (gestao)
 *   ATRIBUIDO   "Iniciar rota" (dono) · "Desatribuir" (dono ou gestao)
 *   EM_ROTA     GPS ativo · "Concluir" (dono)
 *   CONCLUIDO   somente leitura
 * Gestao tem "Cancelar" em qualquer status nao final.
 */
export function TransportCard(p: TransportCardProps) {
  const { item } = p;
  const isMine = item.driverId === p.currentUserId;
  const status = item.status;
  const podeDirigir = isMine || p.canActAsDriver;

  return (
    <article className="card-hover rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <span className="font-data text-xs text-muted-foreground">{item.code}</span>
        <span className="rounded-md bg-secondary px-1.5 py-0.5 text-[11px]">{item.serviceType}</span>
      </div>
      <h3 className="mt-2 text-sm font-semibold leading-snug">{item.destLabel}</h3>
      <p className="mt-0.5 text-xs text-muted-foreground">De: {item.originLabel}</p>
      <p className="mt-2 truncate text-xs">
        <span className="text-muted-foreground">Solicitante:</span> {item.requesterName}
        {item.requesterSector ? ` · ${item.requesterSector}` : ""}
      </p>
      {item.driverName && (
        <p className="mt-1 text-xs">
          <span className="text-muted-foreground">Responsável:</span> {item.driverName}
          {isMine && <span className="text-motorista"> (você)</span>}
        </p>
      )}
      <div className="mt-3 flex items-center justify-between border-t border-border pt-2 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          {dataHora(item.createdAt)}
          {item.images.length > 0 && (<span className="flex items-center gap-0.5"><Paperclip className="h-3 w-3" />{item.images.length}</span>)}
        </span>
        <button type="button" onClick={() => p.onOpen(item)} className="flex items-center gap-1 rounded-md px-2 py-1 hover:bg-secondary hover:text-foreground">
          <Eye className="h-3 w-3" /> Detalhes
        </button>
      </div>

      <div className="mt-2.5 space-y-2 border-t border-border pt-2.5">
        {status === "ABERTO" && (
          <>
            {p.canClaim && (
              <Button size="sm" className="w-full bg-motorista text-white hover:bg-motorista/90" onClick={() => p.onClaim(item)}>
                <UserPlus className="h-3.5 w-3.5" /> Atribuir para mim
              </Button>
            )}
            {p.isManager && (
              <Button size="sm" variant="outline" className="w-full" onClick={() => p.onAssignOther(item)}>
                <UserCog className="h-3.5 w-3.5" /> Atribuir para…
              </Button>
            )}
          </>
        )}
        {status === "ATRIBUIDO" && (
          <>
            {podeDirigir && <RouteController requestId={item.id} started={false} />}
            {(isMine || p.isManager) && (
              <Button size="sm" variant="ghost" className="w-full" onClick={() => p.onUnassign(item)}>
                <UserMinus className="h-3.5 w-3.5" /> Desatribuir
              </Button>
            )}
            {!isMine && !p.isManager && !p.canActAsDriver && (
              <p className="text-center text-[11px] text-muted-foreground">Atribuído a outra pessoa.</p>
            )}
          </>
        )}
        {status === "EM_ROTA" && (
          <>
            {podeDirigir && <RouteController requestId={item.id} started />}
            {podeDirigir && (
              <Button size="sm" className="w-full bg-motorista text-white hover:bg-motorista/90" onClick={() => p.onComplete(item)}>
                <CheckCircle2 className="h-3.5 w-3.5" /> Concluir com comprovante
              </Button>
            )}
            {!podeDirigir && <p className="text-center text-[11px] text-muted-foreground">Corrida em andamento.</p>}
          </>
        )}
        {status === "CONCLUIDO" && (
          <p className="text-center text-[11px] text-muted-foreground">
            Concluído{item.distanceKm ? ` · ${item.distanceKm} km` : ""}. Sai do quadro em 15 min.
          </p>
        )}
        {p.isManager && status !== "CONCLUIDO" && status !== "CANCELADO" && (
          <Button size="sm" variant="ghost" className="w-full text-destructive hover:text-destructive" onClick={() => p.onCancel(item)}>
            <Ban className="h-3.5 w-3.5" /> Cancelar chamado
          </Button>
        )}
      </div>
    </article>
  );
}
```

- [ ] **Step 6: Quadro**

`src/app/(dashboard)/motorista/chamados/board.tsx`:

```tsx
"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { History } from "lucide-react";
import type { Role } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { TransportView } from "@/lib/transport/queries";
import { TRANSPORT_COLUMNS, TRANSPORT_STATUS_STYLE } from "@/lib/transport/status";
import {
  assignTransport, claimTransport, unassignTransport, completeTransport, cancelTransport,
} from "@/lib/transport/actions";
import { TransportCard } from "./card";
import { DetailModal } from "./detail-modal";
import { AssignModal } from "./assign-modal";
import { CancelModal } from "./cancel-modal";
import { CompleteModal } from "./complete-modal";

/**
 * Quadro de chamados (porta do DriverKanbanBoard do Build.Connect), orientado a
 * ACOES. O tempo real vem do RealtimeProvider do layout: cada evento
 * `transport.*` faz router.refresh() e a pagina re-le o banco.
 */
export function TransportBoard({
  items,
  role,
  userId,
  drivers,
}: {
  items: TransportView[];
  role: Role;
  userId: string;
  drivers: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [, start] = useTransition();
  const isManager = role === "LOGISTICA" || role === "GESTAO";
  const canActAsDriver = role === "GESTAO";
  const canClaim = role === "MOTORISTA" || role === "GESTAO";

  const [selected, setSelected] = useState<TransportView | null>(null);
  const [assigning, setAssigning] = useState<TransportView | null>(null);
  const [cancelling, setCancelling] = useState<TransportView | null>(null);
  const [completing, setCompleting] = useState<TransportView | null>(null);
  const [completePending, setCompletePending] = useState(false);
  const [completeError, setCompleteError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Motorista ve: Em Aberto (para assumir) + os seus. Gestao/Logistica: tudo.
  const visiveis = useMemo(
    () => (isManager ? items : items.filter((i) => i.status === "ABERTO" || i.driverId === userId)),
    [items, isManager, userId],
  );

  const byStatus = useMemo(() => {
    const map = Object.fromEntries(TRANSPORT_COLUMNS.map((s) => [s, [] as TransportView[]])) as Record<string, TransportView[]>;
    for (const i of visiveis) map[i.status]?.push(i);
    return map;
  }, [visiveis]);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    start(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Falha na ação.");
      router.refresh();
    });
  }

  function concluir(photo: File) {
    if (!completing) return;
    const fd = new FormData();
    fd.set("requestId", completing.id);
    fd.set("photo", photo);
    setCompletePending(true);
    setCompleteError(null);
    start(async () => {
      const res = await completeTransport(fd);
      setCompletePending(false);
      if (res.ok) {
        setCompleting(null);
        router.refresh();
      } else {
        setCompleteError(res.error);
      }
    });
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {isManager
            ? "Atribua os chamados vindos do Build.Connect e acompanhe a corrida. O quadro atualiza sozinho."
            : "Assuma um chamado, inicie a rota para transmitir sua localização e conclua com o comprovante."}
        </p>
        <Button variant="outline" size="sm" asChild>
          <Link href="/motorista/chamados/historico"><History className="h-4 w-4" /> Histórico</Link>
        </Button>
      </div>
      {error && <p className="mb-3 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {TRANSPORT_COLUMNS.map((status) => {
          const s = TRANSPORT_STATUS_STYLE[status];
          const col = byStatus[status] ?? [];
          return (
            <section key={status} aria-label={`Coluna ${s.label}`} className="flex min-w-0 flex-col rounded-2xl border border-border bg-secondary/30 p-3">
              <header className={cn("mb-3 flex items-center justify-between rounded-lg border px-3 py-1.5 text-xs font-semibold", s.header)}>
                <span className="flex items-center gap-2"><span className={cn("h-2 w-2 rounded-full", s.dot)} />{s.label}</span>
                <span>{col.length}</span>
              </header>
              <div className="flex-1 space-y-3 overflow-y-auto pr-0.5 [max-height:calc(100vh-22rem)]">
                {col.map((item) => (
                  <TransportCard
                    key={item.id}
                    item={item}
                    currentUserId={userId}
                    isManager={isManager}
                    canActAsDriver={canActAsDriver}
                    canClaim={canClaim}
                    onOpen={setSelected}
                    onClaim={(i) => run(() => claimTransport({ requestId: i.id }))}
                    onAssignOther={setAssigning}
                    onUnassign={(i) => run(() => unassignTransport({ requestId: i.id }))}
                    onComplete={(i) => { setCompleteError(null); setCompleting(i); }}
                    onCancel={setCancelling}
                  />
                ))}
                {col.length === 0 && (
                  <p className="rounded-lg border border-dashed border-border py-8 text-center text-xs text-muted-foreground">Nenhum chamado</p>
                )}
              </div>
            </section>
          );
        })}
      </div>

      <DetailModal item={selected} onClose={() => setSelected(null)} />
      <AssignModal
        open={assigning !== null}
        code={assigning?.code ?? null}
        drivers={drivers}
        onClose={() => setAssigning(null)}
        onSelect={(driverId) => {
          const i = assigning;
          setAssigning(null);
          if (i) run(() => assignTransport({ requestId: i.id, driverId }));
        }}
      />
      <CancelModal
        open={cancelling !== null}
        code={cancelling?.code ?? null}
        onClose={() => setCancelling(null)}
        onConfirm={(reason) => {
          const i = cancelling;
          setCancelling(null);
          if (i) run(() => cancelTransport({ requestId: i.id, reason }));
        }}
      />
      <CompleteModal
        open={completing !== null}
        code={completing?.code ?? null}
        pending={completePending}
        error={completeError}
        onClose={() => !completePending && setCompleting(null)}
        onConfirm={concluir}
      />
    </>
  );
}
```

- [ ] **Step 7: Páginas Chamados e Histórico**

`src/app/(dashboard)/motorista/chamados/page.tsx`:

```tsx
import { requireRole } from "@/lib/auth";
import { listBoard, listActiveDrivers } from "@/lib/transport/queries";
import { TransportBoard } from "./board";

export const dynamic = "force-dynamic";

// Ferramenta "Chamados" do modulo Motorista: chamados de transporte abertos no
// Build.Connect. Logistica/Gestao gerenciam; o motorista assume e executa.
export default async function ChamadosPage() {
  const session = await requireRole(["MOTORISTA", "LOGISTICA", "GESTAO"]);
  const isManager = session.role === "LOGISTICA" || session.role === "GESTAO";
  const [items, drivers] = await Promise.all([
    listBoard(),
    isManager ? listActiveDrivers() : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-motorista">Chamados</h1>
        <p className="text-sm text-muted-foreground">Em Aberto → Atribuído → Em Rota → Concluído</p>
      </div>
      <TransportBoard items={items} role={session.role} userId={session.userId} drivers={drivers} />
    </div>
  );
}
```

`src/app/(dashboard)/motorista/chamados/historico/page.tsx`:

```tsx
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { listHistory } from "@/lib/transport/queries";
import { TRANSPORT_STATUS_STYLE } from "@/lib/transport/status";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

function dataHora(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";
}

export default async function ChamadosHistoricoPage() {
  const session = await requireRole(["MOTORISTA", "LOGISTICA", "GESTAO"]);
  const isManager = session.role === "LOGISTICA" || session.role === "GESTAO";
  const todos = await listHistory(200);
  const items = isManager ? todos : todos.filter((i) => i.driverId === session.userId);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-motorista">Histórico de chamados</h1>
          <p className="text-sm text-muted-foreground">Concluídos e cancelados, mais recentes primeiro.</p>
        </div>
        <Link href="/motorista/chamados" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Link>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Código</th><th className="px-3 py-2">Serviço</th><th className="px-3 py-2">Solicitante</th>
              <th className="px-3 py-2">Motorista</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Encerrado</th><th className="px-3 py-2">Km</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => {
              const s = TRANSPORT_STATUS_STYLE[i.status];
              return (
                <tr key={i.id} className="border-t border-border">
                  <td className="px-3 py-2 font-data text-xs">{i.code}</td>
                  <td className="px-3 py-2">{i.serviceType}</td>
                  <td className="px-3 py-2">{i.requesterName}</td>
                  <td className="px-3 py-2">{i.driverName ?? "—"}</td>
                  <td className="px-3 py-2"><span className={cn("rounded-full px-2 py-0.5 text-xs", s.badge)}>{s.label}</span></td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{dataHora(i.finishedAt)}</td>
                  <td className="px-3 py-2 text-xs">{i.distanceKm ?? "—"}</td>
                </tr>
              );
            })}
            {items.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">Nenhum chamado encerrado.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 8: tsc + build**

Run: `npx tsc --noEmit && npm run build`
Expected: limpo; rotas `/motorista/chamados` e `/motorista/chamados/historico` na lista do build. Se o `Button` do projeto não aceitar `asChild`, troque o botão "Histórico" por um `<Link className="...">` com as mesmas classes.

- [ ] **Step 9: Teste manual no navegador**

Com `npm run dev`: logar como GESTAO → `/motorista` mostra as três abas; "Chamados" lista o `MOT-901` criado na Task 6 em "Em Aberto"; "Atribuir para…" → escolhe um motorista → card vai a "Atribuído"; logar como esse MOTORISTA (outra aba/navegador) → "Iniciar rota" (aceitar a permissão de localização) → coluna "Em Rota" e selo "GPS ativo"; "Concluir com comprovante" com uma foto → "Concluído". Logar como LOGISTICA → `/motorista` redireciona para Chamados e não mostra "Entregas".

- [ ] **Step 10: Commit**

```bash
git add "src/app/(dashboard)/layout.tsx" "src/app/(dashboard)/motorista" src/lib/transport/use-position-broadcast.ts
git commit -m "Modulo Motorista: ferramentas (Entregas, Chamados, Dashboard) e quadro de chamados do Connect"
```

---

### Task 8: Ferramenta Dashboard

**Files:**
- Create: `src/lib/transport/dashboard.ts` (consulta + agregação)
- Create: `src/app/(dashboard)/motorista/dashboard/page.tsx`

**Interfaces:**
- Consumes: `prisma`, `TRANSPORT_STATUS_STYLE`.
- Produces: `getTransportDashboard(): Promise<TransportDashboard>`.

- [ ] **Step 1: Agregação**

`src/lib/transport/dashboard.ts`:

```ts
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
      status: true, serviceType: true, requesterSector: true,
      createdAt: true, finishedAt: true, distanceKm: true, driverId: true,
      driver: { select: { name: true } },
    },
  });

  const ativos = rows.filter((r) => r.status !== "CANCELADO");
  const byStatus: Record<TransportStatus, number> = { ABERTO: 0, ATRIBUIDO: 0, EM_ROTA: 0, CONCLUIDO: 0, CANCELADO: 0 };
  for (const r of rows) byStatus[r.status] += 1;

  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const d30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const concluidos = ativos.filter((r) => r.status === "CONCLUIDO" && r.finishedAt);
  const concludedToday = concluidos.filter((r) => r.finishedAt! >= hoje).length;
  const concluded30d = concluidos.filter((r) => r.finishedAt! >= d30).length;

  const durations = concluidos.map((r) => r.finishedAt!.getTime() - r.createdAt.getTime()).filter((ms) => ms > 0);
  const avgMin = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length / 60000) : 0;
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
```

- [ ] **Step 2: Página**

`src/app/(dashboard)/motorista/dashboard/page.tsx`:

```tsx
import { requireRole } from "@/lib/auth";
import { getTransportDashboard } from "@/lib/transport/dashboard";
import { TRANSPORT_COLUMNS, TRANSPORT_STATUS_STYLE } from "@/lib/transport/status";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

function Tile({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Bars({ title, entries }: { title: string; entries: { label: string; count: number }[] }) {
  const max = Math.max(1, ...entries.map((e) => e.count));
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <p className="mb-3 text-sm font-semibold">{title}</p>
      <div className="space-y-2">
        {entries.length === 0 && <p className="text-xs text-muted-foreground">Sem dados.</p>}
        {entries.slice(0, 8).map((e) => (
          <div key={e.label}>
            <div className="flex justify-between text-xs"><span>{e.label}</span><span className="text-muted-foreground">{e.count}</span></div>
            <div className="mt-1 h-2 rounded-full bg-secondary"><div className="h-2 rounded-full bg-motorista" style={{ width: `${(e.count / max) * 100}%` }} /></div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Ferramenta "Dashboard" do modulo Motorista — os numeros dos chamados de
// transporte (o que antes morava no Connect).
export default async function MotoristaDashboardPage() {
  await requireRole(["LOGISTICA", "GESTAO"]);
  const d = await getTransportDashboard();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-motorista">Dashboard de chamados</h1>
        <p className="text-sm text-muted-foreground">Chamados de transporte vindos do Build.Connect.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Tile label="Chamados" value={d.total} hint="sem os cancelados" />
        <Tile label="Concluídos hoje" value={d.concludedToday} hint={`${d.concluded30d} nos últimos 30 dias`} />
        <Tile label="Tempo médio" value={d.avgResolution} hint="da abertura à conclusão" />
        <Tile label="Taxa de conclusão" value={`${d.completionRate}%`} />
        <Tile label="Quilometragem total" value={`${d.totalKm} km`} />
        <Tile label="Média por corrida" value={`${d.avgKmPerTrip} km`} />
        <Tile label="Motoristas ativos" value={d.activeDrivers} hint="com chamado nos últimos 30 dias" />
        <Tile label="Mais corridas" value={d.topDriver} />
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <p className="mb-3 text-sm font-semibold">Por status</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {TRANSPORT_COLUMNS.map((s) => {
            const st = TRANSPORT_STATUS_STYLE[s];
            return (
              <div key={s} className={cn("rounded-lg border px-3 py-2", st.header)}>
                <p className="text-xs">{st.label}</p>
                <p className="text-xl font-bold">{d.byStatus[s]}</p>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Bars title="Por tipo de serviço" entries={d.byService} />
        <Bars title="Por setor solicitante" entries={d.bySector} />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: tsc + build**

Run: `npx tsc --noEmit && npm run build`
Expected: limpo; `/motorista/dashboard` no build.

- [ ] **Step 4: Commit**

```bash
git add src/lib/transport/dashboard.ts "src/app/(dashboard)/motorista/dashboard"
git commit -m "Modulo Motorista: ferramenta Dashboard dos chamados de transporte"
```

---

### Task 9: Documentação da integração e verificação final

**Files:**
- Create: `docs/integracao-connect.md`

- [ ] **Step 1: Documentar variáveis e contrato**

`docs/integracao-connect.md`:

```markdown
# Integração com o Build.Connect (chamados de motoristas)

O Connect abre e acompanha; o Flow gerencia. Desenho completo em
`docs/superpowers/specs/2026-09-15-chamados-motoristas-connect-flow-design.md`.

## Variáveis de ambiente (Flow)

| Variável | Uso |
| --- | --- |
| `CONNECT_INTEGRATION_TOKEN` | Bearer aceito em `/api/integracao/connect/*`. Mesmo valor de `FLOW_API_TOKEN` no Connect. |
| `CONNECT_WEBHOOK_URL` | Base do Connect na rede interna do EasyPanel, ex.: `http://buildconnect:3000`. |
| `CONNECT_WEBHOOK_SECRET` | Chave do HMAC do webhook. Mesmo valor de `FLOW_WEBHOOK_SECRET` no Connect. |
| `GEOCODE_DEFAULT_CITY` | Opcional. Cidade acrescentada às consultas de geocodificação (ex.: `São Paulo, SP`). |

Sem as três primeiras a integração fica desligada: a API responde 503 e o
webhook só registra no log.

## Rotas (todas com `Authorization: Bearer <token>`)

- `GET  /api/integracao/connect/motoristas`
- `POST /api/integracao/connect/chamados` — multipart: `payload` (JSON) + `images` (0..5)
- `GET  /api/integracao/connect/chamados/:connectId`
- `GET  /api/integracao/connect/chamados/:connectId/rastreamento`
- `GET  /api/integracao/connect/chamados/:connectId/comprovante`

## Webhook (Flow → Connect)

`POST {CONNECT_WEBHOOK_URL}/api/integracao/flow/webhook` com cabeçalhos
`x-flow-timestamp` e `x-flow-signature` (HMAC-SHA256 de `${timestamp}.${corpo}`,
hex). Corpo: `{ connectId, flowId, status, driverName, assignedAt, startedAt,
finishedAt, distanceKm, cancelReason }`. Três tentativas (0s, 5s, 30s).

## Checks

    npx tsx scripts/checks/transport-status.ts
    npx tsx scripts/checks/transport-tracking.ts
    npx tsx scripts/checks/integration-signature.ts
```

- [ ] **Step 2: Rodar todos os checks e o build**

Run:
```bash
npx tsx scripts/checks/transport-status.ts && npx tsx scripts/checks/transport-tracking.ts && npx tsx scripts/checks/integration-signature.ts && npx tsc --noEmit && npm run build
```
Expected: três `OK`, tsc limpo, build ok.

- [ ] **Step 3: Commit**

```bash
git add docs/integracao-connect.md
git commit -m "Docs: integracao com o Build.Connect (variaveis, rotas, webhook, checks)"
```
