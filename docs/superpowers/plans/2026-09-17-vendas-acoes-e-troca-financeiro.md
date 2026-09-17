# Vendas: Ações da linha + Troca com valor passa pelo Financeiro — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajustar rótulos, cores e divisores das ações da tela de Vendas, renomear o atalho "Cadastro de Clientes" e fazer pedidos do tipo "4 - Troca" com valor informado entrarem na aprovação do Financeiro.

**Architecture:** Quatro alterações são puramente de UI em dois arquivos client (`row-actions.tsx`, `vendas/page.tsx`). A regra de negócio entra como função pura em `validations/order.ts` (`trocaPulaFinanceiro`) e é consumida na server action `createOrder` — o resto do fluxo (notificação do Financeiro, rank, kanban) já reage ao status `EM_ANALISE`, sem mudanças. Os formulários de Novo/Editar pedido ganham só um aviso textual quando a regra vai disparar.

**Tech Stack:** Next.js 14 App Router, React client components, Prisma, Zod, Tailwind (tokens `vendas`/`brand`/`border`, paleta `amber` já usada para alertas), lucide-react.

**Spec:** Não há arquivo de spec; a requisição do usuário está transcrita na seção "Requisição original" abaixo.

## Global Constraints

- Textos de UI em pt-BR com acentuação (o código-fonte mistura comentários sem acento, mas os rótulos visíveis têm acento — ex.: "Histórico de Vendas", "Cadastrar Excursão").
- Rótulos exatos pedidos: `Fazer devolução`, `Copiar link` (já existe; manter), `Cadastrar Cliente`.
- O tipo de pedido é identificado por nome exato `"4 - Troca"` via `isTroca()` — não introduzir outra comparação.
- Divisor da linha de ações deve manter `bg-border` (mesmo tom das barras `border-r border-border` da tabela).
- Sem test runner no projeto: verificação = `npx tsc --noEmit` + `npm run lint` + teste manual no `npm run dev`.
- Commits pequenos, mensagem em pt-BR no padrão do histórico (`git log`), com a linha `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

## Requisição original

1. Em Vendas > Ações, "Devoluções" → "Fazer devolução".
2. Cores dos botões "Copiar Link" e "Fazer devolução" conforme a natureza de cada ação.
3. Linha divisória separando "Copiar link" + "Fazer devolução" dos botões de edição, no mesmo padrão estético das demais separações do bloco.
4. Botões/ferramentas de Vendas: "Cadastro de Clientes" → "Cadastrar Cliente".
5. Pedido tipo "4 - Troca" com "Valor total do pedido" preenchido → vai obrigatoriamente para validação/aprovação do Financeiro antes de seguir.

## Decisões tomadas (premissas explícitas)

- **Cores:** sem criar variante nova no `Button` (YAGNI). "Copiar link" recebe tom `brand` (azul, cor de link/compartilhamento) em estilo outline tingido; "Fazer devolução" recebe tom `amber` (atenção/estorno, mesma família já usada em `order-card.tsx` e `kanban-board.tsx` para alertas). Nenhum dos dois vira botão sólido para não competir com "Pendência"/"Excluir" (destructive sólido) nem com o CTA `vendas`.
- **Divisor:** hoje há dois (`link | devolução | editar`). Fica um só, antes de Editar. O `Divisor` existente já segue o padrão pedido; só muda a posição.
- **Renomeações fora do escopo literal (decidido em 2026-09-17):** o botão "Devoluções" dentro do modal do Histórico ([historico-list.tsx:209](../../../src/app/(dashboard)/vendas/historico/historico-list.tsx)) TAMBÉM vira "Fazer devolução" (mesmo `ReturnModal`, mesma ação — Task 1). O `<h1>` "Cadastro de Clientes" da página `/vendas/clientes` é mantido (nome da tela, não de uma ação).
- **Regra Troca+valor na edição (opção B, decidida em 2026-09-17):** `updateOrder` continua sem mexer em status. Para a regra não ser contornada, uma Troca que nasceu aprovada sem valor (fora de `EM_ANALISE`, valor 0, sem devolução) **não aceita valor pela edição** — servidor recusa e o campo fica travado na tela com aviso para criar um novo pedido (Task 7). A regra do comprovante (Task 6) também passa a ser validada no servidor na edição.
- **Comprovante na Troca com valor (decidido pelo usuário em 2026-09-17):** Troca COM valor exige comprovante de pagamento na criação, **salvo** se "Observações de Pagamento" (`paymentNotes`) estiver preenchida — aí libera sem comprovante. Troca SEM valor segue dispensada. Doação/Transferência/Funcionário Interno não mudam. A regra vira função pura `comprovanteExigido()` usada no schema Zod, na action e no formulário (Task 6). O Financeiro aprova pelo caminho normal de `auditOrder` (CNPJ, forma, banco e 2º comprovante).

---

### Task 1: Rótulo "Fazer devolução" e divisor único na linha de ações

**Files:**
- Modify: `src/app/(dashboard)/vendas/row-actions.tsx:29-38` (comentário de cabeçalho), `:131-178` (JSX dos botões)
- Modify: `src/app/(dashboard)/vendas/historico/historico-list.tsx:52` (comentário), `:207-210` (botão do modal)

**Interfaces:**
- Consumes: componente `Divisor()` já existente no mesmo arquivo (`<span aria-hidden className="mx-0.5 h-5 w-px shrink-0 bg-border" />`).
- Produces: nada consumido por outras tasks.

- [x] **Step 1: Reescrever o bloco de botões com rótulo novo e um único divisor**

Substituir o trecho de `{/* Rotulo visivel ... */}` até o fechamento do `{canDelete && (...)}` por:

```tsx
        {/* Rotulo visivel (nao so o icone): a acao mais usada da linha nao
            depende de o usuario passar o mouse para descobrir o que faz. */}
        <Button
          variant="outline"
          size="sm"
          className="h-8"
          title="Copiar link"
          onClick={copyLink}
          disabled={pending}
        >
          {copied ? (
            <Check className="mr-1 h-4 w-4 text-vendas" />
          ) : (
            <Link2 className="mr-1 h-4 w-4" />
          )}
          Copiar link
        </Button>
        {canReturn && (
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            title="Registrar devolução de peças"
            onClick={() => setReturning(true)}
            disabled={pending}
          >
            <PackageMinus className="mr-1 h-4 w-4" /> Fazer devolução
          </Button>
        )}
        {/* Um unico divisor: as acoes "de contato/estoque" (link, devolucao)
            ficam de um lado; edicao/exclusao do pedido, do outro. */}
        <Divisor />
        <Button asChild variant="outline" size="icon" className="h-8 w-8" title="Editar pedido">
          <Link href={`/vendas/${orderId}/editar`}>
            <Pencil className="h-4 w-4" />
          </Link>
        </Button>
        {canDelete && (
          <Button
            variant="destructive"
            size="icon"
            className="h-8 w-8"
            title="Excluir pedido"
            onClick={() => setConfirming(true)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
```

- [x] **Step 2: Atualizar o comentário de cabeçalho do componente**

Trocar as linhas:

```
 * Divisores verticais separam os grupos (link | devolucoes | editar/excluir),
 * no mesmo tom das barras entre as colunas da tabela — sem eles a fileira de
 * botoes lia como um bloco so, diferente do resto da linha.
```

por:

```
 * Um divisor vertical separa os grupos (link + devolucao | editar/excluir),
 * no mesmo tom das barras entre as colunas da tabela — sem ele a fileira de
 * botoes lia como um bloco so, diferente do resto da linha.
```

E na lista de ações, `- DEVOLUCOES:` → `- FAZER DEVOLUCAO:` (só o rótulo do item; o texto explicativo permanece).

- [x] **Step 2b: Mesmo rótulo no botão do modal do Histórico**

Em `src/app/(dashboard)/vendas/historico/historico-list.tsx`, trocar o botão:

```tsx
                  <Button variant="outline" size="sm" onClick={() => setReturning(true)}>
                    <PackageMinus className="h-3.5 w-3.5" /> Fazer devolução
                  </Button>
```

e no comentário da linha 52, `exibe "Devoluções"` → `exibe "Fazer devolução"`. O título `<p className="font-medium">Devoluções:</p>` da lista de devoluções já registradas NÃO muda (é o cabeçalho da lista, não a ação).

- [x] **Step 3: Verificar tipagem e lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: sem erros.

- [x] **Step 4: Verificação manual**

Run: `npm run dev`, abrir `/vendas` logado como VENDAS ou GESTAO.
Expected: na coluna Ações, ordem `[Pendência?] [Copiar link] [Fazer devolução] | [✎] [🗑?]`, com uma única barra vertical antes do lápis, no mesmo tom das barras da tabela. Em pedido cancelado/estornado (`canReturn=false`) a barra continua aparecendo entre "Copiar link" e o lápis. Em `/vendas/historico`, abrir um pedido: o botão ao lado de "Devoluções:" lê "Fazer devolução".

- [x] **Step 5: Commit**

```bash
git add "src/app/(dashboard)/vendas/row-actions.tsx" "src/app/(dashboard)/vendas/historico/historico-list.tsx"
git commit -m "Acoes de Vendas: botao vira 'Fazer devolucao' (tambem no Historico) e um unico divisor separa link/devolucao de editar/excluir

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Cores dos botões "Copiar link" e "Fazer devolução"

**Files:**
- Modify: `src/app/(dashboard)/vendas/row-actions.tsx` (os dois `<Button>` da Task 1)

**Interfaces:**
- Consumes: tokens Tailwind `brand`, `brand-soft` (tailwind.config.ts) e paleta `amber` padrão.
- Produces: nada.

- [x] **Step 1: Aplicar as classes de cor**

No botão "Copiar link", trocar `className="h-8"` por:

```tsx
          className="h-8 border-brand/40 text-brand hover:bg-brand-soft hover:text-brand dark:hover:bg-brand/15"
```

e o ícone de confirmação `text-vendas` → `text-brand` (o check fica no mesmo tom do botão):

```tsx
            <Check className="mr-1 h-4 w-4 text-brand" />
```

No botão "Fazer devolução", trocar `className="h-8"` por:

```tsx
              className="h-8 border-amber-500/50 text-amber-700 hover:bg-amber-500/15 hover:text-amber-800 dark:text-amber-300 dark:hover:text-amber-200"
```

- [x] **Step 2: Registrar a intenção no comentário de cabeçalho**

Logo após o parágrafo do divisor no cabeçalho, adicionar:

```
 * Cores por natureza da acao: "Copiar link" em azul (brand, tom de link/
 * compartilhamento); "Fazer devolucao" em ambar (atencao — a acao abate valor
 * do pedido), a mesma familia dos alertas do kanban. Ambos ficam em outline
 * tingido para nao competir com Pendencia/Excluir (destructive solido).
```

- [x] **Step 3: Verificar tipagem e lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: sem erros.

- [x] **Step 4: Verificação manual (claro e escuro)**

Run: `npm run dev`, `/vendas`, alternar o tema.
Expected: "Copiar link" com borda/texto azul e hover azul-claro; "Fazer devolução" com borda/texto âmbar e hover âmbar-claro; contraste legível nos dois temas; clicar em "Copiar link" mostra o check azul por 2s.

- [x] **Step 5: Commit**

```bash
git add "src/app/(dashboard)/vendas/row-actions.tsx"
git commit -m "Acoes de Vendas: 'Copiar link' em azul (brand) e 'Fazer devolucao' em ambar, conforme a natureza de cada acao

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: "Cadastro de Clientes" → "Cadastrar Cliente" no cabeçalho de Vendas

**Files:**
- Modify: `src/app/(dashboard)/vendas/page.tsx:74`

**Interfaces:** nenhuma.

- [x] **Step 1: Trocar o rótulo do botão**

```tsx
          <Button asChild variant="outline"><Link href="/vendas/clientes"><Users className="h-4 w-4" /> Cadastrar Cliente</Link></Button>
```

- [x] **Step 2: Confirmar que não há outro botão/atalho com o rótulo antigo**

Run: `grep -rn "Cadastro de Clientes" src --include=*.tsx`
Expected: só sobra o `<h1>` em `src/app/(dashboard)/vendas/clientes/page.tsx:52` (título da página — fora do escopo desta task; ver "Perguntas em aberto") e comentários.

- [x] **Step 3: Verificar lint e manual**

Run: `npm run lint`; `npm run dev` → `/vendas`.
Expected: barra de atalhos lê `Cadastrar Cliente · Cadastrar Excursão · Tarefas Diárias · Relatório de Campanha · Histórico de Vendas · Novo pedido`.

- [x] **Step 4: Commit**

```bash
git add "src/app/(dashboard)/vendas/page.tsx"
git commit -m "Vendas: atalho 'Cadastro de Clientes' vira 'Cadastrar Cliente', no padrao de 'Cadastrar Excursao'

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Regra — Troca com valor passa pelo Financeiro (backend)

**Files:**
- Modify: `src/lib/validations/order.ts` (após `isTroca`, ~linha 104)
- Modify: `src/lib/actions/orders.ts:7`, `:35-78`, `:176-182`, `:231-235`
- Modify: `src/lib/rank-data.ts:75-76` (comentário), `src/lib/realtime/emit.ts:14` (comentário), `src/app/api/events/poll/route.ts:14` (comentário)

**Interfaces:**
- Produces: `trocaPulaFinanceiro(args: { orderTypeName?: string | null; orderValue: number }): boolean` em `@/lib/validations/order` — `true` somente para "4 - Troca" com `orderValue <= 0`. Task 5 consome.

- [x] **Step 1: Criar a função pura da regra**

Em `src/lib/validations/order.ts`, logo após `isTroca`:

```ts
// Troca SEM valor pula o Financeiro (nasce aprovada). Troca COM "Valor Total
// do Pedido" preenchido (> 0) e uma venda de fato e passa pela Analise de
// Pedidos como qualquer outro tipo. Qualquer outro tipo nunca pula.
export function trocaPulaFinanceiro(args: {
  orderTypeName?: string | null;
  orderValue: number;
}): boolean {
  return isTroca(args.orderTypeName) && !(args.orderValue > 0);
}
```

- [x] **Step 2: Usar a regra em `createOrder`**

Em `src/lib/actions/orders.ts`, linha 7:

```ts
import { createOrderSchema, isTroca, isAnexoDispensavelPorContexto, trocaPulaFinanceiro } from "@/lib/validations/order";
```

Substituir o bloco de comentário + `const troca = isTroca(orderType.name);` (linhas 35-45) por:

```ts
    // Tipo do pedido (fonte confiavel = banco, nao o payload da tela).
    // "Troca" SEM valor ignora a Aprovacao Financeira. Status inicial:
    //  - Loja de fluxo PADRAO: entra ja em AGUARDANDO_IMPRESSAO.
    //  - Loja de fluxo SIMPLIFICADO (PAGO->EMBALADO->ENTREGUE): entra em PAGO,
    //    o 1o status do fluxo curto (AGUARDANDO_IMPRESSAO nao existe la).
    // "Troca" COM valor informado passa pelo Financeiro (EM_ANALISE) como os
    // demais tipos — a isencao de anexo continua valendo, so o desvio do
    // Financeiro cai.
    const orderType = await prisma.orderType.findUnique({
      where: { id: input.orderTypeId },
      select: { name: true },
    });
    if (!orderType) return actionError("Tipo de pedido invalido.");
    const pulaFinanceiro = trocaPulaFinanceiro({
      orderTypeName: orderType.name,
      orderValue: input.orderValue,
    });
```

Substituir `const initialStatus = troca ? ... : "EM_ANALISE";` por:

```ts
    const initialStatus = pulaFinanceiro
      ? simplifiedStore
        ? "PAGO"
        : "AGUARDANDO_IMPRESSAO"
      : "EM_ANALISE";
```

Substituir a nota do histórico (linha ~180) por:

```ts
            note: pulaFinanceiro
              ? "Pedido de Troca criado (sem aprovacao financeira)"
              : isTroca(orderType.name)
                ? "Pedido de Troca com valor criado (aguardando Financeiro)"
                : "Pedido criado",
```

Atualizar o comentário antes de `emitOrderCreated` (linha ~233):

```ts
    // Trocas SEM valor pulam o Financeiro (AGUARDANDO_IMPRESSAO/PAGO) => sem
    // alerta ativo, mas o board de quem visualiza ainda reage.
```

- [x] **Step 3: Alinhar os comentários que descrevem a regra antiga**

`src/lib/rank-data.ts:75-76`:

```
 *  - TROCA ("4 - Troca") SEM valor: dispensa o Financeiro e NASCE aprovada — ja
 *    entra em AGUARDANDO_IMPRESSAO (loja padrao) ou PAGO (loja simplificada).
 *    Troca COM valor passa pelo Financeiro como os demais.
```

`src/lib/realtime/emit.ts:14` — onde diz "Trocas," ajustar para "Trocas sem valor,". `src/app/api/events/poll/route.ts:14` — "pedido novo nao-Troca" → "pedido novo que entra em EM_ANALISE".

- [x] **Step 4: Verificar tipagem e lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: sem erros (em especial nenhum uso remanescente da variável `troca` em `orders.ts`).

- [x] **Step 5: Verificação manual da regra**

Run: `npm run dev`. Como VENDAS, criar três pedidos:
1. Tipo "4 - Troca", valor vazio → Expected: status `AGUARDANDO_IMPRESSAO` (ou `PAGO` em loja simplificada); não aparece na Análise do Financeiro.
2. Tipo "4 - Troca", valor `50` → Expected: status `EM_ANALISE`; aparece na Análise do Financeiro; Financeiro recebe notificação; histórico com nota "Pedido de Troca com valor criado (aguardando Financeiro)".
3. Tipo "1 - Venda" (qualquer não-Troca), valor `50` → Expected: `EM_ANALISE` (comportamento inalterado).
Depois, como FINANCEIRO, aprovar o pedido 2 preenchendo CNPJ/forma/banco/2º comprovante → Expected: vai para `AGUARDANDO_IMPRESSAO` e cria entrega (mesmo caminho dos demais).

- [x] **Step 6: Commit**

```bash
git add src/lib/validations/order.ts src/lib/actions/orders.ts src/lib/rank-data.ts src/lib/realtime/emit.ts src/app/api/events/poll/route.ts
git commit -m "Troca com 'Valor Total do Pedido' preenchido passa pela aprovacao do Financeiro; Troca sem valor segue pulando

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Aviso no formulário de Novo Pedido quando a Troca vai para o Financeiro

**Files:**
- Modify: `src/app/(dashboard)/vendas/novo/form.tsx` (imports ~linha 10-20, cálculo ~linha 165-173, campo "Valor Total do Pedido" ~linha 300-303)

**Interfaces:**
- Consumes: `trocaPulaFinanceiro` e `isTroca` de `@/lib/validations/order` (Task 4).

- [x] **Step 1: Importar a regra**

Na linha de import de `@/lib/validations/order` do formulário, incluir `isTroca` e `trocaPulaFinanceiro` (manter os já importados).

- [x] **Step 2: Calcular o aviso ao lado de `valorDispensavel`**

Após `const valorDispensavel = isAnexoDispensavel(orderTypeName);`:

```tsx
  // Troca com valor informado deixa de pular o Financeiro. O aviso aparece
  // assim que a vendedora digita um valor, para nao surpreender depois.
  const trocaVaiParaFinanceiro =
    isTroca(orderTypeName) && !trocaPulaFinanceiro({ orderTypeName, orderValue });
```

- [x] **Step 3: Renderizar o aviso abaixo do campo de valor**

Logo após o `<Input ... placeholder="0,00" />` do "Valor Total do Pedido":

```tsx
          {trocaVaiParaFinanceiro && (
            <p className="text-xs text-financeiro">
              Troca com valor passa pela aprovação do Financeiro antes de seguir.
            </p>
          )}
```

- [x] **Step 4: Verificar tipagem, lint e manual**

Run: `npx tsc --noEmit && npm run lint`; `npm run dev` → `/vendas/novo`.
Expected: selecionando "4 - Troca" o campo mostra "(opcional)"; ao digitar um valor > 0 aparece o aviso em rosa (`text-financeiro`); ao limpar o valor, o aviso some; em outros tipos o aviso nunca aparece.

- [x] **Step 5: Commit**

```bash
git add "src/app/(dashboard)/vendas/novo/form.tsx"
git commit -m "Novo pedido: avisa que Troca com valor passa pelo Financeiro

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Troca com valor exige comprovante, salvo com "Observações de Pagamento" preenchida

**Files:**
- Modify: `src/lib/validations/order.ts` (nova função após `isAnexoDispensavelPorContexto`, ~linha 140; `refine` do comprovante, ~linhas 77-82)
- Modify: `src/lib/actions/orders.ts:7` (import), `:54-62` (checagem do comprovante)
- Modify: `src/app/(dashboard)/vendas/novo/form.tsx` (import; `anexoDispensavel` ~linha 168; `anexoOk` ~linha 214; texto de ajuda do anexo ~linhas 406-412)

**Interfaces:**
- Consumes: `isAnexoDispensavelPorContexto`, `isTroca` (já existem em `@/lib/validations/order`).
- Produces: `comprovanteExigido(args: { orderTypeName?: string | null; operationName?: string | null; orderValue: number; paymentNotes?: string | null }): boolean` — `true` quando ao menos 1 comprovante é obrigatório na criação.

- [x] **Step 1: Criar a função pura em `validations/order.ts`**

Logo após `isAnexoDispensavelPorContexto`:

```ts
// Comprovante de pagamento obrigatorio na CRIACAO do pedido.
//  - Tipos/operacoes que dispensam anexo (Troca, Doacao, Transferencia,
//    Funcionario Interno): nao exigem... EXCETO Troca COM valor, que passa
//    pelo Financeiro e precisa de comprovante — salvo se a vendedora
//    preencheu "Observacoes de Pagamento", que explica ao Financeiro o
//    porque de nao haver comprovante e libera o envio.
//  - Demais tipos: sempre exigem.
export function comprovanteExigido(args: {
  orderTypeName?: string | null;
  operationName?: string | null;
  orderValue: number;
  paymentNotes?: string | null;
}): boolean {
  const trocaComValor = isTroca(args.orderTypeName) && args.orderValue > 0;
  if (trocaComValor) return !(args.paymentNotes ?? "").trim();
  return !isAnexoDispensavelPorContexto({
    orderTypeName: args.orderTypeName,
    operationName: args.operationName,
  });
}
```

- [x] **Step 2: Trocar o `refine` do comprovante no `createOrderSchema`**

Substituir:

```ts
  // Comprovante de pagamento dispensado quando o tipo isenta anexo
  // (Troca ou Doação).
  .refine(
    (d) =>
      isAnexoDispensavelPorContexto({ orderTypeName: d.orderTypeName, operationName: d.operationName }) ||
      !!(d.paymentProofsBase64 && d.paymentProofsBase64.length > 0),
    { message: "Anexe o comprovante de pagamento.", path: ["paymentProofsBase64"] },
  )
```

por:

```ts
  // Comprovante de pagamento: obrigatorio conforme comprovanteExigido()
  // (dispensado por tipo/operacao; Troca com valor exige, salvo com
  // "Observacoes de Pagamento" preenchida).
  .refine(
    (d) =>
      !comprovanteExigido({
        orderTypeName: d.orderTypeName,
        operationName: d.operationName,
        orderValue: d.orderValue,
        paymentNotes: d.paymentNotes,
      }) || !!(d.paymentProofsBase64 && d.paymentProofsBase64.length > 0),
    { message: "Anexe o comprovante de pagamento ou preencha as Observações de Pagamento.", path: ["paymentProofsBase64"] },
  )
```

(`comprovanteExigido` é `function` declaration, então pode ser usada antes da definição no mesmo módulo.)

- [x] **Step 3: Usar a regra na action `createOrder`**

Import (linha 7):

```ts
import { createOrderSchema, isTroca, comprovanteExigido, trocaPulaFinanceiro } from "@/lib/validations/order";
```

Substituir o bloco (linhas ~54-62):

```ts
    // Anexo (comprovante) opcional por TIPO (Troca/Doação/Transferência) OU por
    // OPERAÇÃO (Funcionário Interno). Fora desses casos, ao menos 1 comprovante.
    const anexoDispensavel = isAnexoDispensavelPorContexto({
      orderTypeName: orderType.name,
      operationName: operation?.name,
    });
    if (!anexoDispensavel && (input.paymentProofsBase64 ?? []).length === 0) {
      return actionError("Anexe o comprovante de pagamento.");
    }
```

por:

```ts
    // Comprovante: dispensado por TIPO (Troca/Doação/Transferência) ou por
    // OPERAÇÃO (Funcionário Interno). Troca COM valor exige comprovante, salvo
    // se a vendedora preencheu "Observações de Pagamento". Nomes vêm do banco.
    const exigeComprovante = comprovanteExigido({
      orderTypeName: orderType.name,
      operationName: operation?.name,
      orderValue: input.orderValue,
      paymentNotes: input.paymentNotes,
    });
    if (exigeComprovante && (input.paymentProofsBase64 ?? []).length === 0) {
      return actionError("Anexe o comprovante de pagamento ou preencha as Observações de Pagamento.");
    }
```

Remover `isAnexoDispensavelPorContexto` do import se não sobrar outro uso em `orders.ts` (verificar com `grep -n isAnexoDispensavelPorContexto src/lib/actions/orders.ts`).

- [x] **Step 4: Formulário de Novo Pedido — regra e texto de ajuda**

Import: incluir `comprovanteExigido` na linha de import de `@/lib/validations/order`.

Substituir o cálculo de `anexoDispensavel` (~linha 165-168):

```tsx
  // Anexo (comprovante/NF) opcional por TIPO (Troca/Doação/Transferência) ou
  // por OPERAÇÃO ("20 - Venda para Funcionário Interno").
  const anexoDispensavel = isAnexoDispensavelPorContexto({ orderTypeName, operationName });
```

por:

```tsx
  // Comprovante: dispensado por TIPO (Troca/Doação/Transferência) ou por
  // OPERAÇÃO ("20 - Venda para Funcionário Interno"). Troca COM valor volta a
  // exigir, salvo se "Observações de Pagamento" estiver preenchida — a regra
  // e a mesma do servidor (comprovanteExigido).
  const exigeComprovante = comprovanteExigido({ orderTypeName, operationName, orderValue, paymentNotes });
  const anexoDispensavel = !exigeComprovante;
```

`anexoOk` (~linha 214) continua `anexoDispensavel || temAnexo` — nada a mudar. Atualizar o comentário acima dele de `// Anexo obrigatório (ao menos 1), EXCETO Troca e Doação.` para `// Anexo obrigatório (ao menos 1) conforme comprovanteExigido().`

Texto de ajuda do anexo (~linhas 406-412) — substituir o ternário por:

```tsx
          {anexoDispensavel
            ? "Anexo não é exigido para este tipo de pedido."
            : isTroca(orderTypeName)
              ? "Troca com valor: anexe ao menos 1 comprovante ou preencha as Observações de Pagamento."
              : "Envio de ao menos 1 comprovante obrigatório."}{" "}
```

- [x] **Step 5: Verificar tipagem e lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: sem erros; `grep -rn isAnexoDispensavelPorContexto src` ainda encontra os usos em `logistics.ts` e no formulário de edição (não tocados).

- [x] **Step 6: Verificação manual**

Run: `npm run dev` → `/vendas/novo`, como VENDAS:
1. Troca, valor vazio, sem anexo, sem observações → Expected: botão de envio habilitado; ajuda "Anexo não é exigido…"; cria em `AGUARDANDO_IMPRESSAO`.
2. Troca, valor `50`, sem anexo, sem observações → Expected: envio **bloqueado**; ajuda "Troca com valor: anexe…".
3. Troca, valor `50`, sem anexo, observações "pago em dinheiro na loja" → Expected: envio liberado; cria em `EM_ANALISE`.
4. Troca, valor `50`, com 1 anexo, sem observações → Expected: envio liberado; cria em `EM_ANALISE`.
5. Doação, valor vazio, sem anexo → Expected: inalterado (liberado).
6. Venda comum, sem anexo, com observações → Expected: continua **bloqueado** (observações só liberam a Troca).
Teste do servidor: no caso 2, forçar o envio pelo DevTools (remover `disabled`) → Expected: action devolve "Anexe o comprovante de pagamento ou preencha as Observações de Pagamento."

- [x] **Step 7: Commit**

```bash
git add src/lib/validations/order.ts src/lib/actions/orders.ts "src/app/(dashboard)/vendas/novo/form.tsx"
git commit -m "Troca com valor exige comprovante de pagamento, salvo com Observacoes de Pagamento preenchidas

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Edição — Troca aprovada sem valor não pode receber valor; comprovante validado na edição

**Files:**
- Modify: `src/lib/validations/order.ts` (nova função após `trocaPulaFinanceiro`)
- Modify: `src/lib/actions/orders.ts` (`updateOrder`: import; `findUnique` do pedido ~linha 300; após a checagem de `orderValue` ~linha 318)
- Modify: `src/app/(dashboard)/vendas/[id]/editar/page.tsx:80-110` (passa `status`)
- Modify: `src/app/(dashboard)/vendas/[id]/editar/form.tsx:12` (import), `:23-37` (OrderData), `:163-174` (regras), `:207-212` (podeSalvar), `:288-291` (campo de valor), texto de ajuda do anexo

**Interfaces:**
- Consumes: `isTroca`, `comprovanteExigido` (Task 6) de `@/lib/validations/order`.
- Produces: `trocaValorTravado(args: { orderTypeName?: string | null; status: string; orderValue: number; hasReturns: boolean }): boolean` — `true` quando o pedido é uma Troca que já saiu de `EM_ANALISE` sem valor (nasceu aprovada) e por isso não pode receber valor pela edição. `TROCA_VALOR_TRAVADO_MSG: string` — mensagem única para servidor e tela.

- [x] **Step 1: Criar a função pura**

Em `src/lib/validations/order.ts`, após `trocaPulaFinanceiro`:

```ts
// Trava de EDICAO. Uma Troca criada SEM valor nasce aprovada (pulou o
// Financeiro) e ja pode estar na Logistica com entrega e comanda. Se a edicao
// pudesse colocar valor depois, a regra "Troca com valor passa pelo
// Financeiro" seria contornada. Entao: Troca fora de EM_ANALISE, com valor
// zero e sem devolucao registrada, nao aceita valor — cria-se um novo pedido.
// (Valor zero POR devolucao integral nao conta: ali o pedido ja passou pelo
// fluxo com valor.) Os argumentos descrevem o pedido COMO ESTA NO BANCO.
export function trocaValorTravado(args: {
  orderTypeName?: string | null;
  status: string;
  orderValue: number;
  hasReturns: boolean;
}): boolean {
  return (
    isTroca(args.orderTypeName) &&
    args.status !== "EM_ANALISE" &&
    !(args.orderValue > 0) &&
    !args.hasReturns
  );
}

export const TROCA_VALOR_TRAVADO_MSG =
  "Esta Troca foi aprovada sem valor. Para registrar uma Troca com valor, crie um novo pedido.";
```

- [x] **Step 2: Aplicar a trava e a regra do comprovante em `updateOrder`**

Import (linha 7 de `orders.ts`): acrescentar `trocaValorTravado`, `TROCA_VALOR_TRAVADO_MSG` e `comprovanteExigido` (este já importado na Task 6).

O `findUnique` do pedido (linha ~300) passa a trazer tipo, operação e contagem de comprovantes:

```ts
    const order = await prisma.order.findUnique({
      where: { id: args.id },
      include: {
        _count: { select: { returns: true, paymentProofs: true } },
        orderType: { select: { name: true } },
        operation: { select: { name: true } },
      },
    });
```

Logo após o bloco `if (!(orderValue > 0) && !(temDevolucao && orderValue === 0)) { ... }`:

```ts
    // Troca aprovada sem valor: nao aceita valor pela edicao (ver
    // trocaValorTravado). Avalia o pedido como esta no banco — trocar o TIPO
    // no mesmo envio nao escapa da trava.
    if (
      orderValue > 0 &&
      trocaValorTravado({
        orderTypeName: order.orderType?.name,
        status: order.status,
        orderValue: Number(order.orderValue),
        hasReturns: temDevolucao,
      })
    ) {
      return actionError(TROCA_VALOR_TRAVADO_MSG);
    }

    // Comprovante apos a edicao: mesma regra da criacao (comprovanteExigido),
    // avaliada sobre o estado FINAL — tipo/operacao/valor/observacoes que vao
    // ficar gravados e a quantidade de comprovantes depois de remover/anexar.
    const finalTypeName = args.orderTypeId && args.orderTypeId !== order.orderTypeId
      ? (await prisma.orderType.findUnique({ where: { id: args.orderTypeId }, select: { name: true } }))?.name
      : order.orderType?.name;
    const finalOperationName = args.operationId && args.operationId !== order.operationId
      ? (await prisma.operation.findUnique({ where: { id: args.operationId }, select: { name: true } }))?.name
      : order.operation?.name;
    const finalPaymentNotes = args.paymentNotes === undefined ? order.paymentNotes : args.paymentNotes;
    const removidos = args.removeProofIds?.length
      ? await prisma.orderPaymentProof.count({ where: { id: { in: args.removeProofIds }, orderId: order.id } })
      : 0;
    const novosValidos = (args.paymentProofsBase64 ?? []).filter(Boolean).length;
    const comprovantesFinais = order._count.paymentProofs - removidos + novosValidos;
    if (
      comprovanteExigido({
        orderTypeName: finalTypeName,
        operationName: finalOperationName,
        orderValue,
        paymentNotes: finalPaymentNotes,
      }) &&
      comprovantesFinais <= 0
    ) {
      return actionError("Anexe o comprovante de pagamento ou preencha as Observações de Pagamento.");
    }
```

- [x] **Step 3: Passar `status` ao formulário de edição**

Em `src/app/(dashboard)/vendas/[id]/editar/page.tsx`, no objeto `order={{ ... }}`, logo após `orderTypeId: order.orderTypeId,`:

```tsx
              status: order.status,
```

Em `form.tsx`, na `interface OrderData`, logo após a linha `customerId: string; storeId: string; originStoreId: string; orderTypeId: string; operationId: string;`:

```ts
  // Status atual: a trava de valor da Troca so vale fora de EM_ANALISE.
  status: string;
```

- [x] **Step 4: Formulário de edição — trava do valor e regra do comprovante**

Import (linha 12):

```ts
import { isAnexoDispensavel, isTroca, comprovanteExigido, trocaValorTravado, TROCA_VALOR_TRAVADO_MSG } from "@/lib/validations/order";
```

Substituir o bloco de regras (de `// Anexo opcional por TIPO (Troca/Doação/Transferência) OU OPERAÇÃO` até `const valorDispensavel = isAnexoDispensavel(orderTypeName);`) por:

```tsx
  // Comprovante: mesma regra do servidor (comprovanteExigido) — dispensado
  // por tipo/operacao; Troca COM valor exige, salvo com "Observacoes de
  // Pagamento" preenchida. Valor opcional segue so o TIPO.
  const exigeComprovante = comprovanteExigido({ orderTypeName, operationName, orderValue, paymentNotes });
  const anexoDispensavel = !exigeComprovante;
  const valorDispensavel = isAnexoDispensavel(orderTypeName);
  // Troca que nasceu aprovada sem valor: o campo de valor fica travado (a
  // regra e avaliada sobre o pedido COMO ESTA gravado, por isso usa o tipo
  // original e nao o selecionado na tela).
  const tipoOriginalName = orderTypes.find((t) => t.id === order.orderTypeId)?.name ?? "";
  const valorTravado = trocaValorTravado({
    orderTypeName: tipoOriginalName,
    status: order.status,
    orderValue: order.orderValue,
    hasReturns: order.hasReturns,
  });
```

Em `valorOk`, acrescentar a trava:

```tsx
  const valorOk = (valorDispensavel || orderValue > 0 || (order.hasReturns && orderValue === 0))
    && !(valorTravado && orderValue > 0);
```

Campo "Valor Total do Pedido":

```tsx
        <div className="space-y-1.5">
          <Label>Valor Total do Pedido {valorDispensavel ? "(opcional)" : "*"}</Label>
          <Input
            type="number" min={0} step="0.01"
            value={orderValue || ""}
            onChange={(e) => setOrderValue(Number(e.target.value))}
            placeholder="0,00"
            disabled={valorTravado}
            title={valorTravado ? TROCA_VALOR_TRAVADO_MSG : undefined}
          />
          {valorTravado && (
            <p className="text-xs text-muted-foreground">{TROCA_VALOR_TRAVADO_MSG}</p>
          )}
        </div>
```

Texto de ajuda do anexo (localizar `"Anexo não é exigido para este tipo de pedido."` no form de edição) — trocar o ternário pelo mesmo da Task 6:

```tsx
          {anexoDispensavel
            ? "Anexo não é exigido para este tipo de pedido."
            : isTroca(orderTypeName)
              ? "Troca com valor: anexe ao menos 1 comprovante ou preencha as Observações de Pagamento."
              : "Envio de ao menos 1 comprovante obrigatório."}{" "}
```

Remover `isAnexoDispensavelPorContexto` do import se não sobrar outro uso no arquivo.

- [x] **Step 5: Verificar tipagem e lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: sem erros (o `include` novo em `updateOrder` muda o tipo de `order`; nenhum campo lido deixa de existir).

- [x] **Step 6: Verificação manual**

Run: `npm run dev`. Como VENDAS:
1. Troca criada sem valor (já em `AGUARDANDO_IMPRESSAO`) → abrir "Editar": campo de valor **desabilitado** com o aviso "Esta Troca foi aprovada sem valor…"; salvar outros campos (observações de envio) funciona.
2. Mesmo pedido, tirar o `disabled` pelo DevTools e enviar valor 50 → action devolve a mesma mensagem; nada gravado.
3. Mesmo pedido, trocar o tipo para "1 - Venda" e colocar valor 50 → bloqueado (mesma mensagem — a trava usa o tipo original).
4. Troca criada **com** valor (em `EM_ANALISE`) → campo de valor **habilitado**; remover todos os comprovantes e limpar observações → salvar bloqueado, ajuda "Troca com valor: anexe…"; preencher observações → salva.
5. Troca com devolução integral (valor 0, `hasReturns`) → campo habilitado (trava não se aplica).
6. Venda comum em `EM_ANALISE`, remover todos os comprovantes pelo DevTools → servidor recusa (antes só a tela travava).

- [x] **Step 7: Commit**

```bash
git add src/lib/validations/order.ts src/lib/actions/orders.ts "src/app/(dashboard)/vendas/[id]/editar/page.tsx" "src/app/(dashboard)/vendas/[id]/editar/form.tsx"
git commit -m "Edicao de pedido: Troca aprovada sem valor nao recebe valor; comprovante passa a ser validado no servidor

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Perguntas em aberto (decidir antes de executar)

1. ~~Botão "Devoluções" no modal do Histórico~~ — **resolvido**: renomear também (Task 1, Step 2b).
2. ~~`<h1>` "Cadastro de Clientes"~~ — **resolvido**: manter.
3. ~~Edição de Troca~~ — **resolvido (opção B)**: bloquear valor na edição de Troca aprovada sem valor (Task 7).
4. ~~Comprovante em Troca com valor~~ — **resolvido** (Task 6): exige comprovante, salvo com "Observações de Pagamento" preenchida.
5. ~~Comprovante na edição~~ — **resolvido**: `updateOrder` valida `comprovanteExigido` sobre o estado final (Task 7). Efeito colateral aceito: vendas comuns também passam a ter o comprovante checado no servidor na edição (a tela já exigia).

## Self-review

- **Cobertura da spec:** (1) Task 1; (2) Task 2; (3) Task 1; (4) Task 3; (5) Tasks 4 e 5; regra adicional de comprovante (decisão de 2026-09-17) Task 6; trava de edição (opção B) Task 7. Sem lacunas.
- **Placeholders:** nenhum "TBD"/"adicionar validação"; todo step de código tem o código.
- **Consistência de nomes:** `trocaPulaFinanceiro({ orderTypeName, orderValue })` definido na Task 4 e consumido com a mesma assinatura na Task 5; `comprovanteExigido({ orderTypeName, operationName, orderValue, paymentNotes })` definido na Task 6 e reutilizado com a mesma assinatura na Task 7 (`updateOrder` e formulário de edição); `trocaValorTravado({ orderTypeName, status, orderValue, hasReturns })` e `TROCA_VALOR_TRAVADO_MSG` definidos e consumidos na Task 7 com a mesma assinatura no servidor e na tela; `Divisor` reutilizado sem alteração; `pulaFinanceiro` substitui `troca` em todos os usos de `orders.ts` (status inicial, nota do histórico, comentário do emit).
