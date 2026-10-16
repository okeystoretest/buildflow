# LP de Atacado e Análise de Clientes — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar a landing page pública de captação de revendedor da OKEY, com link parametrizado por vendedora, e a ferramenta interna "Análise de Clientes" onde a vendedora de atacado aprova, reprova ou marca risco em cada cadastro recebido.

**Architecture:** Rota pública nova (`/atacado/okey`) no próprio Build.Flow, liberada na allowlist do middleware, escrevendo numa tabela própria (`WholesaleLead`) por Server Action. A marca é um valor de enum desde o início, então a Fase 2 (Lov Club) é uma LP e um registro, sem migration. Toda regra decidível vive em módulo TypeScript puro, conferido por script — o idioma de verificação deste projeto.

**Tech Stack:** Next.js 14 (App Router, Server Actions), React 18, TypeScript, Prisma + PostgreSQL, Tailwind, Radix UI, zod, sharp, `tsx` para os scripts de checagem.

**Spec:** [docs/superpowers/specs/2026-10-14-lp-atacado-analise-clientes-design.md](../specs/2026-10-14-lp-atacado-analise-clientes-design.md)

## Global Constraints

Valem para toda tarefa, sem repetição em cada uma.

- **Não existe framework de teste neste projeto.** O "teste" é um script em `scripts/checks/<nome>.ts`, rodado com `npx tsx scripts/checks/<nome>.ts`, que compara valores e termina com `process.exit(1)` se algo falhar. Nunca instale Jest, Vitest ou similar. Siga o formato de `scripts/checks/select-contract.ts`.
- **Toda lógica decidível vai em módulo puro** (sem Prisma, sem rede, sem `cookies()`), para poder ser conferida por script. A Server Action carrega os dados e obedece ao veredito da função pura.
- **Verificação obrigatória de cada tarefa:** `npx tsc --noEmit`, mais o script de checagem da tarefa. Antes de encerrar uma fatia, `npx next build`.
- **Server Actions** começam com `"use server"`, usam `requireRoleAction` de `@/lib/auth` e devolvem `ActionResult` via `actionOk` / `actionError` de `@/types/action`.
- **Controle de acesso é no servidor.** Esconder botão na tela não é controle de acesso — a frase é do próprio `src/lib/actions/selects.ts`.
- **Nada que o navegador manda é gravado como veio.** Valores são relidos do banco ou revalidados.
- **Idioma:** pt-BR na interface e nos comentários. Schema em inglês (decisão 17 da spec do Select).
- **Comentários explicam o *porquê*,** não o quê — é o padrão deste repositório. Onde uma decisão da spec guiou o código, cite o número dela.
- **Nenhum valor monetário, código de reprovação ou texto de FAQ é inventado.** Tudo vem do anexo A da spec, literal.
- **`globals.css` e `tailwind.config.ts` não mudam** por causa da LP (decisão 30).
- **Teto de upload:** `MAX_UPLOAD_MB = 9`, já exportado por `src/lib/image.ts`. Não redefina.
- **Branch:** crie `feat/lp-atacado-analise-clientes` antes da Tarefa 1. A árvore tem trabalho em andamento do Select; não comite nada que não seja desta feature.

## Review Focus

Cinco classes de entrada que a spec implica e que passariam sem teste se ninguém as nomeasse. Cada linha ganhou teste na tarefa que é dona do código.

1. **CNPJ com formatação diferente do mesmo número** (`12.345.678/0001-90` vs `12345678000190`) faria o aviso de repetição (decisão 9) não casar, e a fraude passaria. → Tarefa 5.
2. **Telefone com e sem o nono dígito** é o mesmo defeito que quebrou o envio por WhatsApp em 09/2026: dois cadastros do mesmo número não casariam no aviso. → Tarefa 5.
3. **Código de indicação de vendedora desativada, ou que virou VAREJO depois de o link circular.** O lead não pode ir para quem não pode mais recebê-lo; tem de cair sem dono. → Tarefa 3.
4. **Troca de veredito deixando campo órfão:** `REPROVADO` → `CUIDADO` mantendo `rejectionCode`, ou `CUIDADO` → `APROVADO` mantendo `cautionReason`. A tela passaria a mostrar um motivo que não vale mais. → Tarefa 6.
5. **Foto HEIC de iPhone.** `client-image.ts` aceita `image/heic`, mas nem todo navegador decodifica HEIC em canvas; a compressão falharia e o campo obrigatório ficaria impossível de preencher no iPhone — travando a lojista no fim do formulário. → Tarefa 15.

---

## FATIA 1 — Fundação

Nada aparece na tela. Entrega o modelo, os 34 códigos e as três funções puras que as fatias seguintes consomem.

### Task 1: Módulo dos 34 códigos de reprovação

**Files:**
- Create: `src/lib/wholesale-rejection-codes.ts`
- Test: `scripts/checks/wholesale-rejection-codes.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `REJECTION_CODES: readonly RejectionCode[]`, `interface RejectionCode { code: string; category: string; label: string; criteria: string }`, `findRejectionCode(code: string): RejectionCode | null`, `isValidRejectionCode(code: string): boolean`, `rejectionCodesByCategory(): { category: string; codes: RejectionCode[] }[]`.

- [ ] **Step 1: Escreva a checagem que falha**

Crie `scripts/checks/wholesale-rejection-codes.ts`:

```ts
// Checagem da taxonomia de reprovação da Análise de Clientes.
// Rodar com: npx tsx scripts/checks/wholesale-rejection-codes.ts
//
// O que está em jogo: este módulo é a única fonte dos motivos de recusa. Um
// código que exista no dropdown e não aqui é recusado na gravação; um que
// exista aqui e não na planilha é motivo inventado num registro que a Gestão
// vai analisar depois. A contagem e a ordem são, portanto, parte do contrato.
import {
  REJECTION_CODES,
  findRejectionCode,
  isValidRejectionCode,
  rejectionCodesByCategory,
} from "../../src/lib/wholesale-rejection-codes";

let falhas = 0;
function check(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) {
    falhas++;
    console.log(`FALHOU ${nome}\n  esperado=${JSON.stringify(esperado)}\n  obtido  =${JSON.stringify(obtido)}`);
  }
}

check("são 34 códigos", REJECTION_CODES.length, 34);
check("são 9 categorias", rejectionCodesByCategory().length, 9);
check("primeiro código é 01", REJECTION_CODES[0].code, "01");
check("último código é 34", REJECTION_CODES[33].code, "34");
check(
  "código 11 tem a faixa de preço da planilha",
  findRejectionCode("11")?.criteria,
  "Peças de baixo custo (faixa de R$ 20 a R$ 50) ou de feira.",
);
check(
  "código 19 é da categoria Inexistência de Loja",
  findRejectionCode("19")?.category,
  "Inexistência de Loja",
);
check("código inexistente devolve null", findRejectionCode("99"), null);
check("código inexistente não é válido", isValidRejectionCode("99"), false);
check("código válido é válido", isValidRejectionCode("07"), true);
// Sem zero à esquerda não vale: o dropdown manda "07", nunca "7". Aceitar as
// duas formas faria o mesmo motivo existir com duas chaves no banco.
check("código sem zero à esquerda não é válido", isValidRejectionCode("7"), false);
check("string vazia não é válida", isValidRejectionCode(""), false);
// Todos os códigos têm os quatro campos preenchidos.
check(
  "nenhum código tem campo vazio",
  REJECTION_CODES.filter((c) => !c.code || !c.category || !c.label || !c.criteria).length,
  0,
);
// Códigos únicos.
check("códigos não repetem", new Set(REJECTION_CODES.map((c) => c.code)).size, 34);

if (falhas > 0) {
  console.log(`\n${falhas} checagem(ns) falharam.`);
  process.exit(1);
}
console.log("wholesale-rejection-codes: todas as checagens passaram.");
```

- [ ] **Step 2: Rode para ver falhar**

Run: `npx tsx scripts/checks/wholesale-rejection-codes.ts`
Expected: FALHA na importação — `Cannot find module '../../src/lib/wholesale-rejection-codes'`.

- [ ] **Step 3: Implemente o módulo**

Crie `src/lib/wholesale-rejection-codes.ts`.

**Abra `docs/superpowers/specs/2026-10-14-lp-atacado-analise-clientes-design.md`, seção `### A.5`, e transcreva as 34 linhas da tabela, literalmente.** As quatro colunas viram `code`, `category`, `label`, `criteria`, na ordem. Nenhum texto é reescrito, resumido ou corrigido — nem o rótulo "Ausência de CNPJ" sobre os códigos 02–05, que é da planilha.

Os 34 não estão duplicados aqui de propósito: duas cópias do mesmo texto divergem, e a spec é a única fonte. A checagem do Passo 1 é o guarda — ela confere a contagem, o primeiro, o último, três critérios literais e a ausência de campo vazio. Transcrição errada falha ali, não em produção.

Esqueleto com os três primeiros e o último:

```ts
/**
 * Os 34 motivos de reprovação de um cadastro de atacado.
 *
 * POR QUE MÓDULO E NÃO TABELA (decisão 11 da spec): é o idioma deste projeto
 * para regra decidível (`order-flow.ts`, `finance-constants.ts`), e um script
 * confere a taxonomia inteira sem subir banco. O lead guarda o `code` como
 * string, então aposentar um código no futuro não apaga a leitura do histórico
 * de quem já foi reprovado por ele — o mesmo princípio que manteve EMBALADO no
 * enum do Postgres.
 *
 * O rótulo de categoria vem da célula mesclada da planilha. Em particular
 * "Ausência de CNPJ" cobre 01 a 05, embora 02–05 tratem de CNPJ existente mas
 * irregular. É o rótulo da planilha, transcrito como está: mudá-lo é decisão
 * do negócio, não do código.
 */
export interface RejectionCode {
  /** Dois dígitos, com zero à esquerda. É a chave gravada no lead. */
  code: string;
  category: string;
  /** "Descrição Curta / Motivo" na planilha — o que aparece no dropdown. */
  label: string;
  /** "Detalhamento / Critério" — o texto de apoio à decisão. */
  criteria: string;
}

export const REJECTION_CODES: readonly RejectionCode[] = [
  {
    code: "01",
    category: "Ausência de CNPJ",
    label: "Sem CNPJ",
    criteria: "Cliente não possui registro de CNPJ.",
  },
  {
    code: "02",
    category: "Ausência de CNPJ",
    label: "CNPJ Inválido, Inapto ou Baixado",
    criteria: "CNPJ com inconsistências ou irregular na Receita Federal.",
  },
  {
    code: "03",
    category: "Ausência de CNPJ",
    label: "CNPJ Criado Recentemente",
    criteria: "CNPJ recém-aberto e sem histórico operacional.",
  },
  // ... códigos 04 a 33: transcreva do anexo A.5 da spec, na ordem ...
  {
    code: "34",
    category: "Inconsistência de Dados",
    label: "Tentativa de Burlar Cadastro",
    criteria: "Uso repetido de dados alterados para novas tentativas.",
  },
] as const;

export function findRejectionCode(code: string): RejectionCode | null {
  return REJECTION_CODES.find((c) => c.code === code) ?? null;
}

export function isValidRejectionCode(code: string): boolean {
  return findRejectionCode(code) !== null;
}

/** Agrupado para o dropdown, preservando a ordem da planilha. */
export function rejectionCodesByCategory(): { category: string; codes: RejectionCode[] }[] {
  const out: { category: string; codes: RejectionCode[] }[] = [];
  for (const c of REJECTION_CODES) {
    const atual = out[out.length - 1];
    if (atual && atual.category === c.category) atual.codes.push(c);
    else out.push({ category: c.category, codes: [c] });
  }
  return out;
}
```

- [ ] **Step 4: Rode até passar**

Run: `npx tsx scripts/checks/wholesale-rejection-codes.ts`
Expected: `wholesale-rejection-codes: todas as checagens passaram.`

Depois: `npx tsc --noEmit` — sem erros.

- [ ] **Step 5: Commit**

```bash
git add src/lib/wholesale-rejection-codes.ts scripts/checks/wholesale-rejection-codes.ts
git commit -m "Analise de Clientes: os 34 motivos de reprovacao como modulo conferido"
```

---

### Task 2: Schema e migration

**Files:**
- Modify: `prisma/schema.prisma` (anexar ao fim, após `SelectPayment`)
- Create: `prisma/migrations/20261014120000_wholesale_lead/migration.sql`

**Interfaces:**
- Consumes: nada.
- Produces: modelos `WholesaleLead`, `WholesaleLeadEvent`; enums `WholesaleBrand`, `WholesaleLeadStatus`, `WholesaleServiceModel`, `WholesaleFoundUs`, `WholesaleInvestmentBand`, `WholesaleStoreImageKind`; campo `User.referralCode`.

> **Nota sobre verificação:** o Postgres local recusa as credenciais do `.env` (registrado em `docs/resumo-2026-09-10.md`). A migration é escrita e revisada, **não executada localmente**; ela roda no deploy, onde o `CMD` do Dockerfile faz `migrate deploy && exec node server.js` e o `&&` impede o servidor de subir se falhar. Diga isso no relatório da tarefa em vez de afirmar que a migration foi testada.

- [ ] **Step 1: Anexe os enums e modelos ao schema**

Ao fim de `prisma/schema.prisma`:

```prisma
// ===========================================================================
// ATACADO — captação de revendedor (LP pública + Análise de Clientes)
// ===========================================================================

enum WholesaleBrand {
  OKEY
  LOV_CLUB
}

// Quatro status, da aba "Modal com as respostas" da planilha. NÃO existe
// "solicitar ajustes" (decisão 6): a especificação escrita citava esse estado,
// a planilha não — e é a planilha que manda no conteúdo.
enum WholesaleLeadStatus {
  EM_ANALISE
  APROVADO
  REPROVADO
  // Sinal de risco/fraude, com justificativa obrigatória (decisão 8).
  CUIDADO
}

enum WholesaleServiceModel {
  LOJA_FISICA
  LOJA_ONLINE
  FISICA_E_ONLINE
  OUTRO
}

enum WholesaleFoundUs {
  INSTAGRAM
  SITE
  INDICACAO
  OUTRO
}

enum WholesaleInvestmentBand {
  ATE_3K
  DE_3_A_5K
  DE_5_A_10K
  ACIMA_10K
}

// Qual imagem foi PEDIDA no segundo upload (decisão 21). Loja só online não
// tem espaço físico para fotografar; o campo segue obrigatório, muda o que se
// pede. Guardar qual foi pedida é o que permite a análise saber o que olha.
enum WholesaleStoreImageKind {
  ESPACO_FISICO
  LOJA_ONLINE
}

/// Uma candidatura a revendedor, vinda da LP pública.
/// NÃO é uma Customer (decisão 4): aprovar aqui não cria cliente (decisão 5).
model WholesaleLead {
  id     String              @id @default(cuid())
  brand  WholesaleBrand
  status WholesaleLeadStatus @default(EM_ANALISE)

  // Dono do lead. NULO = chegou sem código de indicação válido e espera a
  // Gestão distribuir (decisão 14). Não descartamos o cadastro: perder uma
  // lojista real porque o parâmetro se perdeu é pior que uma fila de triagem.
  sellerId String?
  seller   User?   @relation("WholesaleLeadSeller", fields: [sellerId], references: [id])

  // --- Seção 1: Boas-vindas e Identificação ---
  contactName String
  email       String
  /// Só dígitos, com DDD e sem código de país — como User.phone. É a chave do
  /// aviso de repetição (decisão 9); formatação divergente faria o mesmo
  /// número não casar consigo mesmo.
  phone       String
  story       String

  // --- Seção 2: Sobre o Seu Negócio ---
  /// UF de 2 letras (decisão 23).
  state             String
  city              String
  serviceModel      WholesaleServiceModel
  serviceModelOther String?
  /// Handle sem o "@".
  instagram         String
  instagramImagePath String
  storeImagePath     String
  storeImageKind     WholesaleStoreImageKind
  marketTime         String
  teamSize           String

  // --- Seção 3: Conectividade e Parceria Comercial ---
  brandsCarried  String
  foundUs        WholesaleFoundUs
  foundUsOther   String?
  followTime     String
  investmentBand WholesaleInvestmentBand
  wantsVisit     Boolean

  // --- Seção 4: Validação Cadastro ---
  /// Só dígitos (14). SEM @unique: a repetição é informação, não erro — é ela
  /// que alimenta o aviso da decisão 9.
  cnpj String

  // --- Decisão ---
  /// "Atendente" da planilha: quem aprovou/reprovou.
  decidedById String?
  decidedBy   User?     @relation("WholesaleLeadDecider", fields: [decidedById], references: [id])
  decidedAt   DateTime?
  /// Um dos 34 de wholesale-rejection-codes.ts. Obrigatório em REPROVADO.
  rejectionCode String?
  /// Obrigatório em CUIDADO (decisão 8).
  cautionReason String?
  /// Texto livre, exibido em maiúsculas (decisão 19).
  assistantName String?

  /// IP do envio: rate limit e o código 34 (tentativa de burlar cadastro).
  submittedIp String?

  events WholesaleLeadEvent[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([brand, status])
  @@index([sellerId, status])
  @@index([cnpj])
  @@index([phone])
}

/// Diário de mudanças de status (decisão 12). Sem ele os campos de decisão
/// seriam sobrescritos e a Gestão só poderia analisar o veredito final — não
/// reversões, não acerto do CUIDADO, não tempo até a decisão.
/// Precedente no projeto: OrderStatusHistory.
model WholesaleLeadEvent {
  id     String        @id @default(cuid())
  leadId String
  lead   WholesaleLead @relation(fields: [leadId], references: [id], onDelete: Cascade)

  fromStatus    WholesaleLeadStatus
  toStatus      WholesaleLeadStatus
  rejectionCode String?
  note          String?

  actorId String
  actor   User   @relation("WholesaleLeadEventActor", fields: [actorId], references: [id])

  createdAt DateTime @default(now())

  @@index([leadId, createdAt])
}
```

- [ ] **Step 2: Acrescente o campo e as relações em `User`**

Em `model User`, junto aos outros campos opcionais de perfil:

```prisma
  // Código opaco de indicação da vendedora de ATACADO. NÃO é o id: um
  // ?v=<userId> vazaria ids internos, seria enumerável e deixaria qualquer
  // pessoa apontar submissões para qualquer vendedora (decisão 13). Opaco e
  // único para poder ser rotacionado se vazar.
  referralCode String? @unique
```

E nas relações de `User`:

```prisma
  wholesaleLeads        WholesaleLead[]      @relation("WholesaleLeadSeller")
  wholesaleLeadsDecided WholesaleLead[]      @relation("WholesaleLeadDecider")
  wholesaleLeadEvents   WholesaleLeadEvent[] @relation("WholesaleLeadEventActor")
```

- [ ] **Step 3: Gere o client e confira que o schema é válido**

Run: `npx prisma generate`
Expected: `Generated Prisma Client`. Qualquer erro de relação aparece aqui.

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Escreva a migration à mão**

Crie `prisma/migrations/20261014120000_wholesale_lead/migration.sql`. Gere o corpo com:

`npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url "$SHADOW_DATABASE_URL" --script`

Se o banco local não estiver disponível, escreva o SQL à mão: `CREATE TYPE` para os seis enums, `CREATE TABLE` para as duas tabelas, `ALTER TABLE "User" ADD COLUMN "referralCode" TEXT`, o índice único dele, e os quatro índices de `WholesaleLead` mais o de `WholesaleLeadEvent`. **Revise linha a linha** — esta migration não será executada localmente.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20261014120000_wholesale_lead
git commit -m "Atacado: modelo de candidatura a revendedor e diario de decisoes"
```

---

### Task 3: Módulo de indicação (referral)

**Files:**
- Create: `src/lib/wholesale-referral.ts`
- Test: `scripts/checks/wholesale-referral.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `generateReferralCode(): string`, `REFERRAL_CODE_LENGTH = 10`, `isWellFormedReferralCode(code: string): boolean`, `resolveReferral(code: string | null | undefined, candidatos: ReferralCandidate[]): string | null`, `interface ReferralCandidate { id: string; referralCode: string | null; role: string; salesModel: string | null; active: boolean }`, `buildReferralLink(baseUrl: string, brand: "OKEY" | "LOV_CLUB", code: string): string`.

- [ ] **Step 1: Escreva a checagem que falha**

Crie `scripts/checks/wholesale-referral.ts`:

```ts
// Checagem da atribuição de lead por link de indicação.
// Rodar com: npx tsx scripts/checks/wholesale-referral.ts
//
// O que está em jogo: esta função decide de quem é a lojista que acabou de se
// cadastrar. Errar para o lado permissivo entrega lead a quem não pode mais
// receber (vendedora desativada, ou que virou VAREJO depois de o link
// circular); errar para o lado restritivo descarta candidata real.
import {
  generateReferralCode,
  isWellFormedReferralCode,
  resolveReferral,
  buildReferralLink,
  REFERRAL_CODE_LENGTH,
  type ReferralCandidate,
} from "../../src/lib/wholesale-referral";

let falhas = 0;
function check(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) {
    falhas++;
    console.log(`FALHOU ${nome}\n  esperado=${JSON.stringify(esperado)}\n  obtido  =${JSON.stringify(obtido)}`);
  }
}

const apta: ReferralCandidate = {
  id: "u-apta",
  referralCode: "ABCDEFGH23",
  role: "VENDAS",
  salesModel: "ATACADO",
  active: true,
};

check("vendedora de atacado ativa recebe o lead", resolveReferral("ABCDEFGH23", [apta]), "u-apta");

// --- Review Focus 3: o link já circulou; a pessoa mudou depois ---
check(
  "vendedora desativada: lead fica sem dono",
  resolveReferral("ABCDEFGH23", [{ ...apta, active: false }]),
  null,
);
check(
  "virou VAREJO depois: lead fica sem dono",
  resolveReferral("ABCDEFGH23", [{ ...apta, salesModel: "VAREJO" }]),
  null,
);
check(
  "mudou de perfil para LOGISTICA: lead fica sem dono",
  resolveReferral("ABCDEFGH23", [{ ...apta, role: "LOGISTICA" }]),
  null,
);
check(
  "GESTAO não é destino de indicação",
  resolveReferral("ABCDEFGH23", [{ ...apta, role: "GESTAO", salesModel: null }]),
  null,
);

// --- ausência e lixo nunca viram erro: viram lead sem dono (decisão 14) ---
check("código ausente", resolveReferral(null, [apta]), null);
check("código vazio", resolveReferral("", [apta]), null);
check("código inexistente", resolveReferral("ZZZZZZZZ99", [apta]), null);
check("código malformado", resolveReferral("abc", [apta]), null);
check("lista vazia", resolveReferral("ABCDEFGH23", []), null);

// Casamento é EXATO: minúscula não casa, para não existirem dois códigos que
// levam ao mesmo lugar por caminhos diferentes.
check("minúscula não casa", resolveReferral("abcdefgh23", [apta]), null);

// --- formato ---
const gerado = generateReferralCode();
check("código gerado tem o tamanho do contrato", gerado.length, REFERRAL_CODE_LENGTH);
check("código gerado é bem-formado", isWellFormedReferralCode(gerado), true);
check("sem caracteres ambíguos", /[ILOU]/.test(gerado), false);
check("dois códigos gerados diferem", generateReferralCode() === generateReferralCode(), false);

// --- link ---
check(
  "link da OKEY",
  buildReferralLink("https://flow.exemplo.com", "OKEY", "ABCDEFGH23"),
  "https://flow.exemplo.com/atacado/okey?r=ABCDEFGH23",
);
check(
  "link do Lov Club usa o slug com hífen",
  buildReferralLink("https://flow.exemplo.com", "LOV_CLUB", "ABCDEFGH23"),
  "https://flow.exemplo.com/atacado/lov-club?r=ABCDEFGH23",
);
// Barra sobrando na base não pode gerar "//atacado".
check(
  "barra final na base é absorvida",
  buildReferralLink("https://flow.exemplo.com/", "OKEY", "ABCDEFGH23"),
  "https://flow.exemplo.com/atacado/okey?r=ABCDEFGH23",
);

if (falhas > 0) {
  console.log(`\n${falhas} checagem(ns) falharam.`);
  process.exit(1);
}
console.log("wholesale-referral: todas as checagens passaram.");
```

- [ ] **Step 2: Rode para ver falhar**

Run: `npx tsx scripts/checks/wholesale-referral.ts`
Expected: FALHA — módulo não encontrado.

- [ ] **Step 3: Implemente o módulo**

```ts
import { randomBytes } from "crypto";

/**
 * Link de indicação: como um lead da LP pública encontra a vendedora dona.
 *
 * O PARÂMETRO NÃO É O userId (decisão 13). Um `?v=<userId>` vazaria ids
 * internos, seria enumerável e deixaria qualquer pessoa apontar submissões
 * para qualquer vendedora. O código é opaco, aleatório e único, e pode ser
 * rotacionado se vazar.
 *
 * Função PURA de propósito: quem chama carrega os candidatos do banco e
 * obedece ao veredito, e um script confere a regra sem subir Postgres.
 */

export const REFERRAL_CODE_LENGTH = 10;

// Base32 sem I, L, O e U: os três primeiros se confundem com 1 e 0 quando
// alguém lê o link em voz alta ou digita à mão, e U sai em palavra acidental.
const ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";

export function generateReferralCode(): string {
  // randomBytes, não Math.random: o código é credencial de atribuição.
  const bytes = randomBytes(REFERRAL_CODE_LENGTH);
  let out = "";
  for (let i = 0; i < REFERRAL_CODE_LENGTH; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}

export function isWellFormedReferralCode(code: string): boolean {
  if (typeof code !== "string" || code.length !== REFERRAL_CODE_LENGTH) return false;
  for (const ch of code) if (!ALPHABET.includes(ch)) return false;
  return true;
}

export interface ReferralCandidate {
  id: string;
  referralCode: string | null;
  role: string;
  salesModel: string | null;
  active: boolean;
}

/**
 * De quem é este lead? Devolve o id da vendedora, ou null.
 *
 * NUNCA lança e nunca devolve erro: código ausente, malformado, inexistente,
 * de usuária desativada ou que deixou de ser VENDAS+ATACADO resolve para null,
 * e o lead entra sem dono para a Gestão distribuir (decisão 14). O link pode
 * ter circulado por meses antes de alguém clicar — a elegibilidade é conferida
 * no momento do envio, não no da geração.
 */
export function resolveReferral(
  code: string | null | undefined,
  candidatos: ReferralCandidate[],
): string | null {
  if (!code || !isWellFormedReferralCode(code)) return null;
  const achado = candidatos.find((c) => c.referralCode === code);
  if (!achado) return null;
  if (!achado.active) return null;
  if (achado.role !== "VENDAS") return null;
  if (achado.salesModel !== "ATACADO") return null;
  return achado.id;
}

/** Slug público de cada marca. Único lugar onde essa tradução existe. */
export function brandSlug(brand: "OKEY" | "LOV_CLUB"): string {
  return brand === "LOV_CLUB" ? "lov-club" : "okey";
}

/**
 * O texto que o botão "Copiar link de indicação" entrega.
 * `baseUrl` vem de variável de ambiente, não do Host da requisição (decisão
 * 35): o botão é clicado dentro do dashboard, mas o link vai para fora, e
 * inferir do Host produz link quebrado atrás do proxy do EasyPanel — erro que
 * só apareceria no celular da lojista.
 */
export function buildReferralLink(
  baseUrl: string,
  brand: "OKEY" | "LOV_CLUB",
  code: string,
): string {
  const base = baseUrl.replace(/\/+$/, "");
  return `${base}/atacado/${brandSlug(brand)}?r=${code}`;
}
```

- [ ] **Step 4: Rode até passar**

Run: `npx tsx scripts/checks/wholesale-referral.ts`
Expected: `wholesale-referral: todas as checagens passaram.`

- [ ] **Step 5: Commit**

```bash
git add src/lib/wholesale-referral.ts scripts/checks/wholesale-referral.ts
git commit -m "Atacado: link de indicacao com codigo opaco, conferido por script"
```

---

### Task 4: Permissões e transição de status

**Files:**
- Create: `src/lib/wholesale-permissions.ts`
- Test: `scripts/checks/wholesale-permissions.ts`

**Interfaces:**
- Consumes: `isValidRejectionCode` de `@/lib/wholesale-rejection-codes` (Tarefa 1).
- Produces: `interface WholesaleActor { userId: string; role: string; salesModel: string | null }`, `canSeeLead(actor, lead: { sellerId: string | null }): boolean`, `canDecideLead(actor, lead): boolean`, `canUseWholesaleTool(actor): boolean`, `resolveDecision(input: DecisionInput): DecisionResult`, `WHOLESALE_DENIED_MSG`.

`DecisionInput = { toStatus: string; rejectionCode?: string | null; cautionReason?: string | null }`
`DecisionResult = { error: string } | { ok: true; rejectionCode: string | null; cautionReason: string | null }`

- [ ] **Step 1: Escreva a checagem que falha**

Crie `scripts/checks/wholesale-permissions.ts`:

```ts
// Checagem de acesso e de transição de status da Análise de Clientes.
// Rodar com: npx tsx scripts/checks/wholesale-permissions.ts
//
// O que está em jogo: quem pode ver e decidir sobre a candidatura de um
// negócio real, e se um veredito pode ficar sem motivo. A limpeza de campo
// órfão também vive aqui — sem ela a tela mostra um motivo que não vale mais.
import {
  canSeeLead,
  canDecideLead,
  canUseWholesaleTool,
  resolveDecision,
  type WholesaleActor,
} from "../../src/lib/wholesale-permissions";

let falhas = 0;
function check(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) {
    falhas++;
    console.log(`FALHOU ${nome}\n  esperado=${JSON.stringify(esperado)}\n  obtido  =${JSON.stringify(obtido)}`);
  }
}

const atacado: WholesaleActor = { userId: "u1", role: "VENDAS", salesModel: "ATACADO" };
const varejo: WholesaleActor = { userId: "u2", role: "VENDAS", salesModel: "VAREJO" };
const gestao: WholesaleActor = { userId: "u3", role: "GESTAO", salesModel: null };
const financeiro: WholesaleActor = { userId: "u4", role: "FINANCEIRO", salesModel: null };

// --- quem usa a ferramenta (decisões 15, 16, 17) ---
check("VENDAS+ATACADO usa", canUseWholesaleTool(atacado), true);
check("VENDAS+VAREJO não usa", canUseWholesaleTool(varejo), false);
check("GESTAO usa", canUseWholesaleTool(gestao), true);
// FINANCEIRO fica fora apesar da paridade que permissions.ts dá em PEDIDOS:
// candidatura a revenda não é pedido (decisão 17).
check("FINANCEIRO não usa", canUseWholesaleTool(financeiro), false);

// --- escopo ---
check("atacado vê o próprio", canSeeLead(atacado, { sellerId: "u1" }), true);
check("atacado não vê o de outra", canSeeLead(atacado, { sellerId: "u9" }), false);
check("atacado não vê o sem dono", canSeeLead(atacado, { sellerId: null }), false);
check("gestão vê o de qualquer uma", canSeeLead(gestao, { sellerId: "u9" }), true);
check("gestão vê o sem dono", canSeeLead(gestao, { sellerId: null }), true);
check("varejo não vê nem o próprio", canSeeLead(varejo, { sellerId: "u2" }), false);
check("decidir segue o mesmo conjunto de ver", canDecideLead(atacado, { sellerId: "u1" }), true);
check("não decide o que não vê", canDecideLead(atacado, { sellerId: null }), false);

// --- invariantes do veredito (decisões 8 e 10) ---
check(
  "reprovar sem código: recusa",
  resolveDecision({ toStatus: "REPROVADO" }),
  { error: "Escolha o motivo da reprovação." },
);
check(
  "reprovar com código inexistente: recusa",
  resolveDecision({ toStatus: "REPROVADO", rejectionCode: "99" }),
  { error: "Motivo de reprovação inválido." },
);
check(
  "reprovar com código válido: aceita",
  resolveDecision({ toStatus: "REPROVADO", rejectionCode: "11" }),
  { ok: true, rejectionCode: "11", cautionReason: null },
);
check(
  "cuidado sem justificativa: recusa",
  resolveDecision({ toStatus: "CUIDADO" }),
  { error: "Descreva o motivo do alerta." },
);
check(
  "cuidado com justificativa só de espaços: recusa",
  resolveDecision({ toStatus: "CUIDADO", cautionReason: "   " }),
  { error: "Descreva o motivo do alerta." },
);
check(
  "cuidado com justificativa: aceita e apara",
  resolveDecision({ toStatus: "CUIDADO", cautionReason: "  CNPJ de terceiros  " }),
  { ok: true, rejectionCode: null, cautionReason: "CNPJ de terceiros" },
);

// --- Review Focus 4: campo órfão na troca de veredito ---
check(
  "ao aprovar, código de reprovação anterior é apagado",
  resolveDecision({ toStatus: "APROVADO", rejectionCode: "11", cautionReason: "algo" }),
  { ok: true, rejectionCode: null, cautionReason: null },
);
check(
  "ao reprovar, justificativa de cuidado anterior é apagada",
  resolveDecision({ toStatus: "REPROVADO", rejectionCode: "11", cautionReason: "fraude" }),
  { ok: true, rejectionCode: "11", cautionReason: null },
);
check(
  "ao marcar cuidado, código de reprovação anterior é apagado",
  resolveDecision({ toStatus: "CUIDADO", rejectionCode: "11", cautionReason: "fraude" }),
  { ok: true, rejectionCode: null, cautionReason: "fraude" },
);
check(
  "voltar para EM_ANALISE limpa os dois",
  resolveDecision({ toStatus: "EM_ANALISE", rejectionCode: "11", cautionReason: "fraude" }),
  { ok: true, rejectionCode: null, cautionReason: null },
);
check(
  "status inexistente: recusa",
  resolveDecision({ toStatus: "ARQUIVADO" }),
  { error: "Status inválido." },
);

if (falhas > 0) {
  console.log(`\n${falhas} checagem(ns) falharam.`);
  process.exit(1);
}
console.log("wholesale-permissions: todas as checagens passaram.");
```

- [ ] **Step 2: Rode para ver falhar**

Run: `npx tsx scripts/checks/wholesale-permissions.ts`
Expected: FALHA — módulo não encontrado.

- [ ] **Step 3: Implemente o módulo**

```ts
import { isValidRejectionCode } from "@/lib/wholesale-rejection-codes";

/**
 * Acesso e transição de status da Análise de Clientes.
 *
 * Puro, no padrão de `permissions.ts`: quem chama carrega a linha do banco e
 * obedece. A guarda real é na Server Action — esconder o botão na tela não é
 * controle de acesso.
 */

export interface WholesaleActor {
  userId: string;
  role: string;
  salesModel: string | null;
}

export const WHOLESALE_DENIED_MSG =
  "Você não tem permissão para acessar a Análise de Clientes.";

/**
 * A ferramenta é do perfil Vendas no escopo Atacado, mais a Gestão (decisões
 * 15 e 16). FINANCEIRO fica fora (decisão 17): `permissions.ts` lhe dá
 * paridade com Vendas em PEDIDOS, e candidatura a revenda não é pedido.
 */
export function canUseWholesaleTool(actor: WholesaleActor): boolean {
  if (actor.role === "GESTAO") return true;
  return actor.role === "VENDAS" && actor.salesModel === "ATACADO";
}

/**
 * Vendedora de atacado vê só os próprios — inclusive NÃO vê os sem dono, que
 * são da fila da Gestão. Espelha `/vendas`, onde VENDAS vê só os próprios
 * pedidos.
 */
export function canSeeLead(
  actor: WholesaleActor,
  lead: { sellerId: string | null },
): boolean {
  if (!canUseWholesaleTool(actor)) return false;
  if (actor.role === "GESTAO") return true;
  return lead.sellerId !== null && lead.sellerId === actor.userId;
}

/** Decidir segue exatamente quem pode ver. */
export function canDecideLead(
  actor: WholesaleActor,
  lead: { sellerId: string | null },
): boolean {
  return canSeeLead(actor, lead);
}

const STATUSES = ["EM_ANALISE", "APROVADO", "REPROVADO", "CUIDADO"] as const;

export interface DecisionInput {
  toStatus: string;
  rejectionCode?: string | null;
  cautionReason?: string | null;
}

export type DecisionResult =
  | { error: string }
  | { ok: true; rejectionCode: string | null; cautionReason: string | null };

/**
 * As invariantes do veredito, num só lugar.
 *
 * Além de recusar veredito sem motivo (decisões 8 e 10), esta função APAGA o
 * campo que deixou de valer. Trocar REPROVADO por CUIDADO sem limpar o código
 * deixaria a tela exibindo um motivo de reprovação sob um alerta de risco — a
 * informação continuaria lá, errada, e ninguém saberia que ela é resto.
 */
export function resolveDecision(input: DecisionInput): DecisionResult {
  if (!STATUSES.includes(input.toStatus as (typeof STATUSES)[number])) {
    return { error: "Status inválido." };
  }

  if (input.toStatus === "REPROVADO") {
    const code = input.rejectionCode?.trim();
    if (!code) return { error: "Escolha o motivo da reprovação." };
    if (!isValidRejectionCode(code)) return { error: "Motivo de reprovação inválido." };
    return { ok: true, rejectionCode: code, cautionReason: null };
  }

  if (input.toStatus === "CUIDADO") {
    const reason = input.cautionReason?.trim();
    if (!reason) return { error: "Descreva o motivo do alerta." };
    return { ok: true, rejectionCode: null, cautionReason: reason };
  }

  // APROVADO e EM_ANALISE não carregam motivo nenhum.
  return { ok: true, rejectionCode: null, cautionReason: null };
}
```

- [ ] **Step 4: Rode até passar**

Run: `npx tsx scripts/checks/wholesale-permissions.ts`
Expected: `wholesale-permissions: todas as checagens passaram.`

- [ ] **Step 5: Commit**

```bash
git add src/lib/wholesale-permissions.ts scripts/checks/wholesale-permissions.ts
git commit -m "Atacado: acesso a Analise de Clientes e invariantes do veredito"
```

---

### Task 5: Normalização de CNPJ e telefone

**Files:**
- Create: `src/lib/wholesale-identity.ts`
- Test: `scripts/checks/wholesale-identity.ts`

**Interfaces:**
- Consumes: `normalizePhone` de `@/lib/phone`.
- Produces: `normalizeCnpj(value: string): string`, `isValidCnpj(value: string): boolean`, `formatCnpj(digits: string): string`, `phoneMatchKeys(digits: string): string[]`.

> **Por que esta tarefa existe:** o aviso de repetição (decisão 9) casa leads por CNPJ e telefone. Se o mesmo número chegar em formatações diferentes, o aviso não dispara e a fraude passa. É o Review Focus 1 e 2.

- [ ] **Step 1: Escreva a checagem que falha**

Crie `scripts/checks/wholesale-identity.ts`:

```ts
// Checagem da normalização que faz o aviso de cadastro repetido funcionar.
// Rodar com: npx tsx scripts/checks/wholesale-identity.ts
//
// O que está em jogo: o aviso da decisão 9 compara CNPJ e telefone entre
// leads. Duas grafias do mesmo número não casam, e o alerta que deveria
// proteger a equipe simplesmente não aparece — calado, como todo defeito de
// normalização.
import {
  normalizeCnpj,
  isValidCnpj,
  formatCnpj,
  phoneMatchKeys,
} from "../../src/lib/wholesale-identity";

let falhas = 0;
function check(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) {
    falhas++;
    console.log(`FALHOU ${nome}\n  esperado=${JSON.stringify(esperado)}\n  obtido  =${JSON.stringify(obtido)}`);
  }
}

// --- Review Focus 1: mesma empresa, grafias diferentes ---
check("CNPJ pontuado vira dígitos", normalizeCnpj("11.222.333/0001-81"), "11222333000181");
check("CNPJ já em dígitos não muda", normalizeCnpj("11222333000181"), "11222333000181");
check("CNPJ com espaços", normalizeCnpj(" 11 222 333 0001 81 "), "11222333000181");
check(
  "as duas grafias normalizam para a mesma chave",
  normalizeCnpj("11.222.333/0001-81") === normalizeCnpj("11222333000181"),
  true,
);

// --- dígitos verificadores ---
check("CNPJ válido", isValidCnpj("11.222.333/0001-81"), true);
check("CNPJ com dígito trocado", isValidCnpj("11.222.333/0001-82"), false);
check("CNPJ curto", isValidCnpj("112223330001"), false);
check("CNPJ longo", isValidCnpj("112223330001811"), false);
// Repetidos passam na conta dos dígitos e não existem: barrar é obrigatório.
check("todos dígitos iguais", isValidCnpj("11111111111111"), false);
check("zeros", isValidCnpj("00000000000000"), false);
check("vazio", isValidCnpj(""), false);
check("texto", isValidCnpj("não tenho"), false);

check("formatação de exibição", formatCnpj("11222333000181"), "11.222.333/0001-81");

// --- Review Focus 2: o nono dígito, o mesmo defeito que quebrou o WhatsApp ---
check(
  "celular com 9 gera as duas chaves",
  phoneMatchKeys("11988887777"),
  ["11988887777", "1188887777"],
);
check(
  "celular sem 9 gera as duas chaves",
  phoneMatchKeys("1188887777"),
  ["1188887777", "11988887777"],
);
check(
  "as duas grafias se encontram",
  phoneMatchKeys("11988887777").includes("1188887777"),
  true,
);
// Fixo de 8 dígitos cujo primeiro não é 9 não ganha variante inventada.
check("fixo não vira celular", phoneMatchKeys("1133334444"), ["1133334444"]);
check("lixo devolve lista vazia", phoneMatchKeys(""), []);

if (falhas > 0) {
  console.log(`\n${falhas} checagem(ns) falharam.`);
  process.exit(1);
}
console.log("wholesale-identity: todas as checagens passaram.");
```

- [ ] **Step 2: Rode para ver falhar**

Run: `npx tsx scripts/checks/wholesale-identity.ts`
Expected: FALHA — módulo não encontrado.

- [ ] **Step 3: Implemente o módulo**

```ts
/**
 * Identidade da candidata: as duas chaves pelas quais um cadastro repetido é
 * reconhecido (decisão 9).
 *
 * Existe porque normalização é o defeito mais silencioso que há: o aviso
 * simplesmente não aparece, e ninguém descobre que ele deveria ter aparecido.
 */

/** Só os dígitos. É a forma gravada no banco e a chave de comparação. */
export function normalizeCnpj(value: string): string {
  return (value || "").replace(/\D/g, "");
}

/**
 * CNPJ válido pelos dígitos verificadores (módulo 11).
 *
 * O projeto só conferia o COMPRIMENTO (14) em `actions/cnpj.ts`. Aqui a conta
 * é feita porque o CNPJ é o campo de validação do cadastro, e os códigos 02 e
 * 05 descrevem conferência humana a partir de um número que já faça sentido —
 * não vale ocupar a analista com dígito digitado errado.
 */
export function isValidCnpj(value: string): boolean {
  const d = normalizeCnpj(value);
  if (d.length !== 14) return false;
  // Sequência repetida passa na conta e não corresponde a empresa nenhuma.
  if (/^(\d)\1{13}$/.test(d)) return false;

  const calcDigito = (base: string): number => {
    let peso = base.length === 12 ? 5 : 6;
    let soma = 0;
    for (const ch of base) {
      soma += Number(ch) * peso;
      peso = peso === 2 ? 9 : peso - 1;
    }
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };

  const d1 = calcDigito(d.slice(0, 12));
  if (d1 !== Number(d[12])) return false;
  const d2 = calcDigito(d.slice(0, 13));
  return d2 === Number(d[13]);
}

export function formatCnpj(digits: string): string {
  const d = normalizeCnpj(digits);
  if (d.length !== 14) return digits;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

/**
 * Todas as grafias pelas quais este telefone pode estar gravado em outro lead.
 *
 * O NONO DÍGITO é o mesmo defeito que quebrou o envio por WhatsApp em 09/2026:
 * número brasileiro registrado antes dele existe nas duas formas, e comparar
 * só a forma recebida faz o mesmo telefone não casar consigo mesmo. Então a
 * busca procura pelas duas.
 *
 * A variante só é gerada para celular (8 dígitos após o DDD começando por
 * 6–9, ou 9 dígitos começando por 9). Fixo não ganha chave inventada.
 */
export function phoneMatchKeys(digits: string): string[] {
  const d = (digits || "").replace(/\D/g, "");
  if (d.length < 10 || d.length > 11) return [];
  const ddd = d.slice(0, 2);
  const resto = d.slice(2);

  if (resto.length === 9 && resto.startsWith("9")) {
    return [d, `${ddd}${resto.slice(1)}`];
  }
  if (resto.length === 8 && /^[6-9]/.test(resto)) {
    return [d, `${ddd}9${resto}`];
  }
  return [d];
}
```

- [ ] **Step 4: Rode até passar**

Run: `npx tsx scripts/checks/wholesale-identity.ts`
Expected: `wholesale-identity: todas as checagens passaram.`

Depois: `npx tsc --noEmit` e `npx next build` — fecha a Fatia 1.

- [ ] **Step 5: Commit**

```bash
git add src/lib/wholesale-identity.ts scripts/checks/wholesale-identity.ts
git commit -m "Atacado: CNPJ com digito verificador e telefone com as duas grafias"
```

---

## FATIA 2 — Ferramenta Análise de Clientes

A partir daqui há tela. Ainda não há LP: os leads de teste entram por um script de semeadura.

### Task 6: Server Action de decisão

**Files:**
- Create: `src/lib/actions/wholesale-leads.ts`
- Test: `scripts/checks/wholesale-decision-flow.ts`

**Interfaces:**
- Consumes: `resolveDecision`, `canDecideLead`, `canUseWholesaleTool`, `WHOLESALE_DENIED_MSG` (Tarefa 4); `isValidRejectionCode` (Tarefa 1).
- Produces: `decideLead(input: { leadId: string; toStatus: string; rejectionCode?: string | null; cautionReason?: string | null; note?: string | null }): Promise<ActionResult<{ status: string }>>`, `setAssistantName(input: { leadId: string; assistantName: string }): Promise<ActionResult<{ assistantName: string }>>`, `assignLeadSeller(input: { leadId: string; sellerId: string }): Promise<ActionResult<void>>`.

- [ ] **Step 1: Escreva a checagem da parte pura que a action usa**

A action toca banco e sessão, então não entra em script. O que entra é a composição que ela obedece: dado um lead e um ator, a decisão é permitida e os campos resultantes são estes. Crie `scripts/checks/wholesale-decision-flow.ts`:

```ts
// Checagem da composição que a Server Action de decisão obedece.
// Rodar com: npx tsx scripts/checks/wholesale-decision-flow.ts
//
// O que está em jogo: a action junta duas regras puras (quem pode decidir, e
// o que o veredito grava). Esta checagem prende a ORDEM delas: permissão
// primeiro, invariante depois. Invertido, a mensagem de erro revelaria a
// existência e o estado de um lead a quem não pode vê-lo.
import { canDecideLead, resolveDecision, type WholesaleActor } from "../../src/lib/wholesale-permissions";

let falhas = 0;
function check(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) {
    falhas++;
    console.log(`FALHOU ${nome}\n  esperado=${JSON.stringify(esperado)}\n  obtido  =${JSON.stringify(obtido)}`);
  }
}

// Reproduz a ordem da action, sem banco.
function simular(
  actor: WholesaleActor,
  lead: { sellerId: string | null },
  entrada: { toStatus: string; rejectionCode?: string | null; cautionReason?: string | null },
) {
  if (!canDecideLead(actor, lead)) return { error: "negado" };
  const d = resolveDecision(entrada);
  if ("error" in d) return { error: d.error };
  return { gravar: { status: entrada.toStatus, ...d } };
}

const atacado: WholesaleActor = { userId: "u1", role: "VENDAS", salesModel: "ATACADO" };

check(
  "lead de outra vendedora: nega ANTES de olhar o veredito",
  simular(atacado, { sellerId: "u9" }, { toStatus: "REPROVADO" }),
  { error: "negado" },
);
check(
  "lead próprio sem código: o erro é do veredito",
  simular(atacado, { sellerId: "u1" }, { toStatus: "REPROVADO" }),
  { error: "Escolha o motivo da reprovação." },
);
check(
  "lead próprio reprovado com código: grava",
  simular(atacado, { sellerId: "u1" }, { toStatus: "REPROVADO", rejectionCode: "11" }),
  { gravar: { status: "REPROVADO", ok: true, rejectionCode: "11", cautionReason: null } },
);
check(
  "aprovar limpa o código anterior na gravação",
  simular(atacado, { sellerId: "u1" }, { toStatus: "APROVADO", rejectionCode: "11" }),
  { gravar: { status: "APROVADO", ok: true, rejectionCode: null, cautionReason: null } },
);

if (falhas > 0) {
  console.log(`\n${falhas} checagem(ns) falharam.`);
  process.exit(1);
}
console.log("wholesale-decision-flow: todas as checagens passaram.");
```

- [ ] **Step 2: Rode para ver passar ou falhar**

Run: `npx tsx scripts/checks/wholesale-decision-flow.ts`
Expected: PASSA (consome só as Tarefas 1 e 4, já prontas). Se falhar, o defeito está nelas.

- [ ] **Step 3: Implemente a action**

Crie `src/lib/actions/wholesale-leads.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRoleAction } from "@/lib/auth";
import { actionOk, actionError, type ActionResult } from "@/types/action";
import { limitText } from "@/lib/utils";
import {
  canDecideLead,
  canUseWholesaleTool,
  resolveDecision,
  WHOLESALE_DENIED_MSG,
  type WholesaleActor,
} from "@/lib/wholesale-permissions";
import type { WholesaleLeadStatus } from "@prisma/client";

/**
 * Decisão sobre uma candidatura de atacado.
 *
 * A ORDEM aqui é parte da segurança: permissão primeiro, invariante depois.
 * Invertida, "Escolha o motivo da reprovação." contaria a quem não pode ver o
 * lead que ele existe e em que estado está.
 *
 * Mudar um veredito já dado é PERMITIDO (decisão 33) e sempre grava evento: a
 * Gestão precisa poder corrigir triagem errada, e o diário é o que torna a
 * correção auditável em vez de silenciosa. Por isso o update e o insert do
 * evento vivem na MESMA transação — sem evento, sem mudança.
 */

const MAX_CAUTION = 500;
const MAX_NOTE = 500;
const MAX_ASSISTANT = 120;

async function atorAtual(): Promise<WholesaleActor> {
  const session = await requireRoleAction(["VENDAS", "GESTAO"]);
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, role: true, salesModel: true },
  });
  if (!user) throw new Error("Usuário da sessão não encontrado.");
  return { userId: user.id, role: user.role, salesModel: user.salesModel };
}

export async function decideLead(input: {
  leadId: string;
  toStatus: string;
  rejectionCode?: string | null;
  cautionReason?: string | null;
  note?: string | null;
}): Promise<ActionResult<{ status: string }>> {
  const actor = await atorAtual();
  if (!canUseWholesaleTool(actor)) return actionError(WHOLESALE_DENIED_MSG);

  const lead = await prisma.wholesaleLead.findUnique({
    where: { id: input.leadId },
    select: { id: true, sellerId: true, status: true },
  });
  // Mesma resposta para "não existe" e "não é seu": a existência do cadastro
  // de um negócio real não é informação pública dentro do sistema.
  if (!lead || !canDecideLead(actor, lead)) return actionError(WHOLESALE_DENIED_MSG);

  const decisao = resolveDecision({
    toStatus: input.toStatus,
    rejectionCode: input.rejectionCode,
    cautionReason: input.cautionReason,
  });
  if ("error" in decisao) return actionError(decisao.error);

  const toStatus = input.toStatus as WholesaleLeadStatus;

  await prisma.$transaction(async (tx) => {
    await tx.wholesaleLead.update({
      where: { id: lead.id },
      data: {
        status: toStatus,
        rejectionCode: decisao.rejectionCode,
        cautionReason: decisao.cautionReason
          ? limitText(decisao.cautionReason, MAX_CAUTION)
          : null,
        decidedById: actor.userId,
        decidedAt: new Date(),
      },
    });
    await tx.wholesaleLeadEvent.create({
      data: {
        leadId: lead.id,
        fromStatus: lead.status,
        toStatus,
        rejectionCode: decisao.rejectionCode,
        note: input.note ? limitText(input.note, MAX_NOTE) : null,
        actorId: actor.userId,
      },
    });
  });

  revalidatePath("/vendas/analise-clientes");
  return actionOk({ status: toStatus });
}

/**
 * "Auxiliar Responsável": texto livre (decisão 19), editável em qualquer
 * status e nunca obrigatória (decisão 34). Gravada em maiúsculas porque a
 * planilha pede exibição em maiúsculas — normalizar na gravação evita que a
 * mesma pessoa apareça em duas caixas diferentes na lista.
 */
export async function setAssistantName(input: {
  leadId: string;
  assistantName: string;
}): Promise<ActionResult<{ assistantName: string }>> {
  const actor = await atorAtual();
  if (!canUseWholesaleTool(actor)) return actionError(WHOLESALE_DENIED_MSG);

  const lead = await prisma.wholesaleLead.findUnique({
    where: { id: input.leadId },
    select: { id: true, sellerId: true },
  });
  if (!lead || !canDecideLead(actor, lead)) return actionError(WHOLESALE_DENIED_MSG);

  const nome = limitText(input.assistantName.trim().toUpperCase(), MAX_ASSISTANT);
  await prisma.wholesaleLead.update({
    where: { id: lead.id },
    data: { assistantName: nome || null },
  });

  revalidatePath("/vendas/analise-clientes");
  return actionOk({ assistantName: nome });
}

/**
 * Distribuição dos leads sem dono. Só GESTAO: é a fila dela (decisão 14), e o
 * destino tem de ser uma vendedora de atacado ativa — relida do banco, nunca
 * aceita como o navegador mandou.
 */
export async function assignLeadSeller(input: {
  leadId: string;
  sellerId: string;
}): Promise<ActionResult<void>> {
  const actor = await atorAtual();
  if (actor.role !== "GESTAO") return actionError(WHOLESALE_DENIED_MSG);

  const destino = await prisma.user.findUnique({
    where: { id: input.sellerId },
    select: { id: true, role: true, salesModel: true, active: true },
  });
  if (!destino || !destino.active || destino.role !== "VENDAS" || destino.salesModel !== "ATACADO") {
    return actionError("Escolha uma vendedora de atacado ativa.");
  }

  await prisma.wholesaleLead.update({
    where: { id: input.leadId },
    data: { sellerId: destino.id },
  });

  revalidatePath("/vendas/analise-clientes");
  return actionOk(undefined);
}
```

- [ ] **Step 4: Confira a compilação**

Run: `npx tsc --noEmit`
Expected: sem erros. Se `limitText` não existir em `@/lib/utils` com essa assinatura, confira o arquivo e ajuste a chamada — ele é usado assim em `src/lib/actions/selects.ts`.

Run: `npx tsx scripts/checks/wholesale-decision-flow.ts`
Expected: todas passaram.

- [ ] **Step 5: Commit**

```bash
git add src/lib/actions/wholesale-leads.ts scripts/checks/wholesale-decision-flow.ts
git commit -m "Analise de Clientes: decisao em transacao, com diario e sem campo orfao"
```

---

### Task 7: Consulta dos leads e aviso de cadastro repetido

**Files:**
- Create: `src/lib/wholesale-queries.ts`
- Test: `scripts/checks/wholesale-duplicate-alert.ts`

**Interfaces:**
- Consumes: `normalizeCnpj`, `phoneMatchKeys` (Tarefa 5); `canUseWholesaleTool` (Tarefa 4).
- Produces: `listLeadsFor(actor: WholesaleActor, opts: { brand?: string; status?: string; page?: number }): Promise<{ leads: LeadRow[]; total: number; totalPages: number }>`, `findDuplicateAlerts(lead: { id: string; cnpj: string; phone: string }): Promise<DuplicateAlert[]>`, `buildDuplicateWhere(leadId: string, cnpj: string, phone: string): object`.

> `buildDuplicateWhere` é separada e **pura** justamente para poder ser conferida: ela é o coração do Review Focus 1 e 2.

- [ ] **Step 1: Escreva a checagem que falha**

Crie `scripts/checks/wholesale-duplicate-alert.ts`:

```ts
// Checagem do filtro que encontra cadastro repetido (decisão 9).
// Rodar com: npx tsx scripts/checks/wholesale-duplicate-alert.ts
//
// O que está em jogo: este filtro é o que faz um alerta de fraude aparecer
// para OUTRA vendedora. Se ele procurar só a grafia recebida, o CNPJ pontuado
// e o telefone sem o nono dígito escapam — e o alerta nunca dispara, calado.
import { buildDuplicateWhere } from "../../src/lib/wholesale-queries";

let falhas = 0;
function check(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) {
    falhas++;
    console.log(`FALHOU ${nome}\n  esperado=${JSON.stringify(esperado)}\n  obtido  =${JSON.stringify(obtido)}`);
  }
}

const where = buildDuplicateWhere("lead-atual", "11.222.333/0001-81", "11988887777");

check(
  "o próprio lead é excluído",
  JSON.stringify(where).includes('"not":"lead-atual"') ||
    JSON.stringify(where).includes('"not": "lead-atual"'),
  true,
);
check(
  "só CUIDADO e REPROVADO alertam",
  JSON.stringify(where).includes("CUIDADO") && JSON.stringify(where).includes("REPROVADO"),
  true,
);
check(
  "aprovado não alerta",
  JSON.stringify(where).includes("APROVADO"),
  false,
);
check(
  "procura o CNPJ só em dígitos",
  JSON.stringify(where).includes("11222333000181"),
  true,
);
check(
  "não procura o CNPJ pontuado",
  JSON.stringify(where).includes("11.222.333"),
  false,
);
check(
  "procura o telefone COM o nono dígito",
  JSON.stringify(where).includes("11988887777"),
  true,
);
check(
  "procura o telefone SEM o nono dígito",
  JSON.stringify(where).includes("1188887777"),
  true,
);

// Telefone inutilizável não deve gerar cláusula de telefone vazia que casaria
// com tudo.
const semTelefone = buildDuplicateWhere("lead-atual", "11222333000181", "");
check(
  "sem telefone válido, não há cláusula de telefone",
  JSON.stringify(semTelefone).includes('"phone"'),
  false,
);

if (falhas > 0) {
  console.log(`\n${falhas} checagem(ns) falharam.`);
  process.exit(1);
}
console.log("wholesale-duplicate-alert: todas as checagens passaram.");
```

- [ ] **Step 2: Rode para ver falhar**

Run: `npx tsx scripts/checks/wholesale-duplicate-alert.ts`
Expected: FALHA — módulo não encontrado.

- [ ] **Step 3: Implemente o módulo**

```ts
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { normalizeCnpj, phoneMatchKeys } from "@/lib/wholesale-identity";
import { canUseWholesaleTool, type WholesaleActor } from "@/lib/wholesale-permissions";

/**
 * Consultas da Análise de Clientes. Nada aqui escreve.
 */

const PAGE_SIZE = 20;

/**
 * O filtro do aviso de cadastro repetido (decisão 9), separado e PURO para
 * poder ser conferido por script.
 *
 * Só CUIDADO e REPROVADO alertam. Aprovado repetido é cliente voltando, não
 * sinal — alertar nele transformaria o aviso em ruído, e aviso ruidoso é aviso
 * que se aprende a ignorar.
 *
 * O CNPJ é procurado em DÍGITOS e o telefone nas DUAS grafias do nono dígito,
 * porque é assim que o mesmo número se reconhece (ver wholesale-identity.ts).
 */
export function buildDuplicateWhere(
  leadId: string,
  cnpj: string,
  phone: string,
): Prisma.WholesaleLeadWhereInput {
  const cnpjDigits = normalizeCnpj(cnpj);
  const telefones = phoneMatchKeys(phone);

  const alternativas: Prisma.WholesaleLeadWhereInput[] = [];
  if (cnpjDigits.length === 14) alternativas.push({ cnpj: cnpjDigits });
  if (telefones.length > 0) alternativas.push({ phone: { in: telefones } });

  return {
    id: { not: leadId },
    status: { in: ["CUIDADO", "REPROVADO"] },
    // Sem nenhuma alternativa utilizável, `OR: []` casaria com nada no Prisma,
    // que é o resultado correto: nada a alertar.
    OR: alternativas,
  };
}

export interface DuplicateAlert {
  id: string;
  status: string;
  cnpj: string;
  phone: string;
  contactName: string;
  rejectionCode: string | null;
  cautionReason: string | null;
  decidedAt: Date | null;
  matchedBy: "cnpj" | "telefone" | "ambos";
}

/**
 * Leads anteriores que pedem cautela sobre esta candidata. Atravessa o escopo
 * da vendedora de propósito: um alerta que só o dono vê não protege ninguém —
 * é a razão de existir do status CUIDADO.
 */
export async function findDuplicateAlerts(lead: {
  id: string;
  cnpj: string;
  phone: string;
}): Promise<DuplicateAlert[]> {
  const cnpjDigits = normalizeCnpj(lead.cnpj);
  const telefones = phoneMatchKeys(lead.phone);

  const achados = await prisma.wholesaleLead.findMany({
    where: buildDuplicateWhere(lead.id, lead.cnpj, lead.phone),
    select: {
      id: true,
      status: true,
      cnpj: true,
      phone: true,
      contactName: true,
      rejectionCode: true,
      cautionReason: true,
      decidedAt: true,
    },
    orderBy: { decidedAt: "desc" },
    take: 10,
  });

  return achados.map((a) => {
    const porCnpj = a.cnpj === cnpjDigits;
    const porTelefone = telefones.includes(a.phone);
    return {
      ...a,
      matchedBy: porCnpj && porTelefone ? "ambos" : porCnpj ? "cnpj" : "telefone",
    };
  });
}

export interface LeadRow {
  id: string;
  brand: string;
  status: string;
  contactName: string;
  city: string;
  state: string;
  instagram: string;
  cnpj: string;
  phone: string;
  assistantName: string | null;
  rejectionCode: string | null;
  createdAt: Date;
  sellerName: string | null;
}

/**
 * Lista paginada, já restrita pelo escopo do ator. A restrição acontece no
 * WHERE, não na tela: filtrar depois de buscar vazaria os dados pelo HTML.
 */
export async function listLeadsFor(
  actor: WholesaleActor,
  opts: { brand?: string; status?: string; page?: number } = {},
): Promise<{ leads: LeadRow[]; total: number; totalPages: number }> {
  if (!canUseWholesaleTool(actor)) return { leads: [], total: 0, totalPages: 1 };

  const where: Prisma.WholesaleLeadWhereInput = {
    ...(actor.role === "GESTAO" ? {} : { sellerId: actor.userId }),
    ...(opts.brand ? { brand: opts.brand as Prisma.EnumWholesaleBrandFilter } : {}),
    ...(opts.status ? { status: opts.status as Prisma.EnumWholesaleLeadStatusFilter } : {}),
  };

  const total = await prisma.wholesaleLead.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(1, opts.page ?? 1), totalPages);

  const rows = await prisma.wholesaleLead.findMany({
    where,
    include: { seller: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });

  return {
    leads: rows.map((r) => ({
      id: r.id,
      brand: r.brand,
      status: r.status,
      contactName: r.contactName,
      city: r.city,
      state: r.state,
      instagram: r.instagram,
      cnpj: r.cnpj,
      phone: r.phone,
      assistantName: r.assistantName,
      rejectionCode: r.rejectionCode,
      createdAt: r.createdAt,
      sellerName: r.seller?.name ?? null,
    })),
    total,
    totalPages,
  };
}

export { PAGE_SIZE as WHOLESALE_PAGE_SIZE };
```

- [ ] **Step 4: Rode até passar**

Run: `npx tsx scripts/checks/wholesale-duplicate-alert.ts`
Expected: todas passaram.

Run: `npx tsc --noEmit` — sem erros. Se o nome de um tipo de filtro do Prisma divergir, use `Prisma.WholesaleLeadWhereInput` com o valor literal e deixe o enum inferir.

- [ ] **Step 5: Commit**

```bash
git add src/lib/wholesale-queries.ts scripts/checks/wholesale-duplicate-alert.ts
git commit -m "Analise de Clientes: lista por escopo e aviso de cadastro repetido"
```

---

### Task 8: Semeadura de leads para desenvolvimento

**Files:**
- Create: `scripts/seed-wholesale-leads.ts`

**Interfaces:**
- Consumes: os modelos da Tarefa 2.
- Produces: nada que o código de produção importe.

> **Por que antes da tela:** a Fatia 2 precisa de dado para ser vista, e a LP só existe na Fatia 3. Sem isto, a próxima tarefa seria construída contra uma lista vazia — e lista vazia é exatamente o estado em que nenhum defeito de layout aparece.

- [ ] **Step 1: Escreva o script**

```ts
// Semeia candidaturas de atacado para desenvolver a Análise de Clientes antes
// de a LP existir. Rodar com: npx tsx scripts/seed-wholesale-leads.ts
//
// NÃO é seed de produção: não entra em prisma/seed.ts. Cria 6 leads, entre
// eles um par que compartilha CNPJ e um par que compartilha telefone em
// grafias diferentes do nono dígito — é esse par que faz o aviso de cadastro
// repetido aparecer na tela.
import { prisma } from "../src/lib/prisma";

async function main() {
  const vendedora = await prisma.user.findFirst({
    where: { role: "VENDAS", salesModel: "ATACADO", active: true },
    select: { id: true, name: true },
  });
  if (!vendedora) {
    console.log("Nenhuma vendedora VENDAS+ATACADO ativa. Crie uma antes.");
    process.exit(1);
  }

  const base = {
    brand: "OKEY" as const,
    story: "Trabalho com moda há alguns anos e quero elevar o mix da loja.",
    state: "CE",
    city: "Fortaleza",
    serviceModel: "LOJA_FISICA" as const,
    instagramImagePath: "/uploads/atacado/exemplo-instagram.webp",
    storeImagePath: "/uploads/atacado/exemplo-loja.webp",
    storeImageKind: "ESPACO_FISICO" as const,
    marketTime: "3 anos",
    teamSize: "2 pessoas",
    brandsCarried: "Marcas regionais",
    foundUs: "INSTAGRAM" as const,
    followTime: "6 meses",
    investmentBand: "DE_3_A_5K" as const,
    wantsVisit: true,
  };

  const leads = [
    { ...base, contactName: "Ana", email: "ana@exemplo.com", phone: "85988887777", instagram: "lojadaana", cnpj: "11222333000181", sellerId: vendedora.id },
    // Mesmo CNPJ da Ana, já reprovado: faz o aviso disparar.
    { ...base, contactName: "Ana Maria", email: "anamaria@exemplo.com", phone: "85999996666", instagram: "anamariastore", cnpj: "11222333000181", sellerId: vendedora.id, status: "REPROVADO" as const, rejectionCode: "34", decidedById: vendedora.id, decidedAt: new Date() },
    // Mesmo telefone da Bruna, SEM o nono dígito, marcado CUIDADO.
    { ...base, contactName: "Bruna", email: "bruna@exemplo.com", phone: "8588885555", instagram: "brunamodas", cnpj: "11444777000161", sellerId: vendedora.id, status: "CUIDADO" as const, cautionReason: "Mesmo telefone de cadastro anterior com dados trocados.", decidedById: vendedora.id, decidedAt: new Date() },
    { ...base, contactName: "Bruna Lima", email: "brunalima@exemplo.com", phone: "85988885555", instagram: "brunalima", cnpj: "11444777000161", sellerId: vendedora.id },
    // Loja só online: exercita o storeImageKind da decisão 21.
    { ...base, contactName: "Carla", email: "carla@exemplo.com", phone: "85977774444", instagram: "carlaonline", cnpj: "19131243000197", serviceModel: "LOJA_ONLINE" as const, storeImageKind: "LOJA_ONLINE" as const, sellerId: vendedora.id },
    // Sem dono: só a Gestão vê, e precisa distribuir.
    { ...base, contactName: "Daniela", email: "dani@exemplo.com", phone: "85966663333", instagram: "danimodas", cnpj: "34028316000103", sellerId: null },
  ];

  for (const l of leads) {
    await prisma.wholesaleLead.create({ data: l });
  }
  console.log(`Semeados ${leads.length} leads para ${vendedora.name}.`);
}

main().finally(() => prisma.$disconnect());
```

- [ ] **Step 2: Rode**

Run: `npx tsx scripts/seed-wholesale-leads.ts`
Expected: `Semeados 6 leads para <nome>.` Se o Postgres local recusar credenciais (comportamento conhecido), registre isso e siga — a tela será conferida no ambiente onde o banco responde.

- [ ] **Step 3: Commit**

```bash
git add scripts/seed-wholesale-leads.ts
git commit -m "Atacado: semeadura de candidaturas para desenvolver a ferramenta"
```

---

### Task 9: Página Análise de Clientes

**Files:**
- Create: `src/app/(dashboard)/vendas/analise-clientes/page.tsx`
- Create: `src/app/(dashboard)/vendas/analise-clientes/lead-row-actions.tsx`

**Interfaces:**
- Consumes: `listLeadsFor`, `findDuplicateAlerts` (Tarefa 7); `canUseWholesaleTool` (Tarefa 4); `REJECTION_CODES`, `findRejectionCode` (Tarefa 1); `formatCnpj` (Tarefa 5).
- Produces: a rota `/vendas/analise-clientes`.

- [ ] **Step 1: Escreva a página (Server Component)**

Siga o layout de `src/app/(dashboard)/vendas/page.tsx`: `requireRole`, tabela com `border-r border-border` entre colunas, `font-data` em números, `Card`/`CardHeader`/`CardContent`, paginação preservando filtros.

Pontos obrigatórios:

```tsx
const session = await requireRole(["VENDAS", "GESTAO"]);
const user = await prisma.user.findUnique({
  where: { id: session.userId },
  select: { id: true, role: true, salesModel: true },
});
const actor = { userId: user!.id, role: user!.role, salesModel: user!.salesModel };

// Vendedora de VAREJO chega aqui pela URL: requireRole liberou o papel, não o
// escopo. A ferramenta é de ATACADO (decisão 15).
if (!canUseWholesaleTool(actor)) {
  return (
    <Card>
      <CardContent className="py-10 text-center text-muted-foreground">
        A Análise de Clientes é da equipe de Atacado.
      </CardContent>
    </Card>
  );
}
```

Colunas: Recebido (data, `font-data`), Nome, Cidade/UF, Instagram, CNPJ (`formatCnpj`, `font-data`), Status (chip colorido), Auxiliar (maiúsculas), Vendedora (só para `GESTAO`), Ações.

Cores de status, usando os tokens que já existem: `APROVADO` em verde `motorista`, `REPROVADO` em `destructive`, `CUIDADO` em `distribuicao` (âmbar), `EM_ANALISE` em `secondary`. Título em `text-vendas`, como as outras telas de Vendas.

Para `GESTAO`, uma seção acima da tabela com os leads `sellerId: null` e o seletor de distribuição.

- [ ] **Step 2: Rode o build e veja a tela**

Run: `npx next build`
Expected: compila sem erro.

Run: `npm run dev` e abra `/vendas/analise-clientes` com um usuário `VENDAS`+`ATACADO`.
Expected: os 6 leads semeados aparecem; o lead sem dono **não** aparece para ela.

Entre com `GESTAO`: aparecem os 6 mais a seção de distribuição.

Entre com `VENDAS`+`VAREJO`: aparece a mensagem, não a tabela.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(dashboard)/vendas/analise-clientes"
git commit -m "Analise de Clientes: lista com escopo por perfil e fila da Gestao"
```

---

### Task 10: Modal de decisão

**Files:**
- Create: `src/app/(dashboard)/vendas/analise-clientes/decision-modal.tsx`
- Modify: `src/app/(dashboard)/vendas/analise-clientes/lead-row-actions.tsx`

**Interfaces:**
- Consumes: `decideLead`, `setAssistantName` (Tarefa 6); `rejectionCodesByCategory` (Tarefa 1); `DuplicateAlert` (Tarefa 7).
- Produces: componente `DecisionModal`.

O modal é a aba 6 da planilha: as 18 respostas com origem "Formulário", mais Atendente, Status, Motivo de reprovação e Auxiliar Responsável.

- [ ] **Step 1: Escreva o componente**

Use `Dialog` de `@radix-ui/react-dialog` pelo wrapper em `src/components/ui/dialog.tsx`, no padrão dos modais que já existem no projeto.

Comportamentos obrigatórios:

```tsx
// Dropdown de motivo APARECE SÓ em REPROVADO (planilha, aba 6), agrupado por
// categoria na ordem da planilha.
{status === "REPROVADO" && (
  <select>
    {rejectionCodesByCategory().map((g) => (
      <optgroup key={g.category} label={g.category}>
        {g.codes.map((c) => (
          <option key={c.code} value={c.code}>{c.code} — {c.label}</option>
        ))}
      </optgroup>
    ))}
  </select>
)}

// CUIDADO abre o campo de justificativa, obrigatório (decisão 8). O servidor
// recusa de todo modo; aqui é só para a pessoa não perder a viagem.
{status === "CUIDADO" && (
  <textarea required value={cautionReason} onChange={...} />
)}
```

O critério do código escolhido aparece abaixo do dropdown (`findRejectionCode(code)?.criteria`) — é o texto que ajuda a decidir, e esconder não economiza nada.

Aviso de cadastro repetido no topo do modal, quando houver: fundo `destructive/10`, ícone `AlertTriangle`, e para cada alerta o nome, o status, o que casou (CNPJ, telefone ou ambos), a data, e **a justificativa do CUIDADO ou o rótulo do código de reprovação**. É esse texto que faz o aviso valer.

As duas imagens aparecem como miniaturas clicáveis apontando para `/api/uploads/...`.

- [ ] **Step 2: Confira os quatro caminhos à mão**

Run: `npm run dev`

1. Reprovar sem escolher motivo → botão bloqueado; forçando o envio, o servidor responde "Escolha o motivo da reprovação."
2. Marcar Cuidado sem texto → mesma coisa, com "Descreva o motivo do alerta."
3. Reprovar o lead "Ana" → abrir o lead "Ana Maria" (mesmo CNPJ) e ver o aviso com o código 34.
4. Abrir "Bruna Lima" → ver o aviso vindo de "Bruna", casado por **telefone** apesar do nono dígito diferente.
5. Aprovar um lead já reprovado → o motivo desaparece da tela (não fica resto).

- [ ] **Step 3: Commit**

```bash
git add "src/app/(dashboard)/vendas/analise-clientes"
git commit -m "Analise de Clientes: modal de decisao com aviso de cadastro repetido"
```

---

### Task 11: Botão de copiar link em Vendas

**Files:**
- Modify: `src/app/(dashboard)/vendas/page.tsx` (cabeçalho de botões, ~linha 73)
- Create: `src/app/(dashboard)/vendas/copiar-link-atacado.tsx`
- Create: `src/lib/actions/wholesale-referral.ts`

**Interfaces:**
- Consumes: `generateReferralCode`, `buildReferralLink` (Tarefa 3).
- Produces: `ensureMyReferralLink(brand: "OKEY" | "LOV_CLUB"): Promise<ActionResult<{ link: string }>>`.

- [ ] **Step 1: Escreva a action**

```ts
"use server";

import { prisma } from "@/lib/prisma";
import { requireRoleAction } from "@/lib/auth";
import { actionOk, actionError, type ActionResult } from "@/types/action";
import { generateReferralCode, buildReferralLink } from "@/lib/wholesale-referral";

/**
 * Devolve o link de indicação da vendedora, criando o código na primeira vez.
 *
 * Criar sob demanda (em vez de na criação do usuário) evita uma migration de
 * backfill e dá código só a quem de fato usa a ferramenta.
 */
export async function ensureMyReferralLink(
  brand: "OKEY" | "LOV_CLUB",
): Promise<ActionResult<{ link: string }>> {
  const session = await requireRoleAction(["VENDAS"]);
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, salesModel: true, active: true, referralCode: true },
  });
  if (!user || !user.active || user.salesModel !== "ATACADO") {
    return actionError("O link de indicação é da equipe de Atacado.");
  }

  const base = process.env.APP_BASE_URL;
  // Falhar aqui é melhor que entregar link quebrado (decisão 35): o erro de
  // um Host inferido só apareceria no celular da lojista.
  if (!base) return actionError("APP_BASE_URL não configurada no servidor.");

  let code = user.referralCode;
  if (!code) {
    // Colisão é astronomicamente improvável, mas @unique a recusaria na
    // gravação; três tentativas custam nada e removem o caso.
    for (let i = 0; i < 3 && !code; i++) {
      const candidato = generateReferralCode();
      try {
        await prisma.user.update({
          where: { id: user.id },
          data: { referralCode: candidato },
        });
        code = candidato;
      } catch {
        code = null;
      }
    }
    if (!code) return actionError("Não foi possível gerar o link. Tente novamente.");
  }

  return actionOk({ link: buildReferralLink(base, brand, code) });
}
```

- [ ] **Step 2: Escreva o botão (Client Component)**

Botão `variant="outline"` com ícone `Link2` de `lucide-react`, chamando a action, copiando com `navigator.clipboard.writeText` e trocando o rótulo para "Link copiado" por 2 segundos. Em erro, mostra a mensagem da action.

- [ ] **Step 3: Ligue na página de Vendas**

Em `src/app/(dashboard)/vendas/page.tsx`, no `<div className="flex gap-2">` do cabeçalho, antes do botão "Novo select":

```tsx
{/* Captação de revendedor: só a equipe de Atacado (decisão 15). O botão
    some para VAREJO; a action confere de novo no servidor. */}
{session.role === "VENDAS" && vendedoraAtacado && (
  <CopiarLinkAtacado />
)}
{podeAnalisar && (
  <Button asChild variant="outline">
    <Link href="/vendas/analise-clientes"><ClipboardCheck className="h-4 w-4" /> Análise de Clientes</Link>
  </Button>
)}
```

`vendedoraAtacado` e `podeAnalisar` vêm de uma consulta ao `salesModel` do usuário da sessão, feita no topo da página junto das que já existem.

- [ ] **Step 4: Confira à mão**

Run: `npx next build` e `npm run dev`

1. Com `VENDAS`+`ATACADO`: os dois botões aparecem; copiar entrega
   `<base>/atacado/okey?r=<10 caracteres>`.
2. Com `VENDAS`+`VAREJO`: nenhum dos dois aparece.
3. Com `GESTAO`: "Análise de Clientes" aparece, "Copiar link" não (Gestão não é destino de indicação).
4. Clicar duas vezes: o mesmo código volta — não gera um novo.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(dashboard)/vendas/page.tsx" "src/app/(dashboard)/vendas/copiar-link-atacado.tsx" src/lib/actions/wholesale-referral.ts
git commit -m "Vendas: link de indicacao de atacado e atalho para a Analise de Clientes"
```

---

## FATIA 3 — Landing page OKEY

### Task 12: Prova de escopo de tokens

**Files:**
- Create: `src/app/atacado/layout.tsx`
- Create: `src/app/atacado/okey/page.tsx` (provisória, feia)
- Create: `src/app/atacado/atacado.css`
- Modify: `src/middleware.ts` (`PUBLIC_PATHS`, ~linha 17)

**Interfaces:**
- Consumes: nada.
- Produces: a rota pública `/atacado/okey`, isolada do mundo visual do dashboard.

> **Esta tarefa é deliberadamente feia e vem primeiro** (decisão 30 e crítica 6 do design). O root layout força `.dark` no `<html>` antes da hidratação e declara `themeColor: #29A0D9`. Se o isolamento não funcionar, descobrir isso agora custa uma tarefa; descobrir depois de a LP estar composta custa a LP.

- [ ] **Step 1: Libere a rota no middleware**

Em `src/middleware.ts`, acrescente `"/atacado"` a `PUBLIC_PATHS`, com comentário no padrão dos que já estão lá:

```ts
// /atacado e a LP PUBLICA de captacao de revendedor (link que a vendedora
// compartilha). Nao usa sessao: e pagina de marca, aberta por quem ainda nao
// e cliente. UM unico segmento serve as duas marcas (/atacado/okey e
// /atacado/lov-club) — por isso a marca nao fica no primeiro nivel.
const PUBLIC_PATHS = ["/login", "/api/health", "/acompanhar", "/api/integracao", "/api/cron", "/atacado"];
```

O casamento existente (`pathname === p || pathname.startsWith(p + "/")`) já evita liberar `/atacadox`.

- [ ] **Step 2: Escreva o CSS escopado**

`src/app/atacado/atacado.css`:

```css
/* Mundo visual das LPs de atacado, escopado em [data-world].
   globals.css NÃO muda (decisão 30): mexer nos tokens globais poria o
   dashboard inteiro em risco por causa de uma landing page. */

[data-world="atacado"] {
  /* Placeholder berrante de propósito: esta tarefa prova o isolamento, não
     desenha a marca. Se estas cores aparecerem, o escopo funciona; se o azul
     do Build.Flow aparecer, não funciona. A Tarefa 16 as substitui. */
  --background: 20 60% 90%;
  --foreground: 20 80% 10%;
  --card: 0 0% 100%;
  --card-foreground: 20 80% 10%;
  --primary: 320 70% 45%;
  --primary-foreground: 0 0% 100%;
  --border: 20 30% 75%;
  --radius: 0.25rem;

  background-color: hsl(var(--background));
  color: hsl(var(--foreground));
  min-height: 100vh;
}
```

- [ ] **Step 3: Escreva o layout do grupo**

`src/app/atacado/layout.tsx`:

```tsx
import "./atacado.css";

/**
 * Layout das LPs públicas de atacado.
 *
 * O root layout é compartilhado e não dá para substituir: ele define <html> e
 * <body>, importa globals.css e roda um script que adiciona `.dark` ao
 * documento ANTES da hidratação. Então o isolamento aqui é por escopo, não por
 * substituição: `data-world="atacado"` redefine os mesmos nomes de token, e
 * `[&_*]:!border-border` não é necessário porque os tokens já mudaram.
 *
 * `light` força o esquema claro deste ramo sem tocar na classe do <html>, que
 * pertence ao dashboard.
 */
export default function AtacadoLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-world="atacado" className="light">
      {children}
    </div>
  );
}
```

- [ ] **Step 4: Escreva a página de prova**

`src/app/atacado/okey/page.tsx`:

```tsx
import type { Metadata } from "next";

// noindex na Fase 1 (decisão 28): o funil é por indicação, e tráfego orgânico
// só produziria leads sem dono. themeColor próprio sobrescreve o azul do
// Build.Flow declarado no root layout (decisão 30).
export const metadata: Metadata = {
  title: "Seja revendedora | OKEY",
  robots: { index: false, follow: false },
  themeColor: "#ffffff",
};

export default function ProvaDeEscopo() {
  return (
    <main className="mx-auto max-w-2xl space-y-4 p-6">
      <h1 className="text-3xl font-bold">Prova de escopo de tokens</h1>
      <p>
        Se esta página estiver bege com título rosa, o escopo funciona. Se
        estiver azul-escuro como o dashboard, não funciona.
      </p>
      <div className="rounded-md border bg-card p-4 text-card-foreground">
        Card usando os tokens escopados.
      </div>
      <button className="rounded-md bg-primary px-4 py-2 text-primary-foreground">
        Botão primário
      </button>
    </main>
  );
}
```

- [ ] **Step 5: Prove o isolamento nos dois sentidos**

Run: `npx next build && npm run dev`

1. Abra `/atacado/okey` **sem sessão**, numa janela anônima.
   Expected: a página carrega (não redireciona para `/login`), aparece **bege com título rosa**, e a barra do navegador não é azul.
2. Abra `/dashboard` com sessão, no tema escuro.
   Expected: **nada mudou** — fundo `#11151F`, azul da marca, tudo como era.
3. Alterne o tema do dashboard para claro e volte a `/atacado/okey`.
   Expected: a LP continua bege. O tema do dashboard não a atinge.

Se qualquer um dos três falhar, **pare e resolva aqui**. É mais barato que descobrir na Tarefa 16.

- [ ] **Step 6: Commit**

```bash
git add src/app/atacado src/middleware.ts
git commit -m "LP Atacado: rota publica isolada do mundo visual do dashboard"
```

---

### Task 13: Conteúdo da LP por marca

**Files:**
- Create: `src/lib/wholesale-content.ts`
- Test: `scripts/checks/wholesale-content.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `WHOLESALE_CONTENT: Record<"OKEY" | "LOV_CLUB", BrandContent>`, `interface BrandContent { brandName: string; reasons: {title: string; subtitle: string}[]; advantages: {title: string; subtitle: string; body: string}[]; faq: {group: string; items: {q: string; a: string}[]}[] }`, `getBrandContent(slug: string): { brand: "OKEY" | "LOV_CLUB"; content: BrandContent } | null`.

- [ ] **Step 1: Escreva a checagem que falha**

```ts
// Checagem do conteúdo institucional das LPs de atacado.
// Rodar com: npx tsx scripts/checks/wholesale-content.ts
//
// O que está em jogo: este texto é copy aprovada pela marca, transcrita da
// planilha. Contagem errada significa bloco perdido na montagem; texto
// reescrito significa promessa comercial inventada numa página pública.
import { WHOLESALE_CONTENT, getBrandContent } from "../../src/lib/wholesale-content";

let falhas = 0;
function check(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) {
    falhas++;
    console.log(`FALHOU ${nome}\n  esperado=${JSON.stringify(esperado)}\n  obtido  =${JSON.stringify(obtido)}`);
  }
}

const okey = WHOLESALE_CONTENT.OKEY;
check("3 motivos", okey.reasons.length, 3);
check("6 vantagens", okey.advantages.length, 6);
check("4 grupos de FAQ", okey.faq.length, 4);
check("8 perguntas no total", okey.faq.reduce((n, g) => n + g.items.length, 0), 8);
check(
  "motivo 2 literal da planilha",
  okey.reasons[1],
  { title: "Diferencial Qualitativo", subtitle: "Atemporalidade e padrão alta-costura" },
);
check(
  "vantagem 5 tem o texto da planilha",
  okey.advantages[4].body.startsWith("Proporcione ao seu negócio margens de lucro atrativas"),
  true,
);
check(
  "a margem de até 100% está no FAQ, como escrito",
  okey.faq[2].items[0].a.includes("margem de lucro de até 100%"),
  true,
);
// Nenhuma vantagem com corpo vazio: a montagem renderiza seis cartões.
check("nenhuma vantagem sem corpo", okey.advantages.filter((a) => !a.body).length, 0);

check("slug okey resolve", getBrandContent("okey")?.brand, "OKEY");
check("slug lov-club resolve", getBrandContent("lov-club")?.brand, "LOV_CLUB");
check("slug desconhecido devolve null", getBrandContent("nike"), null);
// O conteúdo é compartilhado entre as marcas: a planilha diz "(marca)" e
// "nossa marca", nunca OKEY. Só o nome exibido difere.
check(
  "Lov Club tem os mesmos 6 blocos de vantagem",
  WHOLESALE_CONTENT.LOV_CLUB.advantages.length,
  6,
);

if (falhas > 0) {
  console.log(`\n${falhas} checagem(ns) falharam.`);
  process.exit(1);
}
console.log("wholesale-content: todas as checagens passaram.");
```

- [ ] **Step 2: Rode para ver falhar**

Run: `npx tsx scripts/checks/wholesale-content.ts`
Expected: FALHA — módulo não encontrado.

- [ ] **Step 3: Implemente o módulo**

Transcreva **literalmente** os anexos A.2, A.3 e A.4 da spec. Os blocos são compartilhados entre as marcas (a planilha nunca diz "OKEY"), então defina uma vez e reutilize:

```ts
/**
 * Copy institucional das LPs de atacado, transcrita da planilha
 * "Database - LP Atacado (OKEY & Lov Club)" e do anexo A da spec.
 *
 * COMPARTILHADO ENTRE AS MARCAS de propósito: as abas se chamam "Por que
 * revender (marca)" e o texto diz "nossa marca", nunca OKEY. Só a identidade
 * visual e o nome exibido diferem — é isso que faz a Fase 2 ser uma LP e um
 * valor, não uma migration (decisão 3).
 *
 * NÃO REESCREVA ESTE TEXTO. São promessas comerciais (margem de até 100%,
 * exclusividade territorial, tecidos da Linha Italiana Premium) numa página
 * pública. Mudança de texto é decisão da marca, não de implementação.
 */

const REASONS = [
  { title: "Altamente Lucrativo", subtitle: "Sua loja com mais rentabilidade" },
  { title: "Diferencial Qualitativo", subtitle: "Atemporalidade e padrão alta-costura" },
  { title: "Design Autoral e Genuíno", subtitle: "Identidade única para o seu ponto de venda" },
] as const;

const ADVANTAGES = [
  {
    title: "Suporte Exclusivo",
    subtitle: "Acompanhamento personalizado para o seu negócio",
    body: "Oferecemos suporte completo na representação da marca. Nossos catálogos contam com especificações detalhadas de cada peça, e você dispõe do atendimento dedicado de uma consultora exclusiva para auxiliar suas escolhas e otimizar seus resultados.",
  },
  // ... as outras cinco, do anexo A.3 da spec, na ordem ...
] as const;

const FAQ = [
  {
    group: "Pedido e Condições de Compra",
    items: [
      {
        q: "Qual é o valor ou a quantidade mínima para o primeiro pedido?",
        a: "Trabalhamos com condições acessíveis para que você possa introduzir a marca em seu ponto de venda com tranquilidade.",
      },
      // ... a segunda pergunta do grupo ...
    ],
  },
  // ... os outros três grupos, do anexo A.4 ...
] as const;

export interface BrandContent {
  brandName: string;
  reasons: { title: string; subtitle: string }[];
  advantages: { title: string; subtitle: string; body: string }[];
  faq: { group: string; items: { q: string; a: string }[] }[];
}

export const WHOLESALE_CONTENT: Record<"OKEY" | "LOV_CLUB", BrandContent> = {
  OKEY: {
    brandName: "OKEY",
    reasons: [...REASONS],
    advantages: [...ADVANTAGES],
    faq: FAQ.map((g) => ({ group: g.group, items: [...g.items] })),
  },
  LOV_CLUB: {
    brandName: "Lov Club",
    reasons: [...REASONS],
    advantages: [...ADVANTAGES],
    faq: FAQ.map((g) => ({ group: g.group, items: [...g.items] })),
  },
};

export function getBrandContent(
  slug: string,
): { brand: "OKEY" | "LOV_CLUB"; content: BrandContent } | null {
  if (slug === "okey") return { brand: "OKEY", content: WHOLESALE_CONTENT.OKEY };
  if (slug === "lov-club") return { brand: "LOV_CLUB", content: WHOLESALE_CONTENT.LOV_CLUB };
  return null;
}
```

- [ ] **Step 4: Rode até passar**

Run: `npx tsx scripts/checks/wholesale-content.ts`
Expected: todas passaram.

- [ ] **Step 5: Commit**

```bash
git add src/lib/wholesale-content.ts scripts/checks/wholesale-content.ts
git commit -m "LP Atacado: copy institucional transcrita da planilha, conferida"
```

---

### Task 14: Server Action pública de submissão

**Files:**
- Create: `src/lib/actions/wholesale-apply.ts`
- Create: `src/lib/wholesale-apply-validation.ts`
- Test: `scripts/checks/wholesale-apply-validation.ts`

**Interfaces:**
- Consumes: `resolveReferral` (Tarefa 3); `isValidCnpj`, `normalizeCnpj` (Tarefa 5); `validateUploadDataUrl`, `processAndSaveImage`, `MAX_UPLOAD_MB` de `@/lib/image`; `checkRate` de `@/lib/rate-limit`; `getClientIp` de `@/lib/request-ip`; `normalizePhone`, `isValidPhone` de `@/lib/phone`.
- Produces: `submitWholesaleApplication(input: ApplyInput): Promise<ActionResult<void>>`, `validateApplyPayload(campos: Record<string, string>): { error: string } | { ok: true; clean: CleanApply }`, `UF_LIST: readonly string[]`.

`CleanApply` é **exatamente** o conjunto de escalares que a Tarefa 14 espalha
em `prisma.wholesaleLead.create`. Nome por nome, porque um campo a mais ou a
menos aqui quebra a gravação com erro de tipo do Prisma:

```ts
export interface CleanApply {
  contactName: string;
  email: string;
  phone: string;   // só dígitos
  story: string;
  state: string;   // UF, 2 letras maiúsculas
  city: string;
  serviceModel: "LOJA_FISICA" | "LOJA_ONLINE" | "FISICA_E_ONLINE" | "OUTRO";
  serviceModelOther: string | null;
  instagram: string; // sem "@"
  storeImageKind: "ESPACO_FISICO" | "LOJA_ONLINE";
  marketTime: string;
  teamSize: string;
  brandsCarried: string;
  foundUs: "INSTAGRAM" | "SITE" | "INDICACAO" | "OUTRO";
  foundUsOther: string | null;
  followTime: string;
  investmentBand: "ATE_3K" | "DE_3_A_5K" | "DE_5_A_10K" | "ACIMA_10K";
  wantsVisit: boolean;
  cnpj: string;    // só dígitos, 14
}
```

Note o que **não** está aqui: `brand`, `sellerId`, `submittedIp` e os dois
caminhos de imagem. Eles não vêm do navegador — a action os resolve.

- [ ] **Step 1: Escreva a checagem que falha**

```ts
// Checagem da validação do formulário público de atacado.
// Rodar com: npx tsx scripts/checks/wholesale-apply-validation.ts
//
// O que está em jogo: é a ÚNICA porta de escrita sem sessão deste sistema.
// Tudo que passa daqui vira linha no banco e arquivo no disco. Campo
// obrigatório que escapa produz cadastro incompleto para a analista; "Outro"
// sem texto produz resposta que não informa nada.
import { validateApplyPayload, UF_LIST } from "../../src/lib/wholesale-apply-validation";

let falhas = 0;
function check(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) {
    falhas++;
    console.log(`FALHOU ${nome}\n  esperado=${JSON.stringify(esperado)}\n  obtido  =${JSON.stringify(obtido)}`);
  }
}

const valido = {
  contactName: "Ana Souza",
  email: "ana@exemplo.com",
  phone: "(85) 98888-7777",
  story: "Trabalho com moda há três anos.",
  state: "CE",
  city: "Fortaleza",
  serviceModel: "LOJA_FISICA",
  serviceModelOther: "",
  instagram: "@lojadaana",
  marketTime: "3 anos",
  teamSize: "2",
  brandsCarried: "Marcas regionais",
  foundUs: "INSTAGRAM",
  foundUsOther: "",
  followTime: "6 meses",
  investmentBand: "DE_3_A_5K",
  wantsVisit: "sim",
  cnpj: "11.222.333/0001-81",
};

check("27 UFs", UF_LIST.length, 27);

const ok = validateApplyPayload(valido);
check("payload completo passa", "ok" in ok, true);
if ("ok" in ok) {
  check("telefone normalizado para dígitos", ok.clean.phone, "85988887777");
  check("CNPJ normalizado para dígitos", ok.clean.cnpj, "11222333000181");
  check("arroba removida do Instagram", ok.clean.instagram, "lojadaana");
  check("wantsVisit vira booleano", ok.clean.wantsVisit, true);
  // Loja física pede foto do espaço (decisão 21).
  check("tipo de imagem pedido", ok.clean.storeImageKind, "ESPACO_FISICO");
}

// --- tudo obrigatório (decisão 20) ---
for (const campo of ["contactName", "email", "phone", "story", "city", "marketTime", "teamSize", "brandsCarried", "followTime"]) {
  const r = validateApplyPayload({ ...valido, [campo]: "" });
  check(`campo obrigatório vazio: ${campo}`, "error" in r, true);
}
check("só espaços também é vazio", "error" in validateApplyPayload({ ...valido, city: "   " }), true);

// --- "Outro" exige o texto (decisão 22) ---
check(
  "serviceModel OUTRO sem texto: recusa",
  validateApplyPayload({ ...valido, serviceModel: "OUTRO", serviceModelOther: "" }),
  { error: "Descreva como você atende suas clientes hoje." },
);
check(
  "serviceModel OUTRO com texto: passa",
  "ok" in validateApplyPayload({ ...valido, serviceModel: "OUTRO", serviceModelOther: "Showroom" }),
  true,
);
check(
  "foundUs OUTRO sem texto: recusa",
  validateApplyPayload({ ...valido, foundUs: "OUTRO", foundUsOther: "" }),
  { error: "Conte como você nos encontrou." },
);

// --- decisão 21: loja só online pede print da loja online ---
const online = validateApplyPayload({ ...valido, serviceModel: "LOJA_ONLINE" });
check("loja online pede print da loja online", "ok" in online && online.clean.storeImageKind, "LOJA_ONLINE");
const hibrida = validateApplyPayload({ ...valido, serviceModel: "FISICA_E_ONLINE" });
check("híbrida pede o espaço físico", "ok" in hibrida && hibrida.clean.storeImageKind, "ESPACO_FISICO");
const outro = validateApplyPayload({ ...valido, serviceModel: "OUTRO", serviceModelOther: "Showroom" });
check("OUTRO pede o espaço físico", "ok" in outro && outro.clean.storeImageKind, "ESPACO_FISICO");

// --- campos de valor fechado não aceitam o que o navegador inventar ---
check("UF inexistente: recusa", validateApplyPayload({ ...valido, state: "XX" }), { error: "Escolha o seu estado." });
check("UF minúscula: recusa", validateApplyPayload({ ...valido, state: "ce" }), { error: "Escolha o seu estado." });
check("faixa de investimento inventada: recusa", "error" in validateApplyPayload({ ...valido, investmentBand: "DE_1_A_2K" }), true);
check("serviceModel inventado: recusa", "error" in validateApplyPayload({ ...valido, serviceModel: "FEIRA" }), true);

// --- CNPJ e e-mail ---
check("CNPJ com dígito errado: recusa", validateApplyPayload({ ...valido, cnpj: "11.222.333/0001-82" }), { error: "CNPJ inválido. Confira os números." });
check("e-mail sem arroba: recusa", "error" in validateApplyPayload({ ...valido, email: "ana.exemplo.com" }), true);
check("telefone curto: recusa", "error" in validateApplyPayload({ ...valido, phone: "988" }), true);

// --- tetos de texto: nada de campo livre sem limite numa porta pública ---
check("história gigante: recusa", "error" in validateApplyPayload({ ...valido, story: "x".repeat(5000) }), true);

if (falhas > 0) {
  console.log(`\n${falhas} checagem(ns) falharam.`);
  process.exit(1);
}
console.log("wholesale-apply-validation: todas as checagens passaram.");
```

- [ ] **Step 2: Rode para ver falhar**

Run: `npx tsx scripts/checks/wholesale-apply-validation.ts`
Expected: FALHA — módulo não encontrado.

- [ ] **Step 3: Implemente a validação pura**

`src/lib/wholesale-apply-validation.ts`. Pontos obrigatórios: `UF_LIST` com as 27 siglas; todo campo de texto obrigatório e com teto (nome 120, e-mail 160, história 2000, cidade 120, Instagram 60, demais 200); valores fechados conferidos contra lista; `normalizePhone` + `isValidPhone`; `isValidCnpj`; `storeImageKind` derivado de `serviceModel` (`LOJA_ONLINE` → `LOJA_ONLINE`, todo o resto → `ESPACO_FISICO`); mensagens de erro em pt-BR, exatamente como nas checagens acima.

- [ ] **Step 4: Rode até passar**

Run: `npx tsx scripts/checks/wholesale-apply-validation.ts`
Expected: todas passaram.

- [ ] **Step 5: Implemente a Server Action pública**

`src/lib/actions/wholesale-apply.ts`:

```ts
"use server";

import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { actionOk, actionError, type ActionResult } from "@/types/action";
import { getClientIp } from "@/lib/request-ip";
import { checkRate } from "@/lib/rate-limit";
import { validateUploadDataUrl, processAndSaveImage } from "@/lib/image";
import { resolveReferral } from "@/lib/wholesale-referral";
import { validateApplyPayload } from "@/lib/wholesale-apply-validation";

/**
 * A ÚNICA escrita sem sessão deste sistema.
 *
 * Não há `requireRoleAction` aqui, de propósito: quem preenche ainda não é
 * cliente. Em troca, tudo que normalmente a sessão garantiria tem de ser
 * garantido à mão — contenção por IP, formato de arquivo pela assinatura e
 * não pelo MIME declarado, e nenhum campo gravado como veio.
 *
 * MENSAGEM GENÉRICA em qualquer recusa de contenção: dizer qual das três
 * falhou (IP, honeypot, tempo) ensina a contorná-la.
 */

const GENERICO = "Não foi possível enviar agora. Tente novamente em alguns minutos.";
const MIN_FILL_MS = 5_000;

export interface ApplyInput {
  brandSlug: string;
  referralCode?: string | null;
  campos: Record<string, string>;
  instagramImage: string; // data-URL
  storeImage: string; // data-URL
  honeypot: string;
  openedAt: number;
}

export async function submitWholesaleApplication(
  input: ApplyInput,
): Promise<ActionResult<void>> {
  // 1. Contenção, antes de qualquer trabalho caro (decisão 27).
  if (input.honeypot) return actionError(GENERICO);
  if (!input.openedAt || Date.now() - input.openedAt < MIN_FILL_MS) {
    return actionError(GENERICO);
  }
  const ip = getClientIp();
  const rate = checkRate(`atacado:${ip}`, { max: 5, windowMs: 60 * 60 * 1000 });
  if (!rate.allowed) return actionError(GENERICO);

  // 2. Marca pelo caminho, nunca pelo payload.
  const brand =
    input.brandSlug === "okey" ? "OKEY" : input.brandSlug === "lov-club" ? "LOV_CLUB" : null;
  if (!brand) return actionError(GENERICO);

  // 3. Campos.
  const v = validateApplyPayload(input.campos);
  if ("error" in v) return actionError(v.error);

  // 4. Imagens: assinatura manda, MIME declarado não (CVE-2026-96889).
  const insta = Buffer.from((input.instagramImage.split(",")[1] ?? ""), "base64");
  const loja = Buffer.from((input.storeImage.split(",")[1] ?? ""), "base64");
  const erroInsta = validateUploadDataUrl(input.instagramImage, insta);
  if (erroInsta) return actionError(`Imagem do Instagram: ${erroInsta}`);
  const erroLoja = validateUploadDataUrl(input.storeImage, loja);
  if (erroLoja) return actionError(`Foto da loja: ${erroLoja}`);

  // 5. Dono do lead. Elegibilidade conferida AGORA, não quando o link nasceu.
  const candidatos = await prisma.user.findMany({
    where: { role: "VENDAS", salesModel: "ATACADO" },
    select: { id: true, referralCode: true, role: true, salesModel: true, active: true },
  });
  const sellerId = resolveReferral(input.referralCode, candidatos);

  // 6. Grava. As imagens vão para o disco antes da linha, com nome derivado do
  // cuid do lead para não haver colisão entre dois envios simultâneos.
  const id = crypto.randomUUID();
  const imgInsta = await processAndSaveImage(insta, {
    folder: "atacado",
    fileName: `${id}-instagram`,
  });
  const imgLoja = await processAndSaveImage(loja, {
    folder: "atacado",
    fileName: `${id}-loja`,
  });

  await prisma.wholesaleLead.create({
    data: {
      brand,
      sellerId,
      ...v.clean,
      instagramImagePath: imgInsta.filePath,
      storeImagePath: imgLoja.filePath,
      submittedIp: ip,
    },
  });

  return actionOk(undefined);
}
```

- [ ] **Step 6: Confira a compilação e o caminho de erro**

Run: `npx tsc --noEmit`
Expected: sem erros. Confira a assinatura real de `checkRate` em `src/lib/rate-limit.ts` (linha 44) e ajuste a forma do retorno se não for `{ allowed }`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/actions/wholesale-apply.ts src/lib/wholesale-apply-validation.ts scripts/checks/wholesale-apply-validation.ts
git commit -m "LP Atacado: submissao publica com contencao, assinatura de imagem e dono resolvido"
```

---

### Task 15: Formulário da LP

**Files:**
- Create: `src/app/atacado/[marca]/apply-form.tsx`
- Create: `src/app/atacado/[marca]/page.tsx`
- Delete: `src/app/atacado/okey/page.tsx` (a prova da Tarefa 12 cumpriu o papel)

**Interfaces:**
- Consumes: `submitWholesaleApplication` (Tarefa 14); `UF_LIST` (Tarefa 14); `getBrandContent` (Tarefa 13); `shrinkImageToBase64` de `@/lib/client-image`.
- Produces: a rota `/atacado/[marca]` servindo `okey` e `lov-club`.

- [ ] **Step 1: Troque a rota fixa pela dinâmica**

**Apague `src/app/atacado/okey/page.tsx` primeiro.** Em Next, um segmento estático ganha do dinâmico, então deixar os dois faria `/atacado/okey` continuar servindo a página de prova — e o defeito apareceria como "a LP não mudou", que é a pista mais enganosa possível.

Depois crie `src/app/atacado/[marca]/page.tsx`: resolve a marca por `getBrandContent(params.marca)` e chama `notFound()` para slug desconhecido. `generateStaticParams` devolve `okey` e `lov-club`. `metadata` por marca, mantendo `robots: { index: false }`.

- [ ] **Step 2: Escreva o formulário**

Client Component. Pontos obrigatórios:

```tsx
// O rótulo do segundo upload MUDA com a resposta da pergunta 7 (decisão 21).
// Loja só online não tem espaço físico para fotografar; o campo continua
// obrigatório, muda o que se pede.
const pedeEspacoFisico = serviceModel !== "LOJA_ONLINE";
const rotuloLoja = pedeEspacoFisico
  ? "Compartilhe conosco uma foto do seu espaço físico:"
  : "Compartilhe conosco um print da sua loja online:";
```

```tsx
// Review Focus 5: HEIC de iPhone.
// client-image.ts aceita image/heic, mas nem todo navegador decodifica HEIC em
// canvas — e aí a compressão falha. Com TUDO obrigatório (decisão 20), isso
// trancaria a lojista no fim do formulário sem saída. Então a falha é tratada
// e dita em voz alta, com o caminho de contorno.
const r = await shrinkImageToBase64(file, { maxDimension: 1600 });
if (r.error) {
  setErroImagem(
    "Não conseguimos ler esta imagem. Se ela veio do iPhone, abra a foto, " +
    "toque em Editar, salve e envie novamente — ou tire um print dela.",
  );
  return;
}
```

Honeypot: `<input name="confirmacao" tabIndex={-1} aria-hidden className="absolute left-[-9999px]" />`. `openedAt` fixado num `useRef(Date.now())` na montagem.

Campos em 4 `<fieldset>` com os títulos da planilha. UF como `<select>` com `UF_LIST`. As quatro perguntas de alternativa como grupos de `<label>`+`radio` (não `<select>`: no celular, radio mostra as opções sem abrir painel). "Outro" revela o campo de texto e o marca obrigatório.

Botão de envio desabilitado durante o envio, com rótulo "Enviando…". Em sucesso, troca o formulário inteiro por uma confirmação — sem prometer prazo, porque não há canal de resposta (decisão 7).

- [ ] **Step 3: Confira no celular de verdade**

Run: `npm run dev` e abra pelo IP da máquina num celular.

1. Enviar com qualquer campo vazio → a validação do navegador aponta o campo; forçando, o servidor devolve a mensagem da Tarefa 14.
2. Escolher "Loja online" → o rótulo do segundo upload muda para print da loja online.
3. Escolher "Outro" em como atende → o campo de texto aparece e é exigido.
4. Enviar foto grande do celular → sobe (a compressão no navegador funcionou).
5. **Enviar uma foto HEIC de iPhone** → sobe, ou aparece a mensagem com o contorno. Nunca falha calada.
6. Enviar duas vezes seguidas em menos de 5s → mensagem genérica.
7. Enviar com link sem `?r=` → cadastro entra; confira na Análise de Clientes que caiu **sem dono** e aparece só para a Gestão.
8. Enviar com `?r=<código da vendedora>` → cai na fila dela.

- [ ] **Step 4: Confira o build**

Run: `npx next build`
Expected: compila. `/atacado/okey` e `/atacado/lov-club` aparecem na lista de rotas.

- [ ] **Step 5: Commit**

```bash
git add src/app/atacado
git rm "src/app/atacado/okey/page.tsx"
git commit -m "LP Atacado: formulario de 18 campos com upload tratado e marca por rota"
```

---

### Task 16: Mundo visual e seções institucionais da OKEY

**Files:**
- Modify: `src/app/atacado/atacado.css`
- Modify: `src/app/atacado/[marca]/page.tsx`
- Create: `src/app/atacado/[marca]/sections.tsx`

**Interfaces:**
- Consumes: `WHOLESALE_CONTENT` (Tarefa 13).
- Produces: a LP composta.

> **Antes de começar esta tarefa:** peça ao usuário as referências visuais da OKEY — print do site, do Instagram, catálogo (decisão 31). O site deu tom, categoria e a tagline "Atemporalidade e Arte em Cada Detalhe"; não deu paleta nem tipografia. **Não invente a identidade da marca.** Se as referências não vierem, pare e diga que parou — construir e refazer custa a LP inteira.

- [ ] **Step 1: Carregue a skill de design**

Invoque a skill `impeccable` com `new-work` para esta superfície: é modo **Persuade**, mundo visual novo, e `PRODUCT.md` já existe. Para o acabamento no celular, `mobile-native`.

- [ ] **Step 2: Substitua os tokens-placeholder**

Troque o bege-e-rosa da Tarefa 12 pelos tokens da marca, mantendo **os mesmos nomes** — é o que preserva o isolamento provado. Carregue a tipografia da marca aqui, escopada, sem tocar em `globals.css`.

- [ ] **Step 3: Monte as seções, na ordem da planilha**

Herói → **Por que revender** (3 motivos) → **Por que escolher** (6 vantagens) → formulário → **FAQ** (4 grupos, 8 perguntas). A ordem é a da planilha, que a especificação chamou de "dispostas sequencialmente conforme otimização de UX".

FAQ em `<details>`/`<summary>` nativos: acordeão acessível sem JavaScript, e a página pública fica leve.

- [ ] **Step 4: Prove outra vez o isolamento, agora com a LP pronta**

1. `/atacado/okey` sem sessão → identidade da OKEY, nada do azul do Build.Flow.
2. `/dashboard` no tema escuro → **intacto**.
3. `/dashboard` no tema claro → intacto.
4. Largura de 360px → sem rolagem horizontal, com 16px de respiro lateral.

- [ ] **Step 5: Rode a verificação completa da feature**

```bash
npx tsc --noEmit
npx next build
for f in wholesale-rejection-codes wholesale-referral wholesale-permissions wholesale-identity wholesale-decision-flow wholesale-duplicate-alert wholesale-content wholesale-apply-validation; do
  npx tsx "scripts/checks/$f.ts" || echo "FALHOU: $f"
done
```

Expected: tudo passa, nenhuma linha "FALHOU".

- [ ] **Step 6: Commit**

```bash
git add src/app/atacado
git commit -m "LP Atacado OKEY: mundo visual da marca e as secoes institucionais"
```

---

## Encerramento

- [ ] Rode a auditoria de segurança na porta pública nova: skill `security-audit` em `src/lib/actions/wholesale-apply.ts` e `src/app/atacado`.
- [ ] Invoque `superpowers:verification-before-completion` antes de declarar pronto.
- [ ] Invoque `superpowers:requesting-code-review` para a revisão da branch.
- [ ] Acrescente ao `PRODUCT.md`, em **Operating Context** e **Brand Commitments**, o fato de a operação ter marcas (OKEY e Lov Club) e de a captação de revendedor acontecer por LP pública com link por vendedora. Foi descoberto nesta conversa e ainda não está lá.
- [ ] Confirme com o usuário se `APP_BASE_URL` está configurada no EasyPanel antes do deploy — sem ela o botão de copiar link devolve erro em vez de link quebrado, que é o comportamento desejado, mas ninguém consegue usar a feature.
