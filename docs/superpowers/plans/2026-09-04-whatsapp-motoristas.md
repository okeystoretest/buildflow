# Notificação de motoristas por WhatsApp — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Avisar por WhatsApp todos os motoristas cadastrados quando um pedido entra na coluna "Aguardando Entregador", ao lado do Web Push que já existe.

**Architecture:** Uma conexão Baileys única sobe no boot do servidor Next (`instrumentation.node.ts`), protegida por uma concessão de instância única no Postgres. O estado de autenticação vive em tabela, não em disco. Todo o código do provedor fica confinado em `src/lib/whatsapp/`, e o gatilho é uma única chamada dentro de `emitOrderAvailableForDrivers`.

**Tech Stack:** Next.js 14 (App Router, standalone), Prisma 5 + PostgreSQL, `@whiskeysockets/baileys`, `qrcode`, `pino`, TypeScript.

**Spec:** `docs/superpowers/specs/2026-09-04-whatsapp-motoristas-design.md`

## Global Constraints

- **Versões fixas, sem `^`:** `@whiskeysockets/baileys@6.17.16`, `qrcode@1.5.4`, `pino@9.14.0`. Dev: `@types/qrcode@1.5.6`.
- **Não usar `@whiskeysockets/baileys@7.x`** — o `latest` do npm aponta para `7.0.0-rc14`, um release candidate. A última estável é a `6.17.16`.
- **Nada fora de `src/lib/whatsapp/` importa Baileys.** É a fronteira de troca de provedor.
- **Números de telefone nunca aparecem em log.** Só id do usuário e os 4 últimos dígitos.
- **Credenciais de sessão nunca saem do banco.** Não vão para log, não são retornadas por Server Action, não chegam ao cliente.
- **Filtro por papel na consulta**, nunca como checagem posterior: `where: { role: "MOTORISTA", active: true, phone: { not: null } }`.
- **O envio nunca lança.** Falha de WhatsApp não pode derrubar uma ação de logística.
- Texto da mensagem, exatamente:
  ```
  Novo pacote disponível para entrega!
  Acesse https://buildflowapp.com.br/login para mais informações.
  ```
- Comentários e mensagens de UI em português, seguindo o estilo do repositório.
- Verificação de cada tarefa: `npx tsc --noEmit` e, quando houver script de checagem, `npx tsx scripts/checks/<arquivo>.ts`.

## Convenção nova introduzida por este plano

O repositório não tem framework de teste. Este plano adiciona `scripts/checks/*.ts`,
executáveis com `npx tsx` (já é devDependency). São checagens de lógica pura,
sem banco e sem rede. **Se preferir não introduzir essa pasta, diga antes de
executar** — a alternativa é verificar só com `tsc` e `build`, perdendo a
cobertura da serialização e da montagem de JID.

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/whatsapp/pure.ts` | Lógica pura: JID, backoff, concessão expirada, máscara de log. Sem Prisma, sem Baileys. |
| `src/lib/whatsapp/auth-store.ts` | `AuthenticationState` do Baileys sobre a tabela `WhatsappSession`. |
| `src/lib/whatsapp/lease.ts` | Concessão de instância única com heartbeat. |
| `src/lib/whatsapp/connection.ts` | Socket singleton, ciclo de vida, reconexão, QR em memória. |
| `src/lib/whatsapp/send.ts` | API pública: envio aos motoristas e status. |
| `src/lib/whatsapp/index.ts` | Reexporta apenas o público. |
| `src/lib/actions/whatsapp.ts` | Server Actions do painel de Gestão. |
| `src/app/(dashboard)/gestao/whatsapp-panel.tsx` | Painel: status, QR, interruptor. |
| `scripts/checks/whatsapp-pure.ts` | Checagem da lógica pura. |
| `scripts/checks/whatsapp-auth-store.ts` | Checagem do round-trip BufferJSON. |

---

### Task 1: Dependências e configuração de build

**Files:**
- Modify: `package.json`
- Modify: `next.config.mjs`

**Interfaces:**
- Consumes: nada.
- Produces: os pacotes `@whiskeysockets/baileys`, `qrcode`, `pino` disponíveis e externalizados do bundle.

- [ ] **Step 1: Instalar as dependências com versão exata**

```bash
npm install --save-exact @whiskeysockets/baileys@6.17.16 qrcode@1.5.4 pino@9.14.0
npm install --save-exact --save-dev @types/qrcode@1.5.6
```

- [ ] **Step 2: Conferir que o `package.json` gravou sem `^`**

```bash
node -e "const p=require('./package.json');for(const k of ['@whiskeysockets/baileys','qrcode','pino'])console.log(k,p.dependencies[k]);console.log('@types/qrcode',p.devDependencies['@types/qrcode'])"
```

Esperado: `6.17.16`, `1.5.4`, `9.14.0`, `1.5.6` — sem `^` nem `~`. Se algum vier com prefixo, editar o `package.json` à mão e rodar `npm install` de novo.

- [ ] **Step 3: Externalizar do bundle no `next.config.mjs`**

Trocar a linha existente:

```js
    serverComponentsExternalPackages: ['sharp'],
```

por:

```js
    // sharp e binario nativo: nao deve ser empacotado pelo webpack, e sim
    // resolvido em runtime pelo Node.
    // baileys/pino/qrcode entram pelo mesmo motivo: o baileys carrega
    // protobuf e libsignal, que o empacotamento quebra.
    serverComponentsExternalPackages: ['sharp', '@whiskeysockets/baileys', 'pino', 'qrcode'],
```

- [ ] **Step 4: Verificar que o build continua passando**

```bash
npx tsc --noEmit && npm run build
```

Esperado: `tsc` sem saída e build com exit 0. O erro `Authentication failed against database server at localhost` durante "Generating static pages" é pré-existente (não há Postgres local) e não invalida o build.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json next.config.mjs
git commit -m "Adiciona dependencias do WhatsApp (Baileys, qrcode, pino)"
```

---

### Task 2: Modelos e migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260904140000_whatsapp/migration.sql`

**Interfaces:**
- Consumes: nada.
- Produces: modelos Prisma `WhatsappSession`, `WhatsappConfig`, `WhatsappLock`, `WhatsappSendLog` e o enum `WhatsappSendStatus`.

- [ ] **Step 1: Adicionar os modelos ao fim do `prisma/schema.prisma`**

```prisma
// ===========================================================================
// WHATSAPP (notificacao de motoristas via Baileys)
// ===========================================================================

// Estado de autenticacao do Baileys. Uma linha por chave.
// `id` = "creds" ou "<tipo>:<id>" (pre-key, session, app-state-sync-key, ...).
// Fica no banco, e nao em disco, para sobreviver a recriacao do container:
// todo deploy do EasyPanel monta um container novo.
model WhatsappSession {
  id        String   @id
  // JSON serializado com BufferJSON do Baileys (contem Buffer/Uint8Array).
  data      String
  updatedAt DateTime @updatedAt
  createdAt DateTime @default(now())
}

// Configuracao do canal. Linha unica ("singleton").
model WhatsappConfig {
  id        String   @id @default("singleton")
  // Interruptor de envio. Nasce FALSE: nada e enviado ate alguem parear o
  // numero e ligar deliberadamente na tela de Gestao.
  enabled   Boolean  @default(false)
  updatedAt DateTime @updatedAt
}

// Concessao de instancia unica. Duas conexoes com a mesma credencial se
// derrubam e colocam o numero em risco de bloqueio, entao so um processo
// conecta. Linha unica ("singleton").
model WhatsappLock {
  id          String   @id @default("singleton")
  instanceId  String
  heartbeatAt DateTime
}

enum WhatsappSendStatus {
  ENVIADO
  FALHOU
  // Numero ausente ou invalido: nao houve tentativa de envio.
  IGNORADO
}

// Log por destinatario. NUNCA guarda o numero inteiro.
// Sem relacao Prisma com Order/User de proposito: e registro historico e nao
// deve impedir a exclusao de um pedido ou usuario (deleteOrder apaga de fato).
model WhatsappSendLog {
  id          String             @id @default(cuid())
  orderId     String?
  userId      String
  // 4 ultimos digitos, para conferencia sem expor o numero.
  phoneSuffix String?
  status      WhatsappSendStatus
  error       String?
  createdAt   DateTime           @default(now())

  @@index([orderId])
  @@index([userId])
  @@index([createdAt])
}
```

- [ ] **Step 2: Escrever a migration**

Criar `prisma/migrations/20260904140000_whatsapp/migration.sql`:

```sql
-- Notificacao de motoristas por WhatsApp (Baileys).
--
-- Quatro tabelas novas e um enum. NAO altera nenhuma tabela existente.
-- Escrita a mao e idempotente, no mesmo estilo das demais migrations do
-- projeto: o CMD do Dockerfile roda `migrate deploy` a cada subida.

DO $$ BEGIN
  CREATE TYPE "WhatsappSendStatus" AS ENUM ('ENVIADO', 'FALHOU', 'IGNORADO');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "WhatsappSession" (
  "id"        TEXT NOT NULL,
  "data"      TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WhatsappSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "WhatsappConfig" (
  "id"        TEXT NOT NULL DEFAULT 'singleton',
  "enabled"   BOOLEAN NOT NULL DEFAULT false,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WhatsappConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "WhatsappLock" (
  "id"          TEXT NOT NULL DEFAULT 'singleton',
  "instanceId"  TEXT NOT NULL,
  "heartbeatAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WhatsappLock_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "WhatsappSendLog" (
  "id"          TEXT NOT NULL,
  "orderId"     TEXT,
  "userId"      TEXT NOT NULL,
  "phoneSuffix" TEXT,
  "status"      "WhatsappSendStatus" NOT NULL,
  "error"       TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WhatsappSendLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "WhatsappSendLog_orderId_idx"   ON "WhatsappSendLog"("orderId");
CREATE INDEX IF NOT EXISTS "WhatsappSendLog_userId_idx"    ON "WhatsappSendLog"("userId");
CREATE INDEX IF NOT EXISTS "WhatsappSendLog_createdAt_idx" ON "WhatsappSendLog"("createdAt");
```

- [ ] **Step 3: Validar e gerar o client**

```bash
npx prisma validate && npx prisma generate
```

Esperado: `The schema at prisma\schema.prisma is valid 🚀` e `Generated Prisma Client`.

- [ ] **Step 4: Conferir que os tipos novos existem**

```bash
npx tsc --noEmit
node -e "const{PrismaClient}=require('@prisma/client');const c=new PrismaClient();for(const m of ['whatsappSession','whatsappConfig','whatsappLock','whatsappSendLog'])console.log(m, typeof c[m]);"
```

Esperado: as quatro linhas com `object`.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260904140000_whatsapp
git commit -m "Adiciona modelos de sessao, config, lock e log do WhatsApp"
```

---

### Task 3: Lógica pura (`pure.ts`)

Concentra tudo que dá para verificar sem banco e sem rede. As tarefas seguintes só fazem a cola.

**Files:**
- Create: `src/lib/whatsapp/pure.ts`
- Create: `scripts/checks/whatsapp-pure.ts`

**Interfaces:**
- Consumes: `normalizePhone`, `isValidPhone` de `src/lib/phone.ts` (já existem).
- Produces:
  - `toWhatsappJid(phone: string | null): string | null`
  - `phoneSuffix(phone: string | null): string | null`
  - `nextBackoffDelay(attempt: number, rand?: () => number): number`
  - `isLeaseExpired(heartbeatAt: Date | null, now: Date): boolean`
  - `sendSpacingMs(rand?: () => number): number`
  - Constantes `LEASE_TTL_MS = 90_000`, `LEASE_HEARTBEAT_MS = 30_000`

- [ ] **Step 1: Escrever o script de checagem (falhando)**

Criar `scripts/checks/whatsapp-pure.ts`:

```ts
// Checagem da logica pura do modulo de WhatsApp.
// Rodar com: npx tsx scripts/checks/whatsapp-pure.ts
import {
  toWhatsappJid,
  phoneSuffix,
  nextBackoffDelay,
  isLeaseExpired,
  sendSpacingMs,
  LEASE_TTL_MS,
} from "../../src/lib/whatsapp/pure";

let falhas = 0;
function check(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) {
    falhas++;
    console.log(`FALHOU ${nome}\n  esperado=${JSON.stringify(esperado)}\n  obtido  =${JSON.stringify(obtido)}`);
  }
}

// --- toWhatsappJid: prefixa 55 e monta o JID; invalido vira null ---
check("jid celular", toWhatsappJid("11988887777"), "5511988887777@s.whatsapp.net");
check("jid fixo", toWhatsappJid("1133334444"), "551133334444@s.whatsapp.net");
check("jid mascarado", toWhatsappJid("(11) 98888-7777"), "5511988887777@s.whatsapp.net");
check("jid ja com 55", toWhatsappJid("5511988887777"), "5511988887777@s.whatsapp.net");
check("jid null", toWhatsappJid(null), null);
check("jid vazio", toWhatsappJid(""), null);
check("jid curto", toWhatsappJid("11988"), null);
check("jid ddd invalido", toWhatsappJid("01988887777"), null);
check("jid celular sem 9", toWhatsappJid("11888887777"), null);

// --- phoneSuffix: 4 ultimos digitos, nunca o numero inteiro ---
check("sufixo", phoneSuffix("11988887777"), "7777");
check("sufixo mascarado", phoneSuffix("(11) 98888-7777"), "7777");
check("sufixo null", phoneSuffix(null), null);
check("sufixo curto", phoneSuffix("123"), null);

// --- nextBackoffDelay: 2s dobrando ate o teto de 60s, com jitter de ate 20% ---
check("backoff 0 sem jitter", nextBackoffDelay(0, () => 0), 2000);
check("backoff 1 sem jitter", nextBackoffDelay(1, () => 0), 4000);
check("backoff 2 sem jitter", nextBackoffDelay(2, () => 0), 8000);
check("backoff teto", nextBackoffDelay(20, () => 0), 60000);
check("backoff jitter maximo", nextBackoffDelay(0, () => 1), 2400);
// Sem rand explicito continua dentro da faixa.
const b = nextBackoffDelay(3);
check("backoff faixa", b >= 16000 && b <= 19200, true);

// --- isLeaseExpired ---
const agora = new Date("2026-09-04T12:00:00.000Z");
check("concessao inexistente", isLeaseExpired(null, agora), true);
check("concessao fresca", isLeaseExpired(new Date(agora.getTime() - 1000), agora), false);
check("concessao no limite", isLeaseExpired(new Date(agora.getTime() - LEASE_TTL_MS), agora), true);
check("concessao velha", isLeaseExpired(new Date(agora.getTime() - LEASE_TTL_MS - 1), agora), true);
check("concessao futura", isLeaseExpired(new Date(agora.getTime() + 5000), agora), false);

// --- sendSpacingMs: 1s a 3s ---
check("espacamento minimo", sendSpacingMs(() => 0), 1000);
check("espacamento maximo", sendSpacingMs(() => 1), 3000);

console.log(falhas === 0 ? "OK: whatsapp-pure" : `${falhas} falha(s) em whatsapp-pure`);
process.exit(falhas === 0 ? 0 : 1);
```

- [ ] **Step 2: Rodar para ver falhar**

```bash
npx tsx scripts/checks/whatsapp-pure.ts
```

Esperado: falha de resolução de módulo (`Cannot find module .../src/lib/whatsapp/pure`).

- [ ] **Step 3: Implementar `src/lib/whatsapp/pure.ts`**

```ts
// Logica pura do modulo de WhatsApp: sem Prisma, sem Baileys, sem rede.
// Isolada aqui para poder ser verificada por script (scripts/checks/).

import { normalizePhone, isValidPhone } from "@/lib/phone";

/** Sufixo do JID de usuario individual no WhatsApp. */
const JID_SUFFIX = "@s.whatsapp.net";

/** Codigo do pais. O banco guarda o numero SEM ele (ver src/lib/phone.ts). */
const COUNTRY_CODE = "55";

/** Tempo sem heartbeat apos o qual a concessao e considerada abandonada. */
export const LEASE_TTL_MS = 90_000;

/** Intervalo de renovacao do heartbeat. Bem menor que o TTL, de proposito. */
export const LEASE_HEARTBEAT_MS = 30_000;

const BACKOFF_BASE_MS = 2_000;
const BACKOFF_MAX_MS = 60_000;
const BACKOFF_JITTER = 0.2;

const SPACING_MIN_MS = 1_000;
const SPACING_MAX_MS = 3_000;

/**
 * Monta o JID do WhatsApp a partir do telefone guardado no banco.
 *
 * O banco guarda digitos com DDD e SEM codigo de pais; a prefixacao do "55"
 * acontece aqui, na borda com o provedor. Retorna null para numero ausente ou
 * invalido — quem chama registra como IGNORADO e nao tenta enviar.
 */
export function toWhatsappJid(phone: string | null): string | null {
  if (!phone) return null;
  const digitos = normalizePhone(phone);
  if (!isValidPhone(digitos)) return null;
  return `${COUNTRY_CODE}${digitos}${JID_SUFFIX}`;
}

/**
 * Ultimos 4 digitos, para log. Nunca devolve o numero inteiro: e o que permite
 * conferir "foi para o numero certo?" sem expor o telefone no log.
 */
export function phoneSuffix(phone: string | null): string | null {
  if (!phone) return null;
  const digitos = normalizePhone(phone);
  if (digitos.length < 4) return null;
  return digitos.slice(-4);
}

/**
 * Espera antes da proxima tentativa de reconexao: 2s dobrando a cada tentativa
 * ate o teto de 60s, com jitter de ate 20% para cima. O jitter evita que
 * varios processos reconectem no mesmo instante.
 */
export function nextBackoffDelay(attempt: number, rand: () => number = Math.random): number {
  const base = Math.min(BACKOFF_BASE_MS * 2 ** Math.max(0, attempt), BACKOFF_MAX_MS);
  return Math.round(base * (1 + BACKOFF_JITTER * rand()));
}

/**
 * A concessao esta livre? Sem linha (null) conta como livre. O limite e
 * inclusivo: exatamente no TTL ja e considerada abandonada.
 */
export function isLeaseExpired(heartbeatAt: Date | null, now: Date): boolean {
  if (!heartbeatAt) return true;
  return now.getTime() - heartbeatAt.getTime() >= LEASE_TTL_MS;
}

/**
 * Intervalo entre um destinatario e o proximo (1s a 3s). Disparo em paralelo
 * para N numeros e o padrao que mais provoca bloqueio do numero.
 */
export function sendSpacingMs(rand: () => number = Math.random): number {
  return Math.round(SPACING_MIN_MS + (SPACING_MAX_MS - SPACING_MIN_MS) * rand());
}
```

- [ ] **Step 4: Rodar a checagem e o type-check**

```bash
npx tsx scripts/checks/whatsapp-pure.ts && npx tsc --noEmit
```

Esperado: `OK: whatsapp-pure` e `tsc` sem saída.

Se `tsx` não resolver o alias `@/lib/phone`, trocar o import de `pure.ts` por `../phone` (caminho relativo) — o alias funciona no build do Next, mas o `tsx` fora do Next depende do `tsconfig.json`, que já define `paths`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/whatsapp/pure.ts scripts/checks/whatsapp-pure.ts
git commit -m "Adiciona logica pura do modulo de WhatsApp"
```

---

### Task 4: Store de sessão (`auth-store.ts`)

**Files:**
- Create: `src/lib/whatsapp/auth-store.ts`
- Create: `scripts/checks/whatsapp-auth-store.ts`

**Interfaces:**
- Consumes: `prisma` de `@/lib/prisma`; `BufferJSON`, `initAuthCreds`, `proto` de `@whiskeysockets/baileys`.
- Produces:
  - `serializeAuthValue(value: unknown): string`
  - `deserializeAuthValue<T>(raw: string): T`
  - `useDatabaseAuthState(): Promise<{ state: AuthenticationState; saveCreds: () => Promise<void> }>`
  - `clearWhatsappSession(): Promise<void>`

- [ ] **Step 1: Escrever o script de checagem (falhando)**

Criar `scripts/checks/whatsapp-auth-store.ts`. Só o round-trip de serialização — é a parte que corrompe silenciosamente se estiver errada, e não precisa de banco:

```ts
// Checagem do round-trip BufferJSON do store de sessao do WhatsApp.
// Rodar com: npx tsx scripts/checks/whatsapp-auth-store.ts
//
// Nao toca no banco: exercita apenas a serializacao, que e onde um erro
// silencioso quebraria a sessao horas depois, na hora de enviar.
import { serializeAuthValue, deserializeAuthValue } from "../../src/lib/whatsapp/auth-store";

let falhas = 0;
function check(nome: string, cond: boolean) {
  if (!cond) { falhas++; console.log(`FALHOU ${nome}`); }
}

// Buffer sobrevive ao round-trip como Buffer, com o mesmo conteudo.
const buf = Buffer.from([1, 2, 3, 250, 255]);
const voltaBuf = deserializeAuthValue<Buffer>(serializeAuthValue(buf));
check("Buffer continua Buffer", Buffer.isBuffer(voltaBuf));
check("Buffer preserva bytes", Buffer.compare(buf, voltaBuf) === 0);

// Uint8Array aninhado dentro de objeto (formato real das chaves Signal).
const par = { public: new Uint8Array([9, 8, 7]), private: new Uint8Array([1, 0, 255]) };
const voltaPar = deserializeAuthValue<{ public: Uint8Array; private: Uint8Array }>(
  serializeAuthValue(par),
);
check("public preserva bytes", Buffer.compare(Buffer.from(par.public), Buffer.from(voltaPar.public)) === 0);
check("private preserva bytes", Buffer.compare(Buffer.from(par.private), Buffer.from(voltaPar.private)) === 0);

// Estrutura mista, como as creds reais.
const creds = {
  registrationId: 42,
  advSecretKey: "abc",
  registered: false,
  noiseKey: { public: new Uint8Array([1, 2]), private: new Uint8Array([3, 4]) },
  processedHistoryMessages: [],
  me: undefined,
};
const voltaCreds = deserializeAuthValue<typeof creds>(serializeAuthValue(creds));
check("escalares preservados", voltaCreds.registrationId === 42 && voltaCreds.advSecretKey === "abc");
check("booleano preservado", voltaCreds.registered === false);
check("array vazio preservado", Array.isArray(voltaCreds.processedHistoryMessages));
check("chave aninhada preservada",
  Buffer.compare(Buffer.from(creds.noiseKey.public), Buffer.from(voltaCreds.noiseKey.public)) === 0);

// Regressao: JSON.stringify puro NAO preserva Buffer — e o motivo do BufferJSON.
const ingenuo = JSON.parse(JSON.stringify(buf));
check("JSON puro realmente perde o Buffer", !Buffer.isBuffer(ingenuo));

console.log(falhas === 0 ? "OK: whatsapp-auth-store" : `${falhas} falha(s) em whatsapp-auth-store`);
process.exit(falhas === 0 ? 0 : 1);
```

- [ ] **Step 2: Rodar para ver falhar**

```bash
npx tsx scripts/checks/whatsapp-auth-store.ts
```

Esperado: falha de resolução de módulo (`Cannot find module .../auth-store`).

- [ ] **Step 3: Implementar `src/lib/whatsapp/auth-store.ts`**

```ts
// Estado de autenticacao do Baileys sobre o Postgres.
//
// Substitui o useMultiFileAuthState (que grava arquivos): todo deploy do
// EasyPanel recria o container, entao a sessao em disco exigiria escanear o QR
// de novo a cada implantacao.

import { BufferJSON, initAuthCreds, proto } from "@whiskeysockets/baileys";
import type {
  AuthenticationCreds,
  AuthenticationState,
  SignalDataTypeMap,
} from "@whiskeysockets/baileys";
import { prisma } from "@/lib/prisma";

/** Linha que guarda as credenciais principais. */
const CREDS_ID = "creds";

/**
 * Serializa com o BufferJSON do Baileys.
 *
 * OBRIGATORIO: o estado contem Buffer e Uint8Array, que JSON.stringify puro
 * converte em objeto comum. O erro nao aparece na gravacao — a sessao so falha
 * depois, na hora de enviar, com mensagem que nao aponta para a causa.
 */
export function serializeAuthValue(value: unknown): string {
  return JSON.stringify(value, BufferJSON.replacer);
}

/** Contraparte de serializeAuthValue. */
export function deserializeAuthValue<T>(raw: string): T {
  return JSON.parse(raw, BufferJSON.reviver) as T;
}

async function readRow<T>(id: string): Promise<T | null> {
  const row = await prisma.whatsappSession.findUnique({ where: { id } });
  if (!row) return null;
  try {
    return deserializeAuthValue<T>(row.data);
  } catch {
    // Linha corrompida: tratada como ausente. O Baileys regenera a chave, e
    // se forem as creds o fluxo cai em "aguardando QR".
    return null;
  }
}

async function writeRow(id: string, value: unknown): Promise<void> {
  const data = serializeAuthValue(value);
  await prisma.whatsappSession.upsert({
    where: { id },
    update: { data },
    create: { id, data },
  });
}

async function deleteRows(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await prisma.whatsappSession.deleteMany({ where: { id: { in: ids } } });
}

/**
 * Monta o AuthenticationState lendo e gravando na tabela WhatsappSession.
 * Espelha o useMultiFileAuthState oficial, trocando arquivo por linha.
 */
export async function useDatabaseAuthState(): Promise<{
  state: AuthenticationState;
  saveCreds: () => Promise<void>;
}> {
  const creds: AuthenticationCreds =
    (await readRow<AuthenticationCreds>(CREDS_ID)) ?? initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const rowIds = ids.map((id) => `${type}:${id}`);
          const rows = await prisma.whatsappSession.findMany({
            where: { id: { in: rowIds } },
          });
          const data: { [id: string]: SignalDataTypeMap[typeof type] } = {};
          for (const row of rows) {
            const id = row.id.slice(type.length + 1);
            let value = deserializeAuthValue<SignalDataTypeMap[typeof type]>(row.data);
            // O app-state-sync-key precisa voltar como mensagem do protobuf, e
            // nao como objeto solto — igual ao store oficial do Baileys.
            if (type === "app-state-sync-key" && value) {
              value = proto.Message.AppStateSyncKeyData.fromObject(
                value as object,
              ) as SignalDataTypeMap[typeof type];
            }
            data[id] = value;
          }
          return data;
        },
        set: async (data) => {
          const gravar: Promise<void>[] = [];
          const remover: string[] = [];
          for (const category in data) {
            const bucket = data[category as keyof typeof data];
            if (!bucket) continue;
            for (const id in bucket) {
              const value = bucket[id];
              const rowId = `${category}:${id}`;
              // valor null significa "remover esta chave".
              if (value) gravar.push(writeRow(rowId, value));
              else remover.push(rowId);
            }
          }
          await Promise.all(gravar);
          await deleteRows(remover);
        },
      },
    },
    saveCreds: () => writeRow(CREDS_ID, creds),
  };
}

/**
 * Apaga a sessao inteira. Usado no "desconectar/reparear" da tela de Gestao e
 * quando o WhatsApp responde loggedOut (credencial morta).
 */
export async function clearWhatsappSession(): Promise<void> {
  await prisma.whatsappSession.deleteMany({});
}
```

- [ ] **Step 4: Rodar a checagem e o type-check**

```bash
npx tsx scripts/checks/whatsapp-auth-store.ts && npx tsc --noEmit
```

Esperado: `OK: whatsapp-auth-store` e `tsc` sem saída.

- [ ] **Step 5: Commit**

```bash
git add src/lib/whatsapp/auth-store.ts scripts/checks/whatsapp-auth-store.ts
git commit -m "Adiciona store de sessao do WhatsApp em Postgres"
```

---

### Task 5: Concessão de instância única (`lease.ts`)

**Files:**
- Create: `src/lib/whatsapp/lease.ts`

**Interfaces:**
- Consumes: `isLeaseExpired`, `LEASE_TTL_MS`, `LEASE_HEARTBEAT_MS` de `./pure`; `prisma`.
- Produces:
  - `acquireLease(instanceId: string): Promise<boolean>`
  - `startHeartbeat(instanceId: string): () => void` (devolve a função de parada)

- [ ] **Step 1: Implementar `src/lib/whatsapp/lease.ts`**

```ts
// Concessao de instancia unica para a conexao do WhatsApp.
//
// Duas conexoes com a mesma credencial se derrubam e colocam o numero em risco
// de bloqueio, entao apenas um processo pode conectar.
//
// pg_advisory_lock foi descartado: o lock do Postgres vive preso a conexao que
// o tomou, e o Prisma trabalha com pool — nao ha como garantir que a conexao
// detentora continue viva nem que seja reutilizada. A concessao por linha com
// heartbeat funciona com pool e sobrevive a queda do processo (a linha
// simplesmente expira).

import { prisma } from "@/lib/prisma";
import { isLeaseExpired, LEASE_HEARTBEAT_MS } from "./pure";

const LOCK_ID = "singleton";

/**
 * Tenta assumir a lideranca. Devolve true se este processo pode conectar.
 *
 * Assume quando: a linha nao existe, ja e deste processo, ou o heartbeat do
 * dono atual expirou. A corrida entre processos e resolvida no banco pelo
 * updateMany condicionado ao dono esperado — dois processos podem ler o mesmo
 * estado, mas so um consegue o update.
 */
export async function acquireLease(instanceId: string): Promise<boolean> {
  const agora = new Date();
  const atual = await prisma.whatsappLock.findUnique({ where: { id: LOCK_ID } });

  if (!atual) {
    try {
      await prisma.whatsappLock.create({
        data: { id: LOCK_ID, instanceId, heartbeatAt: agora },
      });
      return true;
    } catch {
      // Outro processo criou a linha entre o findUnique e o create.
      return false;
    }
  }

  if (atual.instanceId === instanceId) {
    await prisma.whatsappLock.update({
      where: { id: LOCK_ID },
      data: { heartbeatAt: agora },
    });
    return true;
  }

  if (!isLeaseExpired(atual.heartbeatAt, agora)) return false;

  // Toma a concessao abandonada, mas so se o dono ainda for o que lemos.
  const { count } = await prisma.whatsappLock.updateMany({
    where: { id: LOCK_ID, instanceId: atual.instanceId, heartbeatAt: atual.heartbeatAt },
    data: { instanceId, heartbeatAt: agora },
  });
  return count === 1;
}

/**
 * Mantem a concessao viva enquanto o processo estiver de pe. Devolve a funcao
 * que interrompe a renovacao.
 *
 * O timer usa unref() para nao segurar o processo aberto no encerramento.
 */
export function startHeartbeat(instanceId: string): () => void {
  const timer = setInterval(() => {
    void prisma.whatsappLock
      .updateMany({ where: { id: LOCK_ID, instanceId }, data: { heartbeatAt: new Date() } })
      .catch((err) => console.error("[whatsapp] falha ao renovar concessao:", err));
  }, LEASE_HEARTBEAT_MS);
  // O tsconfig inclui a lib "dom", entao setInterval pode tipar como number,
  // que nao tem unref(). O cast mantem o unref quando existe (Node) e nao
  // quebra o type-check. unref evita que o timer segure o processo aberto.
  (timer as unknown as { unref?: () => void }).unref?.();
  return () => clearInterval(timer);
}

// Nao existe "liberar concessao" de proposito: se o processo morre, o
// heartbeat para e a linha expira sozinha pelo TTL. Uma liberacao explicita so
// teria valor num encerramento limpo, que nao e garantido de qualquer forma.
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Esperado: sem saída.

- [ ] **Step 3: Commit**

```bash
git add src/lib/whatsapp/lease.ts
git commit -m "Adiciona concessao de instancia unica da conexao do WhatsApp"
```

---

### Task 6: Conexão e boot (`connection.ts`)

**Files:**
- Create: `src/lib/whatsapp/connection.ts`
- Modify: `src/instrumentation.node.ts`

**Interfaces:**
- Consumes: `useDatabaseAuthState`, `clearWhatsappSession` (Task 4); `acquireLease`, `startHeartbeat` (Task 5); `nextBackoffDelay` (Task 3).
- Produces:
  - `type WhatsappState = "DESCONECTADO" | "AGUARDANDO_QR" | "CONECTANDO" | "CONECTADO" | "SEM_LIDERANCA" | "BLOQUEADO"`
  - `startWhatsapp(): Promise<void>`
  - `getConnectionSnapshot(): { state: WhatsappState; qr: string | null; connectedNumber: string | null }`
  - `getSocket(): WASocket | null`
  - `disconnectAndReset(): Promise<void>`

- [ ] **Step 1: Implementar `src/lib/whatsapp/connection.ts`**

```ts
// Conexao unica com o WhatsApp via Baileys.
//
// Sobe no boot do servidor (instrumentation.node.ts) e vive enquanto o
// processo viver. Guarda o QR corrente em memoria para a tela de Gestao ler —
// o QR NUNCA vai para o log.

import makeWASocket, {
  Browsers,
  DisconnectReason,
  type WASocket,
} from "@whiskeysockets/baileys";
import pino from "pino";
import { useDatabaseAuthState, clearWhatsappSession } from "./auth-store";
import { acquireLease, startHeartbeat } from "./lease";
import { nextBackoffDelay } from "./pure";

export type WhatsappState =
  | "DESCONECTADO"
  | "AGUARDANDO_QR"
  | "CONECTANDO"
  | "CONECTADO"
  | "SEM_LIDERANCA"
  | "BLOQUEADO";

// Instancia deste processo. Aleatoria e so em memoria: se o processo morre, a
// concessao expira sozinha pelo heartbeat.
const INSTANCE_ID = `${process.pid}-${Math.random().toString(36).slice(2, 10)}`;

let socket: WASocket | null = null;
let state: WhatsappState = "DESCONECTADO";
let qr: string | null = null;
let connectedNumber: string | null = null;
let attempt = 0;
let starting = false;
let stopHeartbeat: (() => void) | null = null;

/**
 * Logger silencioso, passado explicitamente.
 *
 * O logger padrao do Baileys e verboso e imprime JIDs — silencia-lo faz parte
 * do requisito de nao expor numeros em log.
 */
const logger = pino({ level: "silent" });

export function getConnectionSnapshot(): {
  state: WhatsappState;
  qr: string | null;
  connectedNumber: string | null;
} {
  return { state, qr, connectedNumber };
}

export function getSocket(): WASocket | null {
  return state === "CONECTADO" ? socket : null;
}

/**
 * Sobe a conexao. Idempotente: chamadas concorrentes ou repetidas nao abrem
 * um segundo socket.
 */
export async function startWhatsapp(): Promise<void> {
  if (starting || socket) return;
  starting = true;
  try {
    const lider = await acquireLease(INSTANCE_ID);
    if (!lider) {
      state = "SEM_LIDERANCA";
      // Uma linha so: outro processo ja conectou, e isso e o esperado.
      console.log("[whatsapp] outro processo detem a conexao; este nao vai conectar.");
      return;
    }
    stopHeartbeat ??= startHeartbeat(INSTANCE_ID);
    await connect();
  } finally {
    starting = false;
  }
}

async function connect(): Promise<void> {
  const { state: authState, saveCreds } = await useDatabaseAuthState();
  state = authState.creds.registered ? "CONECTANDO" : "AGUARDANDO_QR";

  const sock = makeWASocket({
    auth: authState,
    logger,
    // O QR vai para a tela de Gestao, nunca para o log do container.
    printQRInTerminal: false,
    browser: Browsers.appropriate("Build.Flow"),
    // Nao marcar online: se marcasse, o WhatsApp passaria a entregar as
    // notificacoes a este cliente em vez de ao celular do dono do numero.
    markOnlineOnConnect: false,
    syncFullHistory: false,
  });
  socket = sock;

  sock.ev.on("creds.update", () => {
    void saveCreds().catch((err) =>
      console.error("[whatsapp] falha ao gravar credenciais:", err),
    );
  });

  sock.ev.on("connection.update", (update) => {
    if (update.qr) {
      qr = update.qr;
      state = "AGUARDANDO_QR";
    }

    if (update.connection === "open") {
      qr = null;
      attempt = 0;
      state = "CONECTADO";
      // Guarda so a parte numerica do JID proprio, para exibir na tela.
      connectedNumber = sock.user?.id?.split(":")[0]?.split("@")[0] ?? null;
      console.log("[whatsapp] conectado.");
      return;
    }

    if (update.connection === "close") {
      void handleClose(update.lastDisconnect);
    }
  });
}

async function handleClose(lastDisconnect: unknown): Promise<void> {
  socket = null;
  const code = extractStatusCode(lastDisconnect);

  // 515 (restartRequired) NAO e erro: acontece logo apos parear o QR, e o
  // Baileys exige reabrir o socket. Reconecta na hora, sem backoff.
  if (code === DisconnectReason.restartRequired) {
    console.log("[whatsapp] reinicio solicitado apos pareamento; reconectando.");
    attempt = 0;
    await connect().catch((err) => console.error("[whatsapp] falha ao reconectar:", err));
    return;
  }

  // Credencial morta: reconectar nao resolve, precisa de QR novo.
  if (code === DisconnectReason.loggedOut) {
    console.log("[whatsapp] sessao encerrada no aparelho; aguardando novo QR.");
    await clearWhatsappSession().catch(() => undefined);
    qr = null;
    connectedNumber = null;
    state = "AGUARDANDO_QR";
    attempt = 0;
    await connect().catch((err) => console.error("[whatsapp] falha ao reiniciar:", err));
    return;
  }

  // Numero bloqueado ou sessao tomada por outro cliente: parar e esperar
  // intervencao humana. Reconectar aqui so piora.
  if (code === DisconnectReason.forbidden || code === DisconnectReason.connectionReplaced) {
    console.error(`[whatsapp] conexao encerrada em definitivo (codigo ${code}).`);
    state = "BLOQUEADO";
    connectedNumber = null;
    return;
  }

  const espera = nextBackoffDelay(attempt);
  attempt += 1;
  state = "CONECTANDO";
  console.log(`[whatsapp] queda (codigo ${code ?? "?"}); reconectando em ${espera}ms.`);
  // Mesmo motivo do lease.ts: com a lib "dom" no tsconfig, setTimeout pode
  // tipar como number, que nao tem unref().
  const t = setTimeout(() => {
    void connect().catch((err) => console.error("[whatsapp] falha ao reconectar:", err));
  }, espera);
  (t as unknown as { unref?: () => void }).unref?.();
}

/** Extrai o statusCode do Boom que o Baileys anexa ao lastDisconnect. */
function extractStatusCode(lastDisconnect: unknown): number | undefined {
  const erro = (lastDisconnect as { error?: unknown } | undefined)?.error;
  const output = (erro as { output?: { statusCode?: number } } | undefined)?.output;
  return output?.statusCode;
}

/**
 * Desconecta e apaga a sessao, forcando novo pareamento. Usado pela tela de
 * Gestao quando alguem quer trocar o numero.
 */
export async function disconnectAndReset(): Promise<void> {
  try {
    socket?.end(undefined);
  } catch {
    // Socket ja caido: nada a fazer.
  }
  socket = null;
  qr = null;
  connectedNumber = null;
  attempt = 0;
  await clearWhatsappSession();
  state = "AGUARDANDO_QR";
  await connect().catch((err) => console.error("[whatsapp] falha ao reiniciar:", err));
}
```

- [ ] **Step 2: Subir a conexão no boot**

Substituir o corpo de `src/instrumentation.node.ts`:

```ts
/**
 * Inicializacao exclusiva do runtime Node. Isolado de `instrumentation.ts`
 * para que o bundler edge nunca alcance este modulo.
 */
export async function bootstrapNodeRuntime(): Promise<void> {
  // Durante `next build` o Next carrega este modulo ao coletar as paginas.
  // Abrir a conexao ali gastaria uma tentativa de pareamento a cada build.
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  const { startWhatsapp } = await import("@/lib/whatsapp/connection");
  // Fire-and-forget: um WhatsApp fora do ar nunca pode impedir o servidor
  // de subir e atender pedidos.
  void startWhatsapp().catch((err) =>
    console.error("[boot] falha ao iniciar o WhatsApp:", err),
  );
}
```

- [ ] **Step 3: Type-check e build**

```bash
npx tsc --noEmit && npm run build
```

Esperado: `tsc` sem saída e build exit 0.

- [ ] **Step 4: Confirmar que o Baileys foi para o standalone**

```bash
ls .next/standalone/node_modules/@whiskeysockets/baileys/package.json
```

Esperado: o caminho existe. **Se não existir**, o pacote externalizado não foi copiado, e o `Dockerfile` precisa de uma linha `COPY` como a que já existe para o Prisma — registrar o achado e tratar antes do deploy.

- [ ] **Step 5: Commit**

```bash
git add src/lib/whatsapp/connection.ts src/instrumentation.node.ts
git commit -m "Adiciona conexao do WhatsApp com reconexao automatica"
```

---

### Task 7: Server Actions e painel de Gestão

Vem antes do envio de propósito: sem esta tela não há como parear o número.

**Files:**
- Create: `src/lib/actions/whatsapp.ts`
- Create: `src/app/(dashboard)/gestao/whatsapp-panel.tsx`
- Modify: `src/app/(dashboard)/gestao/tabs-client.tsx`

**Interfaces:**
- Consumes: `getConnectionSnapshot`, `disconnectAndReset` (Task 6); `requireRoleAction` de `@/lib/auth`; `actionOk`/`actionError` de `@/types/action`.
- Produces:
  - `getWhatsappPanelState(): Promise<ActionResult<WhatsappPanelState>>`
  - `setWhatsappEnabled(enabled: boolean): Promise<ActionResult<void>>`
  - `resetWhatsappSession(): Promise<ActionResult<void>>`
  - `interface WhatsappPanelState { state: string; qrDataUrl: string | null; connectedNumber: string | null; enabled: boolean }`

- [ ] **Step 1: Implementar `src/lib/actions/whatsapp.ts`**

```ts
"use server";

import QRCode from "qrcode";
import { prisma } from "@/lib/prisma";
import { requireRoleAction } from "@/lib/auth";
import { actionOk, actionError, type ActionResult } from "@/types/action";
import { getConnectionSnapshot, disconnectAndReset } from "@/lib/whatsapp/connection";

export interface WhatsappPanelState {
  state: string;
  /** QR ja renderizado como data URL. O codigo cru nunca sai daqui. */
  qrDataUrl: string | null;
  /** Numero conectado, mascarado para exibicao. */
  connectedNumber: string | null;
  enabled: boolean;
}

/** Mostra so os 4 ultimos digitos do numero conectado. */
function maskNumber(numero: string | null): string | null {
  if (!numero || numero.length < 4) return null;
  return `•••• ${numero.slice(-4)}`;
}

async function readEnabled(): Promise<boolean> {
  const cfg = await prisma.whatsappConfig.findUnique({ where: { id: "singleton" } });
  return cfg?.enabled ?? false;
}

export async function getWhatsappPanelState(): Promise<ActionResult<WhatsappPanelState>> {
  try {
    await requireRoleAction(["GESTAO"]);
    const snap = getConnectionSnapshot();
    const qrDataUrl = snap.qr ? await QRCode.toDataURL(snap.qr, { margin: 1, width: 280 }) : null;
    return actionOk({
      state: snap.state,
      qrDataUrl,
      connectedNumber: maskNumber(snap.connectedNumber),
      enabled: await readEnabled(),
    });
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao ler status do WhatsApp.");
  }
}

/** Interruptor de envio. Permite desligar sem deploy. */
export async function setWhatsappEnabled(enabled: boolean): Promise<ActionResult<void>> {
  try {
    await requireRoleAction(["GESTAO"]);
    await prisma.whatsappConfig.upsert({
      where: { id: "singleton" },
      update: { enabled },
      create: { id: "singleton", enabled },
    });
    return actionOk(undefined);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao alterar o envio.");
  }
}

/** Desconecta e apaga a sessao, forcando novo pareamento por QR. */
export async function resetWhatsappSession(): Promise<ActionResult<void>> {
  try {
    await requireRoleAction(["GESTAO"]);
    await disconnectAndReset();
    return actionOk(undefined);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao reiniciar a sessão.");
  }
}
```

- [ ] **Step 2: Implementar o painel `src/app/(dashboard)/gestao/whatsapp-panel.tsx`**

```tsx
"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  getWhatsappPanelState,
  setWhatsappEnabled,
  resetWhatsappSession,
  type WhatsappPanelState,
} from "@/lib/actions/whatsapp";

const ROTULO: Record<string, string> = {
  DESCONECTADO: "Desconectado",
  AGUARDANDO_QR: "Aguardando leitura do QR",
  CONECTANDO: "Conectando...",
  CONECTADO: "Conectado",
  SEM_LIDERANCA: "Outro processo detém a conexão",
  BLOQUEADO: "Conexão bloqueada — precisa de intervenção",
};

const TOM: Record<string, string> = {
  CONECTADO: "border-motorista/40 bg-motorista/10 text-motorista",
  AGUARDANDO_QR: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  BLOQUEADO: "border-destructive/40 bg-destructive/10 text-destructive",
};

export function WhatsappPanel() {
  const [info, setInfo] = useState<WhatsappPanelState | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const carregar = useCallback(async () => {
    const res = await getWhatsappPanelState();
    if (res.ok) { setInfo(res.data); setErro(null); }
    else setErro(res.error);
  }, []);

  useEffect(() => { void carregar(); }, [carregar]);

  // Enquanto espera o QR, atualiza de 3 em 3s: o codigo expira em torno de
  // 60s e e substituido por um novo.
  useEffect(() => {
    if (info?.state !== "AGUARDANDO_QR") return;
    const id = setInterval(() => { void carregar(); }, 3000);
    return () => clearInterval(id);
  }, [info?.state, carregar]);

  function alternarEnvio() {
    if (!info) return;
    start(async () => {
      const res = await setWhatsappEnabled(!info.enabled);
      if (res.ok) await carregar();
      else setErro(res.error);
    });
  }

  function reiniciar() {
    start(async () => {
      const res = await resetWhatsappSession();
      if (res.ok) await carregar();
      else setErro(res.error);
    });
  }

  if (!info) {
    return <p className="text-sm text-muted-foreground">Carregando status do WhatsApp...</p>;
  }

  return (
    <div className="space-y-4">
      <div className={`rounded-lg border px-3 py-2 text-sm font-semibold ${TOM[info.state] ?? "border-border bg-secondary/30"}`}>
        {ROTULO[info.state] ?? info.state}
        {info.connectedNumber && (
          <span className="ml-2 font-normal opacity-80">({info.connectedNumber})</span>
        )}
      </div>

      {info.qrDataUrl && (
        <div className="rounded-lg border border-border p-4">
          <p className="mb-2 text-sm font-medium">Escaneie com o WhatsApp do número da operação</p>
          <p className="mb-3 text-xs text-muted-foreground">
            No celular: Aparelhos conectados → Conectar um aparelho. O código é renovado
            automaticamente a cada poucos segundos.
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={info.qrDataUrl} alt="QR Code do WhatsApp" width={280} height={280} />
        </div>
      )}

      <div className="rounded-lg border border-border p-4">
        <p className="font-medium">Envio de notificações</p>
        <p className="mb-3 text-sm text-muted-foreground">
          Quando desligado, nenhuma mensagem é enviada, mesmo com a conexão ativa.
          Use para interromper os disparos sem precisar de um novo deploy.
        </p>
        <Button variant={info.enabled ? "destructive" : "brand"} onClick={alternarEnvio} disabled={pending}>
          {info.enabled ? "Desligar envio" : "Ligar envio"}
        </Button>
      </div>

      <div className="rounded-lg border border-border p-4">
        <p className="font-medium">Trocar de número</p>
        <p className="mb-3 text-sm text-muted-foreground">
          Desconecta e apaga a sessão. Será necessário escanear um novo QR Code.
        </p>
        <Button variant="outline" onClick={reiniciar} disabled={pending}>
          Desconectar e reparear
        </Button>
      </div>

      {erro && <p className="text-sm text-destructive">{erro}</p>}
    </div>
  );
}
```

O QR usa `<img>` e não `next/image` de propósito: é um data URL já dimensionado,
e o otimizador de imagens está desligado no projeto (`images.unoptimized`).

- [ ] **Step 3: Ligar a aba em `tabs-client.tsx`**

São três edições pontuais.

Primeira — acrescentar o import junto dos demais do arquivo:

```tsx
import { WhatsappPanel } from "./whatsapp-panel";
```

Segunda — no array `TABS`, trocar:

```tsx
const TABS = ["Usuários", "Clientes", "Metas", "Campanhas", "Etapas", "Lojas", "Lojas de Origem", "Tipos de Pedido", "Operações", "Formas de Envio"] as const;
```

por:

```tsx
const TABS = ["Usuários", "Clientes", "Metas", "Campanhas", "Etapas", "Lojas", "Lojas de Origem", "Tipos de Pedido", "Operações", "Formas de Envio", "WhatsApp"] as const;
```

Terceira — no corpo de `GestaoTabs`, logo depois desta linha:

```tsx
      {tab === "Formas de Envio" && <SimplePanel entity="shippingMethod" rows={props.shippingMethods} label="forma de envio" />}
```

acrescentar:

```tsx
      {tab === "WhatsApp" && <WhatsappPanel />}
```

- [ ] **Step 4: Type-check e build**

```bash
npx tsc --noEmit && npm run build
```

Esperado: `tsc` sem saída e build exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/actions/whatsapp.ts "src/app/(dashboard)/gestao/whatsapp-panel.tsx" "src/app/(dashboard)/gestao/tabs-client.tsx"
git commit -m "Adiciona painel de WhatsApp em Gestao (QR, status e interruptor)"
```

---

### Task 8: Envio (`send.ts`)

**Files:**
- Create: `src/lib/whatsapp/send.ts`
- Create: `src/lib/whatsapp/index.ts`

**Interfaces:**
- Consumes: `getSocket`, `getConnectionSnapshot` (Task 6); `toWhatsappJid`, `phoneSuffix`, `sendSpacingMs` (Task 3); `prisma`.
- Produces:
  - `sendWhatsappToDrivers(args: { orderId?: string }): Promise<void>`
  - `MENSAGEM_NOVO_PACOTE` (constante com o texto exato)

- [ ] **Step 1: Implementar `src/lib/whatsapp/send.ts`**

```ts
// Envio de notificacao aos motoristas.
//
// Fronteira publica do modulo: nada fora de src/lib/whatsapp/ conhece Baileys.
// Nunca lanca — falha de WhatsApp nao pode derrubar uma acao de logistica.

import { prisma } from "@/lib/prisma";
import { getSocket, getConnectionSnapshot } from "./connection";
import { toWhatsappJid, phoneSuffix, sendSpacingMs } from "./pure";

/** Texto exato definido pelo produto. */
export const MENSAGEM_NOVO_PACOTE =
  "Novo pacote disponível para entrega!\n" +
  "Acesse https://buildflowapp.com.br/login para mais informações.";

function espera(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function envioLigado(): Promise<boolean> {
  const cfg = await prisma.whatsappConfig.findUnique({ where: { id: "singleton" } });
  return cfg?.enabled === true;
}

/**
 * Avisa TODOS os motoristas de que ha pacote disponivel.
 *
 * O filtro por papel esta na consulta ao banco, e nao numa checagem posterior:
 * nao existe caminho neste codigo em que outro perfil receba mensagem.
 */
export async function sendWhatsappToDrivers(args: { orderId?: string }): Promise<void> {
  try {
    if (!(await envioLigado())) {
      console.log("[whatsapp] envio desligado; nada enviado.");
      return;
    }

    const snap = getConnectionSnapshot();
    const sock = getSocket();
    if (!sock) {
      console.warn(`[whatsapp] sem conexao (estado ${snap.state}); nada enviado.`);
      return;
    }

    const motoristas = await prisma.user.findMany({
      where: { role: "MOTORISTA", active: true, phone: { not: null } },
      select: { id: true, phone: true },
    });

    if (motoristas.length === 0) {
      console.log("[whatsapp] nenhum motorista com telefone cadastrado.");
      return;
    }

    let enviados = 0;
    let falhas = 0;
    let ignorados = 0;

    for (let i = 0; i < motoristas.length; i++) {
      const m = motoristas[i];
      const sufixo = phoneSuffix(m.phone);
      const jid = toWhatsappJid(m.phone);

      if (!jid) {
        ignorados++;
        await registrar(args.orderId, m.id, sufixo, "IGNORADO", "Telefone ausente ou inválido.");
        console.warn(`[whatsapp] usuario ${m.id}: telefone invalido; ignorado.`);
        continue;
      }

      // try/catch POR DESTINATARIO: uma falha nunca interrompe as demais.
      try {
        await sock.sendMessage(jid, { text: MENSAGEM_NOVO_PACOTE });
        enviados++;
        await registrar(args.orderId, m.id, sufixo, "ENVIADO", null);
        console.log(`[whatsapp] enviado para usuario ${m.id} (final ${sufixo ?? "?"}).`);
      } catch (err) {
        falhas++;
        const motivo = err instanceof Error ? err.message : "Erro desconhecido.";
        await registrar(args.orderId, m.id, sufixo, "FALHOU", motivo);
        console.error(`[whatsapp] falha para usuario ${m.id} (final ${sufixo ?? "?"}): ${motivo}`);
      }

      // Espacamento entre destinatarios. Disparo paralelo para N numeros e o
      // padrao que mais provoca bloqueio do numero.
      if (i < motoristas.length - 1) await espera(sendSpacingMs());
    }

    console.log(
      `[whatsapp] concluido: ${enviados} enviado(s), ${falhas} falha(s), ${ignorados} ignorado(s).`,
    );
  } catch (err) {
    // Rede de seguranca: esta funcao nunca lanca para quem a chamou.
    console.error("[whatsapp] erro inesperado no envio:", err);
  }
}

async function registrar(
  orderId: string | undefined,
  userId: string,
  phoneSuffixValue: string | null,
  status: "ENVIADO" | "FALHOU" | "IGNORADO",
  error: string | null,
): Promise<void> {
  try {
    await prisma.whatsappSendLog.create({
      data: { orderId: orderId ?? null, userId, phoneSuffix: phoneSuffixValue, status, error },
    });
  } catch (err) {
    // Falhar ao gravar o log nao pode interromper os envios seguintes.
    console.error("[whatsapp] falha ao gravar log de envio:", err);
  }
}
```

- [ ] **Step 2: Criar `src/lib/whatsapp/index.ts`**

```ts
// Superficie publica do modulo de WhatsApp. Importar daqui, e nao dos
// arquivos internos — e o que permite trocar de provedor sem tocar em quem usa.
export { sendWhatsappToDrivers, MENSAGEM_NOVO_PACOTE } from "./send";
export { startWhatsapp, getConnectionSnapshot, type WhatsappState } from "./connection";
```

- [ ] **Step 3: Conferir que nada fora do módulo importa Baileys**

```bash
grep -rn "baileys" --include="*.ts" --include="*.tsx" src | grep -v "^src/lib/whatsapp/"
```

Esperado: nenhuma linha.

- [ ] **Step 4: Type-check e build**

```bash
npx tsc --noEmit && npm run build
```

Esperado: `tsc` sem saída e build exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/whatsapp/send.ts src/lib/whatsapp/index.ts
git commit -m "Adiciona envio de WhatsApp aos motoristas com log por destinatario"
```

---

### Task 9: Gatilho

Por último de propósito: só ligar o disparo quando todo o resto já funciona.

**Files:**
- Modify: `src/lib/realtime/emit.ts` (função `emitOrderAvailableForDrivers`)

**Interfaces:**
- Consumes: `sendWhatsappToDrivers` (Task 8).
- Produces: nada.

- [ ] **Step 1: Adicionar o import no topo de `src/lib/realtime/emit.ts`**

```ts
import { sendWhatsappToDrivers } from "@/lib/whatsapp";
```

- [ ] **Step 2: Adicionar a chamada em `emitOrderAvailableForDrivers`**

Logo depois do bloco `void sendPushToRole("MOTORISTA", {...})` existente, ainda
dentro da função, acrescentar:

```ts
  // Segundo canal, no mesmo gatilho e no mesmo caráter fire-and-forget: o
  // WhatsApp nunca pode derrubar a ação de logística que abriu o pedido.
  void sendWhatsappToDrivers({ orderId: args.orderId }).catch((err) =>
    console.error("[whatsapp] envio p/ motoristas falhou:", err),
  );
```

- [ ] **Step 3: Confirmar que é o único ponto de disparo**

```bash
grep -rn "sendWhatsappToDrivers" --include="*.ts" --include="*.tsx" src
```

Esperado: exatamente três linhas — a definição em `src/lib/whatsapp/send.ts`, o reexport em `src/lib/whatsapp/index.ts` e esta única chamada em `src/lib/realtime/emit.ts`. Nenhuma ocorrência em `src/lib/actions/orders.ts` nem em qualquer ponto de criação de pedido.

- [ ] **Step 4: Rodar a verificação completa**

```bash
npx tsx scripts/checks/whatsapp-pure.ts \
  && npx tsx scripts/checks/whatsapp-auth-store.ts \
  && npx prisma validate \
  && npx tsc --noEmit \
  && npm run build
```

Esperado: as duas checagens com `OK:`, schema válido, `tsc` sem saída e build exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/realtime/emit.ts
git commit -m "Dispara WhatsApp aos motoristas quando o pedido abre para entrega"
```

---

## Verificação manual (exige aparelho e número real)

Não dá para automatizar. Fazer em homologação, nesta ordem, **com apenas um
motorista de teste cadastrado** — só ligue o envio depois que o pareamento
estiver de pé:

1. Subir com as migrations aplicadas; abrir Gestão → WhatsApp; conferir que o
   estado é "Aguardando leitura do QR" e o QR aparece
2. Escanear com o celular do número da operação; conferir que o estado vira
   "Conectado" (passando por uma reconexão automática, que é o 515 esperado)
3. Cadastrar telefone de um motorista de teste em Gestão → Usuários
4. Ligar o envio no painel
5. Abrir um pedido para motoristas na Logística; conferir o recebimento
6. Conferir no log do container que aparece o id do usuário e o final de 4
   dígitos — e **nenhum número completo**
7. Redeploy; conferir que volta a "Conectado" **sem** pedir QR de novo
8. Derrubar a rede do container por instantes; conferir a reconexão sozinha
9. Só então cadastrar os demais motoristas

## Pendências para o produto

- **De quem é o número a ser pareado?** Um ban atinge o WhatsApp daquele chip.
  Chip dedicado é bem mais seguro que celular pessoal.
- **Nenhum motorista tem telefone cadastrado hoje.** Sem isso o envio não tem
  destinatário. Preencher em Gestão → Usuários.
- **Quantos motoristas ativos?** Com o espaçamento de 1s a 3s, 10 motoristas
  levam cerca de 20s para receber. Se a equipe for muito maior, revisar o
  intervalo.
