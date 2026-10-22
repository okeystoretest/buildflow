# Handoff — 22/10/2026 — Alinhamento das tabelas + módulo Comercial

Sessão em modo "ponytail" (menor mudança que resolve por inteiro).
Continuação de `handoff-2026-10-21-visibilidade-tabelas-e-import-candidaturas.md`
(na raiz do repositório).

**Commitado e enviado em dois commits:** `ed2e746` (as cinco entregas abaixo) e
um segundo com a correção do Rank, que só apareceu depois do primeiro — ver
[6. O Rank não é grade de dados](#6-o-rank-não-é-grade-de-dados-correção-pós-commit).

**A migração pendente foi aplicada** — o bloqueio que o handoff anterior deixava
aberto não existe mais. Ver [Migração](#1-migração-aplicada-o-bloqueio-anterior).

---

## 1. Migração aplicada (o bloqueio anterior)

`20261021120000_wholesale_lead_import` foi aplicada no banco **local**.

Usado `prisma migrate deploy`, **não** `migrate dev`: o `deploy` só aplica o que
está pendente e nunca propõe resetar o banco. O `EPERM` do `prisma generate` que
travou a sessão passada era o dev server segurando a DLL — rodou limpo com o
servidor parado.

```
npx prisma migrate status   →  Database schema is up to date!
npx prisma generate         →  OK
npx tsc --noEmit            →  limpo
6 scripts de check          →  todos OK
```

**Atenção:** isso vale para o banco local. Qualquer outro ambiente continua sem a
migração — ela é o `DROP NOT NULL` de cinco campos de `WholesaleLead` mais a
coluna e o índice `importKey`, e sem ela a importação de candidaturas quebra em
runtime.

## 2. Alinhamento das tabelas

**Pedido:** "a centralização dos textos e cabeçalhos ficou desorganizada".

### O que NÃO era

A primeira hipótese — cabeçalho desalinhado em relação ao corpo — foi
**descartada com evidência**. Um script comparou `th` × `td` coluna a coluna nas
19 tabelas e acusou 9 divergências; **todas as 9 eram falso positivo**: a coluna
"Ações" tem `th` com `text-right` e `td` sem, mas o corpo compensa com um
`<div class="flex justify-end">`. Visualmente sempre esteve certo.

Vale registrar porque o mesmo script, rodado de novo, acusa os mesmos 9 (mais um
`className` em template literal que a regex não lê). **Não são defeitos.**

### O que era

Colunas numéricas tratadas sem critério, dentro da mesma tabela e entre tabelas.
Na tela de Pedidos: `Nº Peças` à direita, `Total` à esquerda — R$ 379,90 /
R$ 5.331,00 / R$ 1.775,00 com as vírgulas desencontradas. O Relatório de Campanha
tinha 9 colunas e nenhuma à direita; o Rank ainda usava centro.

A grade da sessão passada **não causou** isso: ela tornou visível, porque antes
não havia borda da qual o número desencostasse.

### A regra (decidida pelo usuário)

**Número à direita, texto à esquerda, cabeçalho sempre igual ao corpo.**
26 trocas em 6 arquivos:

| Tabela | Foi para a direita |
|---|---|
| Comercial / Pedidos | `Total` (+ `font-data`) |
| Relatório de Campanha | `Qtd`, `Valor`, `Premiação` |
| Gestão / Planos | `Mensalidade`, `Mínimo mensal`, `Validade`, `Benefícios`, `Contratos`, `Ações` |
| Rank de Vendas | `Qtd Peças` (era **centro**) |
| Motorista / Histórico | `Km` |
| Gestão / Metas | `Meta` |

Não sobrou nenhum `text-center` em `th` no sistema.

**Duas exceções deliberadas:**

- **Identificador não é número de somar.** `CNPJ`, `Nº do pedido`, `Comanda` e
  `Código` continuam à esquerda. Alinhá-los à direita sugeriria que se somam.
- **`Meta%` no Rank fica como está.** A célula é uma barra de progresso com o `%`
  já alinhado dentro dela por um `<span>` de largura fixa — não é célula
  numérica, e `text-right` no `td` não teria efeito (o `flex-1` da barra ocupa
  tudo).

`font-data` é a classe da casa para número: mono com
`font-feature-settings: "tnum"` (algarismos tabulares). As colunas numéricas já a
usavam; o `Total` dos Pedidos ganhou junto, porque sem largura fixa por dígito a
vírgula não alinha.

## 3. Padding das células (o defeito de verdade)

**Pedido, depois do item 2:** "as informações não estão bem espaçadas e estão
coladas na linha limite".

**Causa raiz, e é da sessão passada:** a grade entrou em `@layer base` com
**borda e sem padding**. Só que **~141 células do sistema declaram apenas
`pr-4`/`pr-2`** — padding à direita e nada à esquerda. Isso nunca incomodou
porque antes não existia linha em que esbarrar. Com a borda, todo conteúdo passou
a nascer colado nela.

**Conserto: uma regra, 19 tabelas.** Em `globals.css`, no mesmo bloco da borda:

```css
th, td {
  border: 1px solid hsl(var(--border));
  padding-left: 1rem;
  padding-right: 1rem;
}
```

Nenhuma classe foi tocada. **Utility do Tailwind vence regra de `@layer base`**,
então quem já declara `pl-4` ou `px-3` (Pedidos, Candidaturas, Financeiro/Select,
Histórico do Motorista) segue mandando no próprio padding e não mudou nada. O
valor é `1rem` para casar com o `pr-4` que domina o sistema.

**Exceção tratada:** o Rank é uma tabela densa, com `pr-2` (8px) em 13 células.
Com `1rem` à esquerda ficaria 16/8, torto. As 13 foram de `pr-2` para `px-2` —
segue densa e agora simétrica.

## 4. Bloco de importação de candidaturas

**Pedido:** deixar só a frase *"Baixe o modelo, preencha no Excel o que a
planilha antiga tem, salve como CSV e envie."*

Feito. A segunda frase da `description` saiu, e a linha **`Colunas: ...`** (27
colunas, a parede de texto da tela) saiu do **`CsvImport` compartilhado**.

**Consequência que precisa ser sabida:** os **outros três importadores** do
sistema (operações, usuários, clientes, todos na Gestão) também perderam essa
linha. Foi a mudança menor, e o botão "Baixar modelo" já entrega as colunas na
ordem certa. Se a linha fizer falta nos outros três, o caminho é devolvê-la ao
componente e esconder só nesta tela — mas aí entra um prop que hoje não existe.

## 5. Módulo Vendas → Comercial

Duas edições, nos dois únicos lugares em que "Vendas" era o **nome do módulo**:

- `src/app/(dashboard)/layout.tsx:19` — rótulo do menu.
- `src/app/(dashboard)/vendas/page.tsx:91` — `<h1>` da página.

**A distinção que guiou o corte:** "Vendas" nome-do-módulo × "vendas"
substantivo-do-negócio. Ficaram **intactos**, de propósito:

- **"Rank de Vendas"** e **"Ranking de Vendas"** — outro item de menu, e significa
  o ranking *das vendas*.
- **"Histórico de Vendas"** — o histórico das vendas em si.
- **Perfil "Vendas"** (`ROLE_LABEL.VENDAS`, no topo sob o nome do usuário, e a
  opção no cadastro da Gestão). É o cargo da pessoa.
- **Rota `/vendas`**, pastas, enum `VENDAS` do banco e o token `text-vendas-text`.
  Mudar a rota quebraria links salvos e exigiria migração, para zero ganho
  visível.

## 6. O Rank não é grade de dados (correção pós-commit)

**Reclamação, já com `ed2e746` no ar:** *"no bloco Performance em (campanha), não
pedi para inserir esse formato de tabela, corrigir para que fique igual o
restante do dashboard"*.

**Causa:** as regras de grade vivem em `@layer base` e valem para **toda
`<table>` do sistema**. Foram escritas para as doze tabelas de DADOS, mas o Rank
de Vendas é um painel de telão: suas linhas já se separam por um
`border-t border-border/60` sutil e o cabeçalho nunca teve faixa. A regra passou
por cima e transformou o painel numa planilha.

**Conserto:** uma classe de saída, `table-plain`, nas duas tabelas do Rank
(`PerfTable`, a de campanha, e `SelectTable`). Em `globals.css`:

```css
table:where(.table-plain)            { border: 0; }
:where(.table-plain) th,
:where(.table-plain) td              { border: 0; padding-left: 0; padding-right: 0; }
:where(.table-plain) thead           { background-color: transparent; }
```

As 13 células do Rank voltaram de `px-2` para `pr-2` (o padding à esquerda só
existia para o texto não encostar na borda; sem borda, não tem função).

**`:where()` não é enfeite, é o conserto de um erro cometido no caminho.** A
primeira versão usava `.table-plain th`, que vale `(0,1,1)` e **vence** a utility
`pl-2` `(0,1,0)`: o padding que a célula declara morreu e, na tela, "PREMIAÇÃO"
colou em "META%". Dentro de `:where()` o seletor cai para `(0,0,1)` — continua
vencendo a regra base `th, td` (mesma especificidade, declarada antes) e perde
para qualquer utility, que é quem deve mandar na célula.

Conferido na ordem do CSS compilado servido pelo dev server:

```
666   th, td                        regra base (grade)        (0,0,1)
702   :where(.table-plain) th, td   opt-out, vem depois       (0,0,1)  vence a base
2415  .pl-2 / .pr-2                 utilities                 (0,1,0)  vencem o opt-out
```

**Armadilha que fica:** qualquer `<table>` nova que não seja grade de dados cai
no mesmo problema e precisa da classe. **Nada avisa** — não há guarda para isso.

## Verificação

```bash
npx tsc --noEmit                                   # limpo após cada etapa
npx tsx scripts/checks/cor-de-setor.ts             # contraste + guardas de tabela
npx tsx scripts/checks/wholesale-leads-import.ts
npx tsx scripts/checks/wholesale-dashboard.ts
npx tsx scripts/checks/wholesale-permissions.ts
npx tsx scripts/checks/wholesale-apply-validation.ts
npx tsx scripts/checks/wholesale-rejection-codes.ts
```

**Visto na tela** (dev server + login com o seed do projeto):

- Gestão → Planos: `R$ 664,00` / `R$ 1.064,00` / `R$ 1.364,00` alinhados na
  vírgula, inclusive a sub-linha "base R$ ..."; contagens à direita; botões de
  ação à direita.
- Análise de Clientes: bloco de importação com a frase única, sem "Colunas:".
- Comercial / Pedidos: cabeçalho correto, mas **sem linhas** (ver pendência 3).
- Menu do topo escrito **Comercial** (item 5 confirmado).
- Rank: a grade e a faixa do cabeçalho sumiram do bloco Performance (item 6).

**NÃO visto na tela:**

- O conserto do padding das células (item 3). Confirmado só pelo **CSS compilado
  servido pelo dev server** — prova de que a regra está no ar, não de como ficou.
- **A versão final do item 6**, com `:where()`. O bug do "PREMIAÇÃO" colado em
  "META%" foi visto (foi assim que apareceu), mas depois da correção o renderer
  do Chrome travou e **três** tentativas de screenshot deram timeout. A prova que
  existe é a ordem do CSS compilado, acima. **Primeira coisa a conferir:
  recarregar o dashboard e olhar se as duas colunas estão separadas.**

## Pendente / decisões em aberto

### Novas desta sessão

1. **Confirmar na tela** que "PREMIAÇÃO" e "META%" voltaram a ficar separados no
   bloco Performance do Rank, e o padding das células das tabelas de dados. É o
   primeiro item do próximo chat (ver "NÃO visto na tela" acima).
2. **Perfil "Vendas" não virou "Comercial".** Se for para mudar, mexe no
   importador de usuários por CSV, que hoje aceita a palavra `Vendas` na coluna
   `perfil` — teria de aceitar as duas para não quebrar planilha antiga.
3. **Tabelas ficaram mais largas.** Cada coluna que não tinha `pl` ganhou 16px. O
   Relatório de Campanha tem 9 colunas (~+144px) e pode passar a rolar
   lateralmente em tela estreita. Não medido.
4. **A linha "Colunas:" sumiu dos outros 3 importadores** (ver item 4 acima).
5. **O script de comparação `th` × `td` dá 10 falsos positivos** e por isso **não**
   virou guarda em `scripts/checks/`. Para virar guarda, precisa primeiro aprender
   a reconhecer `flex justify-end` no corpo.
6. **`table-plain` é uma armadilha silenciosa.** Toda `<table>` nova que não seja
   grade de dados precisa da classe, ou ganha borda e faixa de cabeçalho sem
   ninguém pedir. Não existe guarda avisando — candidata a virar uma.

### Herdadas do handoff anterior (continuam abertas)

7. **`--popover` e `--popover-foreground`**: declarados no `globals.css`, **não
   mapeados** no `tailwind.config.ts` — conferido nesta sessão, segue assim. Uma
   utility sobre token não mapeado não gera regra: o elemento sai transparente,
   sem erro de build. Qualquer componente shadcn instalado depois (popover,
   dropdown, tooltip) usa `bg-popover` de fábrica e cairia nisso. A checagem
   `cor-de-setor` barra o uso da classe enquanto ninguém decide entre mapear ou
   apagar as variáveis.
8. **Importação de candidaturas nunca foi rodada de ponta a ponta com banco.**
   Agora é possível (migração aplicada). **Não tem desfazer** — testar com 2–3
   linhas antes do lote.
9. **`status` em branco** na planilha joga tudo para "Em análise", e candidatura
   antiga entra na fila de trabalho de hoje.
10. **`.xlsx`**: se for exigência, precisa de dependência nova.
11. **59 `border-r border-border`** redundantes nas três tabelas antigas. Zero
    efeito visual, deixados de propósito.
12. **A bolha do motivo de reprovação fecha ao rolar** — certo para rolagem de
    verdade, mas dispara também num `scroll into view` de foco.
13. **Dívida `shortcut:`**: continuam as duas de antes —
    `src/lib/wholesale-retention.ts` (retenção de 90 dias) e `chaveDeImportacao`
    (duas pessoas sem CNPJ e sem telefone, mesmo nome e mesma marca, colapsam numa
    só). **Nenhuma nova foi criada nesta sessão.**

## Divergências encontradas no estado do projeto

Coisas que o handoff anterior afirma e que **não batem** com o que foi medido:

- **A base NÃO está vazia.** O handoff diz que as 657 candidaturas foram apagadas
  em 22/10. A tela mostra **648 candidaturas**. Alguém reimportou ou restaurou
  depois. Quem for mexer em dado de candidatura **confira antes**.
- **`Resumo 19_10 - sessao 7.md` não existe mais** em disco e nunca foi
  versionado — não há como recuperar pelo git.
- O backup JSON das candidaturas apagadas ficou na pasta temporária da sessão
  anterior, que **some**. Se o histórico importava, já se perdeu.

## Estado da máquina ao fim da sessão

- **Dev server rodando** em `localhost:3000` (`npm run dev` em background).
  **Pare antes de rodar `prisma generate`**, ou volta o `EPERM`.
- Banco local com a migração aplicada e o client do Prisma regerado.

## Arquivos desta sessão

Todos modificados; nenhum criado além deste handoff.

- `src/app/globals.css` — a regra de padding
- `src/app/(dashboard)/layout.tsx` — menu: Vendas → Comercial
- `src/app/(dashboard)/vendas/page.tsx` — `Total` à direita, `<h1>` Comercial
- `src/app/(dashboard)/vendas/relatorio-campanha/page.tsx`
- `src/app/(dashboard)/vendas/analise-clientes/page.tsx` — texto da importação
- `src/app/(dashboard)/gestao/planos-panel.tsx`
- `src/app/(dashboard)/gestao/tabs-client.tsx`
- `src/app/(dashboard)/dashboard/rank-board.tsx`
- `src/app/(dashboard)/motorista/chamados/historico/page.tsx`
- `src/components/shared/csv-import.tsx` — linha "Colunas:" removida
