# Acompanhamento em Kanban — Plano de Implementação

> **Para executores:** SUB-SKILL OBRIGATÓRIA: use `superpowers:subagent-driven-development` (recomendada) ou `superpowers:executing-plans` para implementar tarefa por tarefa. Os passos usam `- [ ]` para acompanhamento.

**Objetivo:** Comercial > Acompanhamento (One-on-One e Quinzenal) passa a operar como quadro Kanban pelos cinco Status de Evolução, com o formulário em modal, cronômetro por card e histórico de movimentação.

**Arquitetura:** Uma única tabela nova, `FollowUpMovement`, serve às DUAS exigências ao mesmo tempo — ela é o histórico de movimentação (de/para, quem moveu, quando) e é também onde o tempo decorrido em cada status fica gravado (`elapsedMs`). O estado "contando agora" é um só campo em `FollowUp` (`timerStartedAt`, nulo = parado). Com isso, "tempo no status X" = soma de `elapsedMs` das linhas cujo `fromStatus` é X, e o retorno a um status anterior acumula sozinho, sem coluna de acumulador, sem JSON e sem segunda tabela. O quadro é um componente PRÓPRIO, modelado no do Relatório Semanal: o projeto já tem três quadros distintos (pedidos, tarefas de marketing, controle de peças) e nenhuma abstração genérica entre eles — generalizar três quadros é obra maior e mais arriscada que a tarefa pedida.

**Pilha:** Next.js (App Router, Server Components + Server Actions), Prisma/Postgres, Zod, Tailwind, lucide-react. Sem dependência nova.

**Especificação:** a mensagem do dono de 27/11/2026, "Especificação de Alteração — Comercial > Acompanhamento > One-on-one e Quinzenal", reproduzida em §0 abaixo.

## 0. A especificação, literal

1. A tela passa a operar em Kanban, com os Status de Evolução como colunas.
2. Mesma proposta de design do Kanban do Relatório Semanal, **incluindo os KPIs**, porém **sem** "Tarefas por status" e **sem** "Categorias × Status".
3. O formulário sai da tela; um botão ("Novo registro") abre um modal com ele.
4. Cada card tem botão de **iniciar** para o responsável acionar a contagem e permitir calcular a duração de execução.
   - Ao alterar o status, o contador **pausa e registra o tempo decorrido no último status**.
   - Se a atividade **retornar a um status anterior**, a contagem **prossegue do ponto em que parou**.
5. Histórico de movimentação **semelhante ao do Fluxo de Pedidos**, exibindo o usuário responsável pela ação e quem realizou a movimentação.

## Restrições globais

- **Só GESTÃO** (decisão do dono, 13/11/2026, reafirmada em 27/11/2026): toda action continua em `requireRoleAction(["GESTAO"])`. Quem aperta Iniciar é o gestor que conduz o acompanhamento — o colaborador não abre esta tela.
- **A paginação FICA** (decisão do dono, 27/11/2026, contra a recomendação registrada). `POR_PAGINA = 5` continua valendo para os cards do quadro. Consequência obrigatória da escolha: o número no topo da coluna passa a dizer **"n de N"** (n = nesta página, N = no filtro inteiro) e **os KPIs contam o filtro inteiro, nunca a página** — senão as duas leituras mentem. Subir `POR_PAGINA` é uma constante só, se ele mudar de ideia.
- **`status` nulo não é migrado.** Todo registro Quinzenal gravado antes de 17/11/2026 tem `status` nulo. Ele é lido como `NAO_INICIADO` na hora de distribuir nas colunas (`colunaDe`), e nada é escrito no banco. Isso preserva o `OR` de `filtroDeSituacao` e a checagem `followup-situacao.ts`, que existem exatamente por causa desses nulos.
- **Kanban nas DUAS abas.** A especificação nomeia as duas. `status` deixa de ser comentado como "só One-on-One" no esquema.
- **O cronômetro é timestamp do servidor**, não `"HH:MM"`. A armadilha documentada em `followups-client.tsx:101` (`DailyTask.startTime` é hora sem data, e uma tarefa iniciada 23:50 e lida 00:10 dá tempo negativo) não pode ser repetida: um acompanhamento atravessa semanas.
- **`.kanban-scroll` em toda área que rola** (nunca a barra padrão do sistema).
- **`resize-none` em todo `<textarea>`**, e os tetos de `MAX_TEXTO`/`MAX_TOPICO` visíveis no campo.
- **Commits direto em `master`**, sem branch nem PR.
- **Nada é "pronto" sem o navegador**, nos dois temas (Tarefa 8).

## Foco de revisão

Cinco classes de entrada que a especificação implica e que nenhum teste óbvio exerceria. Cada uma recebe seu teste na tarefa que é dona do código.

1. **KPI e contagem de coluna sob paginação** — com 5 cards por página, um KPI ou um contador que conte só a página mente sobre o quadro. Teste na Tarefa 2 (`resumirFollowUps` recebe o conjunto do filtro) e na Tarefa 5 (cabeçalho "n de N").
2. **Registro com `status` nulo** — todo Quinzenal antigo. Tem de aparecer na coluna "Não Iniciado", não desaparecer do quadro nem do total. Teste na Tarefa 2 (`colunaDe(null)`, `resumirFollowUps` com nulo).
3. **Segundo clique em Iniciar, e mover um card já parado** — um clique repetido não pode reiniciar a contagem, duplicar linha de histórico nem gravar `elapsedMs` duas vezes; mover um card com cronômetro parado grava movimento com `elapsedMs` nulo, não zero fingindo medição. Teste na Tarefa 3.
4. **Mover para o mesmo status** — arrasto que termina na própria coluna não grava movimento e não pausa o cronômetro. Teste na Tarefa 3.
5. **Tempo impossível** — `timerStartedAt` no futuro, ou relógio do cliente adiantado, não pode produzir duração negativa; o cálculo gravado é sempre do servidor, com piso em zero. Teste na Tarefa 2 (`tempoTotal`) e na Tarefa 3 (`elapsedMs` calculado no servidor).

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `prisma/schema.prisma` (modificar) | `FollowUpMovement`, `FollowUp.timerStartedAt`, relação |
| `prisma/migrations/20261127_followup_kanban/migration.sql` (criar) | a migração |
| `src/lib/followup-kanban.ts` (criar) | matemática PURA e cores: `colunaDe`, `tempoPorStatus`, `tempoTotal`, `formatarDuracao`, `resumirFollowUps` |
| `scripts/checks/followup-kanban.ts` (criar) | a checagem da matemática acima |
| `src/lib/actions/followups.ts` (modificar) | `moverFollowUp`, `alternarCronometro` |
| `src/components/shared/cronometro.tsx` (criar) | o `Cronometro`, saído de `followups-client.tsx` |
| `src/components/shared/kpi-numero.tsx` (criar) | o quadrinho de KPI, saído do quadro do Relatório Semanal |
| `src/app/(dashboard)/marketing/relatorio-semanal/kanban-board.tsx` (modificar) | passa a importar `KpiNumero` em vez do `Numero` local |
| `src/app/(dashboard)/vendas/acompanhamento/kanban-followups.tsx` (criar) | O QUADRO: colunas, arrasto, teclado, KPIs, card com cronômetro |
| `src/app/(dashboard)/vendas/acompanhamento/followup-form-modal.tsx` (criar) | o formulário de 10 campos, agora dentro de `Modal` |
| `src/app/(dashboard)/vendas/acompanhamento/followup-ficha-modal.tsx` (criar) | a ficha: campos, tempo por status, histórico de movimentação |
| `src/app/(dashboard)/vendas/acompanhamento/followups-client.tsx` (modificar) | encolhe: hospeda o quadro e os dois modais; perde o formulário embutido e a tabela |
| `src/app/(dashboard)/vendas/acompanhamento/page.tsx` (modificar, ~248-358) | consulta movimentos e resumo do filtro inteiro; entrega ao quadro |

---

### Task 1: Esquema e migração

**Arquivos:**
- Modificar: `prisma/schema.prisma` (modelo `FollowUp`, ~1695-1744)
- Criar: `prisma/migrations/20261127_followup_kanban/migration.sql`

**Interfaces:**
- Produz: modelo `FollowUpMovement { id, followUpId, fromStatus: FollowUpStatus?, toStatus: FollowUpStatus, changedById: String?, elapsedMs: Int?, createdAt }`; campo `FollowUp.timerStartedAt DateTime?`; relação `FollowUp.movements FollowUpMovement[]`.

- [ ] **Passo 1: Declarar o modelo e o campo em `prisma/schema.prisma`**

Modelado em `PieceMovement` (~595-610), que é o precedente da casa para trilha de movimentação: `fromStatus` anulável (nulo = primeira entrada no quadro), `toStatus` obrigatório, `changedById` anulável com `onDelete: SetNull` para o histórico sobreviver à saída do gestor da empresa, e dois índices (`[followUpId]`, `[createdAt]`).

`elapsedMs Int?` recebe um comentário `///` dizendo o que ele é: os milissegundos decorridos **no `fromStatus`** até esta movimentação, nulo quando o cronômetro estava parado. É o campo que faz esta tabela responder "tempo por status" sem acumulador.

Remover, no comentário de `status`, a frase que o restringe ao One-on-One; o campo agora vale para os dois tipos.

- [ ] **Passo 2: Gerar a migração**

Rodar: `npx prisma migrate dev --name followup_kanban`
Esperado: migração criada, cliente regerado. **Nada de `UPDATE` nos nulos de `status`** — é só `CREATE TABLE` e dois `ALTER TABLE ADD COLUMN`.

- [ ] **Passo 3: Confirmar que o portão aceita**

Rodar: `npx tsc --noEmit`
Esperado: exit 0.

- [ ] **Passo 4: Commit**

```bash
git add prisma/
git commit -m "O acompanhamento ganha trilha de movimentacao e cronometro no banco"
```

---

### Task 2: A matemática do quadro, pura e checada

**Arquivos:**
- Criar: `src/lib/followup-kanban.ts`
- Criar: `scripts/checks/followup-kanban.ts`

**Interfaces:**
- Consome: `FOLLOWUP_STATUSES`, `FOLLOWUP_STATUS_LABEL` de `src/lib/validations/followup.ts`.
- Produz:
  ```ts
  export type FollowUpStatusValue = (typeof FOLLOWUP_STATUSES)[number];
  export const FOLLOWUP_STATUS_COLOR: Record<FollowUpStatusValue, string>;
  export interface MovementItem {
    id: string;
    fromStatus: FollowUpStatusValue | null;
    toStatus: FollowUpStatusValue;
    changedByName: string | null;
    elapsedMs: number | null;
    createdAt: string;
  }
  export function colunaDe(status: FollowUpStatusValue | null): FollowUpStatusValue;
  export function tempoPorStatus(movs: readonly MovementItem[]): Record<FollowUpStatusValue, number>;
  export function tempoTotal(movs: readonly MovementItem[], timerStartedAt: string | null, agora: number): number;
  export function formatarDuracao(ms: number): string;
  export interface FollowUpSummary {
    total: number; emAndamento: number; precisaRevisao: number;
    emEspera: number; entregues: number; reavaliacaoVencida: number;
  }
  export function resumirFollowUps(
    rows: readonly { status: FollowUpStatusValue | null; reviewOn: string | null }[],
    hoje: string,
  ): FollowUpSummary;
  ```

`FOLLOWUP_STATUS_COLOR` é o hexadecimal da bolinha do cabeçalho da coluna, nos mesmos tons já escolhidos e justificados em `followups-client.tsx:40-46` (neutro em Não Iniciado, vermelho SÓ em Precisa de Revisão, âmbar em Em Espera, esmeralda em Entregue, céu em Em Andamento). O par de classes Tailwind daquele arquivo também se muda para cá — é dado, não interface — e `followups-client.tsx` passa a importar daqui.

- [ ] **Passo 1: Escrever a checagem que falha**

Em `scripts/checks/followup-kanban.ts`, no estilo assert dos 55 arquivos vizinhos (ver `scripts/checks/followup-situacao.ts`):

```ts
// coluna
check("status nulo cai em Nao Iniciado", colunaDe(null), "NAO_INICIADO");
check("status gravado se mantem", colunaDe("ENTREGUE"), "ENTREGUE");

// tempo por status — a REGRA DO RETORNO da especificacao
const movs: MovementItem[] = [
  mov({ fromStatus: "NAO_INICIADO", toStatus: "EM_ANDAMENTO", elapsedMs: 1_000 }),
  mov({ fromStatus: "EM_ANDAMENTO", toStatus: "PRECISA_REVISAO", elapsedMs: 60_000 }),
  mov({ fromStatus: "PRECISA_REVISAO", toStatus: "EM_ANDAMENTO", elapsedMs: 30_000 }),
  mov({ fromStatus: "EM_ANDAMENTO", toStatus: "ENTREGUE", elapsedMs: 90_000 }),
];
check("duas passagens pelo mesmo status SOMAM", tempoPorStatus(movs).EM_ANDAMENTO, 150_000);
check("status nunca visitado e zero", tempoPorStatus(movs).EM_ESPERA, 0);
check("movimento sem medicao nao conta", tempoPorStatus([mov({ fromStatus: "EM_ANDAMENTO", toStatus: "ENTREGUE", elapsedMs: null })]).EM_ANDAMENTO, 0);

// tempo total
check("total soma os fechados", tempoTotal(movs, null, 0), 181_000);
check("total inclui a contagem aberta", tempoTotal(movs, "2026-11-27T10:00:00.000Z", Date.parse("2026-11-27T10:00:10.000Z")), 191_000);
check("inicio no futuro nao subtrai", tempoTotal([], "2026-11-27T10:00:10.000Z", Date.parse("2026-11-27T10:00:00.000Z")), 0);

// formatacao
check("zero nao finge medicao", formatarDuracao(0), "—");
check("menos de uma hora em minutos", formatarDuracao(45 * 60_000), "45min");
check("horas e minutos", formatarDuracao(2 * 3_600_000 + 15 * 60_000), "2h15");
check("mais de um dia em dias e horas", formatarDuracao(26 * 3_600_000), "1d 2h");
check("menos de um minuto nao vira zero", formatarDuracao(5_000), "<1min");

// resumo — conta o CONJUNTO DO FILTRO, nao a pagina
const linhas = [
  { status: null, reviewOn: "2026-01-10" },
  { status: "EM_ANDAMENTO" as const, reviewOn: null },
  { status: "PRECISA_REVISAO" as const, reviewOn: null },
  { status: "ENTREGUE" as const, reviewOn: "2026-01-10" },
];
const r = resumirFollowUps(linhas, "2026-11-27");
check("nulo entra no total", r.total, 4);
check("nulo nao conta como entregue", r.entregues, 1);
check("reavaliacao vencida ignora o entregue", r.reavaliacaoVencida, 1);
check("sem prazo nao vence", resumirFollowUps([{ status: "EM_ANDAMENTO", reviewOn: null }], "2026-11-27").reavaliacaoVencida, 0);
check("prazo no futuro nao vence", resumirFollowUps([{ status: "EM_ANDAMENTO", reviewOn: "2026-12-30" }], "2026-11-27").reavaliacaoVencida, 0);
```

`mov()` é um ajudante local do arquivo de checagem que preenche `id`, `changedByName` e `createdAt`.

- [ ] **Passo 2: Rodar e ver falhar**

Rodar: `npx tsx scripts/checks/followup-kanban.ts`
Esperado: FALHA — `followup-kanban.ts` não existe.

- [ ] **Passo 3: Implementar `src/lib/followup-kanban.ts`**

`tempoPorStatus` agrupa por `fromStatus` (não por `toStatus`: o tempo decorrido pertence ao status de ONDE o card saiu) e ignora `elapsedMs` nulo. `tempoTotal` soma os fechados e, se `timerStartedAt` não é nulo, acrescenta `Math.max(0, agora - Date.parse(timerStartedAt))`. `reavaliacaoVencida` compara as strings `"YYYY-MM-DD"` direto (ordem lexicográfica = ordem cronológica nesse formato, e é como `heldOn`/`reviewOn` já chegam da página, formatados no fuso do negócio) e exclui `ENTREGUE`.

- [ ] **Passo 4: Rodar e ver passar**

Rodar: `npx tsx scripts/checks/followup-kanban.ts`
Esperado: todas as asserções passam.

- [ ] **Passo 5: Registrar a checagem no portão e rodar o portão inteiro**

Rodar: `npm run check`
Esperado: **56 checagens**, exit 0. (Se o corredor não varre a pasta sozinho, acrescentar o arquivo onde os outros 55 estão listados.)

- [ ] **Passo 6: Commit**

```bash
git add src/lib/followup-kanban.ts scripts/checks/followup-kanban.ts
git commit -m "A conta do tempo por status do acompanhamento, com checagem"
```

---

### Task 3: As actions de mover e de contar

**Arquivos:**
- Modificar: `src/lib/actions/followups.ts`

**Interfaces:**
- Consome: `colunaDe` (Tarefa 2); `requireRoleAction`, `actionOk`, `actionError`, `revalidatePath(PATH)` já usados no arquivo.
- Produz:
  ```ts
  export async function moverFollowUp(args: { id: string; status: FollowUpStatusValue }): Promise<ActionResult<void>>;
  export async function alternarCronometro(args: { id: string }): Promise<ActionResult<{ contando: boolean }>>;
  ```

`moverFollowUp` espelha `moverTarefa` (`src/lib/actions/relatorio-semanal.ts:478-514`): papel, Zod com `EM_PORTUGUES`, leitura do estado atual, saída silenciosa se nada muda, `revalidatePath`.

**O cálculo do tempo é SEMPRE do servidor** (`Date.now()` contra `timerStartedAt` lido do banco). O cliente nunca envia duração — relógio de navegador adiantado gravaria tempo falso num registro de auditoria.

As duas actions escrevem em `prisma.$transaction`: a linha de movimentação e a atualização do `FollowUp` são um fato só, e metade dele gravada é um histórico em que ninguém pode confiar.

**`alternarCronometro`** é um botão só: parado → grava `timerStartedAt = now()`; contando → fecha a contagem gravando uma linha de movimentação com `fromStatus === toStatus === status atual` e o `elapsedMs` apurado, e zera `timerStartedAt`.

> **Acréscimo além da letra da especificação, para vetar se ele não quiser:** a especificação pede só "iniciar", e o contador pararia apenas ao mudar de status. Um cronômetro que não se desliga é uma armadilha — um clique por engano conta dias. O botão alterna, e a pausa é uma linha de movimentação de mesmo status, que o histórico mostra como "pausado em Em Andamento · 1h20". Custa ~10 linhas. Tirar é apagar o ramo de pausa.

- [ ] **Passo 1: Escrever as asserções que falham**

Acrescentar ao `scripts/checks/followup-kanban.ts` a parte PURA destas regras, extraída numa função testável sem banco:

```ts
// decidirMovimento(atual, destino, timerStartedAt, agora)
check("mover para o mesmo status nao e movimento", decidirMovimento("EM_ANDAMENTO", "EM_ANDAMENTO", null, 0), null);
check("mover parado grava sem medicao", decidirMovimento("EM_ANDAMENTO", "ENTREGUE", null, 0)?.elapsedMs, null);
check("mover contando mede do servidor", decidirMovimento("EM_ANDAMENTO", "ENTREGUE", "2026-11-27T10:00:00.000Z", Date.parse("2026-11-27T10:01:00.000Z"))?.elapsedMs, 60_000);
check("mover de status nulo sai de Nao Iniciado", decidirMovimento(null, "EM_ANDAMENTO", null, 0)?.fromStatus, "NAO_INICIADO");
check("relogio invertido nao grava negativo", decidirMovimento("EM_ANDAMENTO", "ENTREGUE", "2026-11-27T10:01:00.000Z", Date.parse("2026-11-27T10:00:00.000Z"))?.elapsedMs, 0);
```

`decidirMovimento` mora em `src/lib/followup-kanban.ts` (é regra, não I/O) e devolve `null` quando não há movimento a gravar, ou `{ fromStatus, toStatus, elapsedMs }`.

- [ ] **Passo 2: Rodar e ver falhar**

Rodar: `npx tsx scripts/checks/followup-kanban.ts`
Esperado: FALHA — `decidirMovimento` não existe.

- [ ] **Passo 3: Implementar `decidirMovimento` e as duas actions**

Em `moverFollowUp`: se `decidirMovimento` devolve `null`, `actionOk(undefined)` sem tocar no banco (é o arrasto que termina na própria coluna). Senão, transação: `followUpMovement.create` com `changedById: session.userId` + `followUp.update({ status: destino, timerStartedAt: null })` — mudar de status **sempre** pausa, como a especificação manda.

Em `alternarCronometro`: ler `status` e `timerStartedAt`; o segundo clique de Iniciar não pode reiniciar a contagem, então o ramo "contando" é decidido pelo valor LIDO DO BANCO, não por nada que o cliente mande.

- [ ] **Passo 4: Rodar as checagens e o portão**

Rodar: `npx tsx scripts/checks/followup-kanban.ts && npx tsc --noEmit`
Esperado: asserções passam, exit 0.

- [ ] **Passo 5: Commit**

```bash
git add src/lib/actions/followups.ts src/lib/followup-kanban.ts scripts/checks/followup-kanban.ts
git commit -m "Mover o card e contar o tempo do acompanhamento, com o relogio do servidor"
```

---

### Task 4: O cronômetro e o KPI saem para o compartilhado

**Arquivos:**
- Criar: `src/components/shared/cronometro.tsx`
- Criar: `src/components/shared/kpi-numero.tsx`
- Modificar: `src/app/(dashboard)/vendas/acompanhamento/followups-client.tsx:114-127` (remove o `Cronometro` local, importa)
- Modificar: `src/app/(dashboard)/marketing/relatorio-semanal/kanban-board.tsx:66-82` (remove o `Numero` local, importa)

**Interfaces:**
- Produz: `export function Cronometro({ desde }: { desde: number })` — idêntico ao de hoje, movido sem alteração de comportamento; `export function KpiNumero({ rotulo, valor, destaque }: { rotulo: string; valor: number; destaque?: "ok" | "alerta" })` — idêntico ao `Numero` de hoje.

Duas mudanças de endereço, não de código. São movidos porque dois quadros passam a usá-los e a especificação exige que os KPIs tenham **a mesma proposta de design**: com duas cópias, as duas telas divergem no primeiro ajuste de tom.

- [ ] **Passo 1: Mover os dois componentes e trocar os imports**

Sem mudar uma linha do corpo de nenhum dos dois.

- [ ] **Passo 2: Provar que nada mudou**

Rodar: `npx tsc --noEmit && npm run check`
Esperado: exit 0, 56 checagens.

- [ ] **Passo 3: Commit**

```bash
git add src/components/shared/cronometro.tsx src/components/shared/kpi-numero.tsx "src/app/(dashboard)/vendas/acompanhamento/followups-client.tsx" "src/app/(dashboard)/marketing/relatorio-semanal/kanban-board.tsx"
git commit -m "O cronometro e o quadrinho de KPI passam a ser de uso comum"
```

---

### Task 5: O quadro

**Arquivos:**
- Criar: `src/app/(dashboard)/vendas/acompanhamento/kanban-followups.tsx`
- Modificar: `src/app/(dashboard)/vendas/acompanhamento/page.tsx:248-358`
- Modificar: `src/app/(dashboard)/vendas/acompanhamento/followups-client.tsx` (a tabela de registros sai; o quadro entra)

**Interfaces:**
- Consome: `FollowUpRow` (de `followups-client.tsx`, acrescido de `timerStartedAt: string | null` e `movements: MovementItem[]` — o tempo total NÃO vem pronto do servidor: ele é calculado por `tempoTotal(movements, timerStartedAt, Date.now())` no cliente, senão um card em contagem mostra um número congelado no instante da consulta, ao lado de um cronômetro que anda); `colunaDe`, `tempoTotal`, `formatarDuracao`, `resumirFollowUps`, `FOLLOWUP_STATUS_COLOR` (Tarefa 2); `moverFollowUp`, `alternarCronometro` (Tarefa 3); `Cronometro`, `KpiNumero` (Tarefa 4).
- Produz:
  ```ts
  export function KanbanFollowUps(props: {
    rows: readonly FollowUpRow[];
    resumo: FollowUpSummary;
    porStatusNoFiltro: Readonly<Record<FollowUpStatusValue, number>>;
    kind: FollowUpKindValue;
    onAbrir: (id: string) => void;
    onNovo: () => void;
  }): JSX.Element;
  ```

Modelado em `src/app/(dashboard)/marketing/relatorio-semanal/kanban-board.tsx` — copiar dali a casca da coluna e os três caminhos de movimentação, que são sutis e já estão corretos: arrasto nativo do HTML (sem biblioteca), `preventDefault` no `onDragOver` sem o qual o navegador recusa a soltura, `onDragLeave` que só limpa ao sair da coluna (`currentTarget.contains(relatedTarget)`), setas ← → com o cartão em foco, e `useRef` devolvendo o foco depois do `router.refresh()` que recria o cartão na coluna nova. Ver o cabeçalho daquele arquivo (linhas 30-47) para o porquê de cada um.

O que o card de acompanhamento mostra, de cima para baixo: nome do colaborador com `Avatar` (disco de 28px, `h-7 w-7`), data da conversa, o tempo acumulado via `formatarDuracao` (e o `Cronometro` ao vivo quando `timerStartedAt` não é nulo), e o botão Iniciar/Pausar. Sem selo de status — a coluna já diz, e é a decisão registrada no quadro do Relatório Semanal ("a cor marca o status... a posição já diz"). Nos Quinzenais com `reviewOn` vencido, a data de reavaliação em `text-destructive`, no mesmo formato do prazo atrasado de lá.

**KPIs (§0.2):** cinco `KpiNumero` acima do quadro, alimentados por `resumo` — Total de registros · Em andamento · Precisa de revisão · Entregues (`destaque="ok"`) · e o quinto depende da aba: **Quinzenal** mostra "Reavaliação vencida" (`destaque="alerta"`), **One-on-One** mostra "Em espera", porque One-on-One não tem prazo e o quadrinho ficaria em zero para sempre. **Nada de "Tarefas por status" nem "Categorias × Status"** (§0.2).

**O botão Iniciar/Pausar é um `<button>` de verdade dentro do card**, e o card é um `div role="button"` — botão dentro de botão é HTML inválido, e é por isso que o quadro do Relatório não tem botões no cartão. O clique no botão chama `e.stopPropagation()` para não abrir a ficha junto.

- [ ] **Passo 1: Escrever a asserção do cabeçalho honesto**

A regra que a escolha do dono obriga, em `scripts/checks/followup-kanban.ts`:

```ts
// rotuloDaColuna(naPagina, noFiltro)
check("coluna completa mostra so o numero", rotuloDaColuna(3, 3), "3");
check("coluna paginada diz quanto esconde", rotuloDaColuna(3, 11), "3 de 11");
check("coluna vazia na pagina mas cheia no filtro", rotuloDaColuna(0, 7), "0 de 7");
```

`rotuloDaColuna` mora em `src/lib/followup-kanban.ts`.

- [ ] **Passo 2: Rodar e ver falhar**

Rodar: `npx tsx scripts/checks/followup-kanban.ts`
Esperado: FALHA — `rotuloDaColuna` não existe.

- [ ] **Passo 3: Implementar `rotuloDaColuna`, o quadro e a fiação da página**

Na `page.tsx`, dentro de `FormularioAba`: manter `total`/`pagina`/`skip`/`take` como estão (a paginação fica), acrescentar `include: { movements: { include: { changedBy: { select: { name: true } } }, orderBy: { createdAt: "asc" } } }` e `timerStartedAt` ao `findMany`, e fazer **duas consultas novas que varrem o FILTRO INTEIRO, não a página**: um `groupBy({ by: ["status"], where, _count: true })` para `porStatusNoFiltro`, e um `findMany({ where, select: { status: true, reviewOn: true } })` para `resumirFollowUps`. Sem isso os KPIs e os contadores mentem (Foco de revisão 1).

`.kanban-scroll` nas colunas que rolam e no envelope horizontal, como no quadro do Relatório.

- [ ] **Passo 4: Rodar as checagens e o portão**

Rodar: `npx tsx scripts/checks/followup-kanban.ts && npx tsc --noEmit && npm run check`
Esperado: exit 0.

- [ ] **Passo 5: Commit**

```bash
git add "src/app/(dashboard)/vendas/acompanhamento/" src/lib/followup-kanban.ts scripts/checks/followup-kanban.ts
git commit -m "O Acompanhamento vira quadro Kanban pelos Status de Evolucao"
```

---

### Task 6: O formulário vai para o modal

**Arquivos:**
- Criar: `src/app/(dashboard)/vendas/acompanhamento/followup-form-modal.tsx`
- Modificar: `src/app/(dashboard)/vendas/acompanhamento/followups-client.tsx` (o formulário embutido sai; sobra o botão "Novo registro")

**Interfaces:**
- Consome: `Modal` de `@/components/shared/modal`; `createFollowUp`, `updateFollowUp`; `BuscaColaborador` e `Texto` (hoje em `followups-client.tsx:226-371`, que se mudam para este arquivo com eles); `MAX_TEXTO`, `MAX_TOPICO`, `MIN_BUSCA_COLABORADOR`.
- Produz:
  ```ts
  export function FollowUpFormModal(props: {
    kind: FollowUpKindValue;
    registro?: FollowUpRow;
    colaboradores: readonly ColaboradorOpt[];
    hoje: string;
    gestorNome: string;
    onClose: () => void;
  }): JSX.Element;
  ```

O mesmo formulário de hoje, com os mesmos dez campos, as mesmas validações e os mesmos tetos — mudou só o envelope. Serve a criação e a edição: `registro` ausente é "Novo registro".

Seguir `new-report-modal.tsx` e `task-modal.tsx` do Relatório Semanal para largura, cabeçalho e barra de botões, e a `key` de remontagem documentada em `kanban-board.tsx:413-417` (sem ela, abrir o segundo registro mostra os dados do primeiro, porque o estado vive em inicializadores de `useState`).

`resize-none` em todo `<textarea>`, com o contador de caracteres que já existe.

- [ ] **Passo 1: Mover o formulário para o modal e pôr o botão na tela**

"Novo registro" fica na mesma fileira do cabeçalho do quadro em que o Relatório põe "Nova tarefa" (`kanban-board.tsx:176-179`).

- [ ] **Passo 2: Portão**

Rodar: `npx tsc --noEmit && npm run check`
Esperado: exit 0.

- [ ] **Passo 3: Commit**

```bash
git add "src/app/(dashboard)/vendas/acompanhamento/"
git commit -m "O formulario de acompanhamento sai da tela e vira modal de Novo registro"
```

---

### Task 7: A ficha, com o histórico de movimentação

**Arquivos:**
- Criar: `src/app/(dashboard)/vendas/acompanhamento/followup-ficha-modal.tsx`
- Modificar: `src/app/(dashboard)/vendas/acompanhamento/followups-client.tsx` (a ficha embutida de hoje sai)

**Interfaces:**
- Consome: `Modal`; `Bloco` (hoje em `followups-client.tsx:130-139`, muda-se para cá); `PlanoDeAcao` e o cronômetro de tarefa do dia, que **continuam exatamente como estão** — são outra coisa (o plano de ação por linha, em `DailyTask`) e não se misturam com o cronômetro do card; `tempoPorStatus`, `formatarDuracao`, `FOLLOWUP_STATUS_LABEL`.
- Produz:
  ```ts
  export function FollowUpFichaModal(props: {
    registro: FollowUpRow;
    tarefasAtivas: readonly TarefaAtiva[];
    ocupado: boolean;
    onEditar: () => void;
    onExcluir: () => void;
    onMover: (status: FollowUpStatusValue) => void;
    onClose: () => void;
  }): JSX.Element;
  ```

**O histórico de movimentação (§0.5)** copia a forma do Fluxo de Pedidos (`src/components/shared/order-ficha.tsx:684-706`): uma `<ul>`, uma linha por movimentação, rótulo do status à esquerda e data/hora `toLocaleString("pt-BR")` à direita, com `· por {nome}` em `text-muted-foreground`. Aqui a linha diz **de → para** (`PieceMovement` guarda os dois, e é o que "movimentação" quer dizer), o tempo decorrido no status de origem quando houver (`formatarDuracao(elapsedMs)`), e a linha de mesmo status aparece como "pausado em X".

**Os dois nomes que a especificação pede** (§0.5: "o usuário responsável pela ação e quem realizou a movimentação") são campos diferentes e aparecem os dois: o **responsável** é `managerName`, o gestor do registro, no topo da ficha; **quem movimentou** é o `changedByName` de cada linha do histórico. Com um gestor só eles coincidem — com dois, é justamente a pergunta que o histórico responde.

**Tempo por status:** uma fileira curta acima do histórico, um par "status · duração" por status visitado, de `tempoPorStatus`. Status não visitado não vira linha vazia.

**"Mover para"** continua sendo o caminho do toque e do celular, como no Relatório (`task-details-modal.tsx`): nem arrasto nativo nem seta existem num telefone.

- [ ] **Passo 1: Escrever a ficha e ligá-la ao quadro**

- [ ] **Passo 2: Portão**

Rodar: `npx tsc --noEmit && npm run check`
Esperado: exit 0.

- [ ] **Passo 3: Commit**

```bash
git add "src/app/(dashboard)/vendas/acompanhamento/"
git commit -m "A ficha do acompanhamento mostra o historico de movimentacao e o tempo por status"
```

---

### Task 8: A prova, no navegador

Nada aqui é "pronto" por o portão estar verde: a regra da casa é que toda mudança visual passa pelo navegador antes de pronto e antes do commit final.

- [ ] **Passo 1: Portão completo, do zero**

Com o `npm run dev` **parado** (construir e desenvolver ao mesmo tempo embaralha o `.next` — aconteceu três vezes em 26/11):

```bash
npx tsc --noEmit && npm run check && npx next build
```
Esperado: exit 0 nos três, 56 checagens.

- [ ] **Passo 2: Percorrer a tela nos DOIS temas**

Nas duas abas (One-on-One e Quinzenal):

- [ ] As cinco colunas aparecem e os cards caem na coluna do seu status
- [ ] Um Quinzenal antigo (`status` nulo) aparece em "Não Iniciado" — não desaparece
- [ ] Os cinco KPIs batem com o filtro inteiro, não com a página
- [ ] O cabeçalho da coluna diz "n de N" quando a página esconde registros
- [ ] "Novo registro" abre o modal; gravar fecha e o card nasce na coluna certa
- [ ] Iniciar faz o cronômetro andar; **F5 não perde a contagem** (ela vem de `timerStartedAt`, do banco)
- [ ] Mover o card pausa e grava o tempo; a ficha mostra a duração no status de origem
- [ ] **Voltar a um status anterior e iniciar de novo SOMA** ao tempo que aquele status já tinha (§0.4)
- [ ] **Editar o texto NÃO move o card** — a prova lida no banco, como a sessão de 26/11 fez no Cronograma (§3.3): pôr `status` em `EM_ESPERA` direto no banco, trocar o título pela tela, reler o banco e confirmar que o status continua `EM_ESPERA`. É o defeito achado na Tarefa 3, e nenhuma checagem pura o alcança
- [ ] Arrastar e soltar na própria coluna não grava nada no histórico
- [ ] O histórico mostra de → para, quem movimentou e a hora
- [ ] Clique no botão Iniciar **não** abre a ficha
- [ ] Teclado: Tab chega ao card, Enter abre a ficha, ← e → movem
- [ ] As barras de rolagem são as discretas (`.kanban-scroll`)
- [ ] Nenhum `<textarea>` redimensiona

- [ ] **Passo 3: Commit final e push**

```bash
git add -A
git commit -m "O Acompanhamento conferido no navegador nos dois temas"
git push origin master
```

---

## O que este plano NÃO faz, de propósito

- **Não abre a aba ao colaborador.** Decisão do dono (27/11/2026). É a mesma dívida da pendência 6.6 do registro anterior, e segue em aberto.
- **Não migra os `status` nulos.** Ler como "Não Iniciado" resolve a tela sem escrever em dado antigo, e mantém de pé o `OR` de `filtroDeSituacao` com a checagem que o guarda.
- **Não generaliza os quadros.** O projeto tem três quadros próprios e nenhuma abstração entre eles; criar a quarta implementação é o padrão da casa, e unificar os quatro é obra maior e mais arriscada que o pedido.
- **Não mexe no cronômetro do Plano de Ação** (`DailyTask`, por linha do plano). É outra medição, continua como está.
- **Não larga a paginação**, contra a recomendação registrada em §Restrições. O risco aceito: cinco cards espalhados em cinco colunas fazem o quadro parecer vazio, e ele deixa de responder "onde está o trabalho" numa olhada — que é a razão de existir de um Kanban. Os rótulos "n de N" e os KPIs do filtro inteiro impedem que a tela MINTA, mas não devolvem essa leitura. Subir `POR_PAGINA` é uma constante só.
- **Não testa largura de celular.** Continua a pendência 6.13: nunca se viu esta tela abaixo de 1920px, e agora ela ganha um quadro de cinco colunas — o mais provável de dar problema.
