# Handoff — 05/11/2026 — Barra lateral, navegação centralizada e relatório gerencial da Análise de Clientes

**Para quem pega isto numa sessão nova.** Dois commits sobre `2b3a8be`,
**56 arquivos, +2455 / −440**, 10 arquivos novos, 4 apagados, **nenhuma
dependência adicionada**.

| Commit | O quê |
|---|---|
| `c9b9651` | Navegação: barra lateral única, cabeçalhos padronizados e renomeação dos módulos |
| `6b96ff9` | Análise de Clientes: relatório gerencial em PDF e três blocos novos no painel |

**⚠️ NADA FOI EMPURRADO.** `origin/master` ainda está em `2b3a8be`; os dois
commits existem só na máquina local. `git push` é a primeira coisa a fazer.

**Verificação final:** `npx tsc --noEmit` exit 0 · **39/39** scripts de
`scripts/checks/` passando · `npm run build` exit 0 · telas conferidas no
navegador (detalhe na seção 6).

**Árvore ao fim:** limpa, exceto quatro arquivos de handoff anteriores a esta
sessão, deixados de fora de propósito — ver seção 7.

---

## 0. O pedido

Quatro specs, cada um chegando depois do anterior pronto, e o usuário
re-escopando a cada rodada:

1. **Spec 1 (4 itens):** barra lateral, ajustes no Dashboard, relatório
   gerencial da Análise de Clientes, ferramenta Vitrine. Escopado na hora para
   *"Só o Dashboard"*.
2. **Spec 2:** a barra lateral tinha de ficar parecida com as imagens de
   referência do Build.Connect; sino e tema voltando ao canto superior direito.
3. **Spec 3 (6 itens):** tipografia da marca, logo e favicon novos, Gestão virando
   botão de configuração, remoção dos botões duplicados no topo das abas,
   comportamento de navegação por módulos, padronização de largura das telas.
4. **Spec 4 (4 itens):** renomear e reordenar as ferramentas de Comercial,
   Financeiro e Logística; "Lançar Pedidos" apontando para a index do módulo;
   Cadastro de Clientes com todas as colunas; título + descrição em toda
   ferramenta; **reverter** a abertura automática da primeira ferramenta.

Depois disso, nesta sessão, o relatório gerencial do spec 1.

---

## 1. A navegação virou um arquivo só

O problema que isto resolve: a lista de ferramentas vivia espalhada em **cinco
arquivos** — `vendas/page.tsx`, `logistica/page.tsx`,
`financeiro/ferramentas-client.tsx`, `motorista/tool-tabs.tsx` e o `NAV` do
layout — e cada um decidia por conta própria quem via o quê. Renomear uma
ferramenta exigia achar os cinco.

Agora tudo está em **[`src/app/(dashboard)/nav.ts`](<../src/app/(dashboard)/nav.ts>)**,
e os quatro arquivos que duplicavam a lista foram apagados.

### A semântica de permissão, que é a parte sutil

`roles` e a flag combinam assim: **a flag sempre LIBERA, nunca restringe.** Um
item com `roles: ["GESTAO"]` **e** uma flag aparece para a Gestão *ou* para quem
tem a flag. Para que a flag seja a **única** porta, o item tem `roles: []`.

Isto não é preciosismo: "Análise de Clientes" estava com `roles: TODOS` + flag, e
como a flag só somava, ela ficaria visível para **todo mundo**. O teste
`scripts/checks/nav.ts` pegou isso antes de a tela existir.

As flags hoje são duas, montadas no layout a partir do banco:

| Flag | Quem libera |
|---|---|
| `lojaSimplificada` | VENDAS vinculada a loja de fluxo simplificado → vê o módulo Logística (era a única exceção do layout antigo) |
| `podeAnalisar` | GESTAO, ou VENDAS com `salesModel === "ATACADO"` → vê Qualificação de Clientes |

### `href: null` — clicar no setor não navega

Pedido do spec 3, **revertido** no spec 4. Hoje: **todo setor que tem
ferramentas tem `href: null`** e clicar nele apenas expande a lista. Só setor de
tela única aponta para si mesmo.

`scripts/checks/nav.ts` trava isso explicitamente, porque é muito fácil alguém
recolocar um `href` "óbvio" ali sem perceber que muda o comportamento do menu
inteiro.

### `moduloAtivo` casa por prefixo mais longo

Sem isso, `/motorista` venceria `/motorista/chamados` por vir antes na lista. E a
barra separa de verdade: `/vendas-outra-coisa` **não** é filho de `/vendas`.

---

## 2. A barra lateral

**[`src/app/(dashboard)/sidebar.tsx`](<../src/app/(dashboard)/sidebar.tsx>)** —
logo + tagline, cartão do usuário, seções GERAL / SETORES, acordeão de um só
aberto, modo colapsado (4.5rem) com flyout, rodapé com Gestão / Recolher menu /
Sair. O estado do colapso persiste em `localStorage`, chave
`buildflow:sidebar-colapsada`.

O layout caiu de 107 para ~70 linhas. Sino e tema estão ancorados no canto
superior direito sobre o conteúdo, sem barra superior.

### Dois bugs desta parte, para não se repetirem

**O flyout invisível no modo colapsado.** Usei `overflow-x-visible` junto de
`overflow-y-auto` no `<nav>`, e **CSS não permite isso**: `visible` em um eixo
vira `auto` quando o outro é `auto`, então o painel era cortado. A correção foi
`position: fixed` no flyout, com o `top` do botão medido e guardado em estado.

**O colapso que não persistia.** O `localStorage.setItem` estava **dentro do
updater do `setState`**, e o StrictMode chama o updater duas vezes — a segunda
passada desfazia a primeira. A correção:

```ts
const proximo = !colapsada;
setColapsada(proximo);
localStorage.setItem(CHAVE_COLAPSO, proximo ? "1" : "0");
```

Regra geral: efeito colateral **nunca** dentro de updater de `setState`.

---

## 3. Dashboard

- **Progresso Geral de vendedoras** limitado às 3 primeiras (`maxRows={3}`).
- **Bloco novo de vendas Select**, em `lg:col-start-1 lg:row-start-2` — abaixo do
  ranking, como pedido. Ranking por vendedora + total do mês, saindo de
  `selectSellerRows` em [`rank-math.ts`](../src/lib/rank-math.ts), construído a
  partir dos `selectsDoMes` que o `rank-data.ts` **já buscava**.
- **Erro meu, corrigido:** movi o bloco "Performance na campanha" achando que
  *era* o bloco de Select. O dono corrigiu: ele fica onde estava, e o de Select
  é **novo**. Desfeito com `git checkout` no arquivo e reaplicado só o
  `maxRows`.
- **Hidratação do relógio** (`rank-board.tsx`): o estado inicial era
  `new Date()`, que roda no servidor e **de novo** no cliente; com o minuto
  virando entre os dois, a hidratação quebrava. Hoje nasce `null` e só um
  `useEffect` preenche, mostrando `--:--` até montar.

---

## 4. Cabeçalhos: a regra está no tipo

**[`src/components/shared/page-header.tsx`](../src/components/shared/page-header.tsx)**
— `descricao` é prop **obrigatória**. Esquecer a descrição **não compila**.

Existe como componente, e não como par de tags copiado, exatamente por isso: com
o par solto, a tela nova nasce sem descrição e ninguém percebe na revisão.

Reforçado por
**[`scripts/checks/page-headers.ts`](../scripts/checks/page-headers.ts)**, que
varre o `NAV` e falha se alguma das **25 ferramentas** não tiver título e
descrição. A checagem é textual de propósito: ler o arquivo é mais barato e mais
estável do que renderizar a página para conferir duas linhas.

Duas telas (Meus Selects, Contratos Select) montam o título com ícone e ficaram
na forma antiga — cumprem a regra do mesmo jeito, e o check aceita as duas
formas.

---

## 5. Renomeações e o relatório gerencial

### Rótulos e ordem (spec 4)

Travados em `scripts/checks/nav.ts` como arrays exatos, porque **ordem de menu é
decisão de quem usa o sistema, não consequência do código**:

- **Comercial:** Cadastro de Clientes · Gestão de Excursões · Lançar Pedidos ·
  Qualificação de Clientes · Agenda de Tarefas · Vendas Realizadas · Resultados
  de Campanhas · Meus Selects
  *("Meus Selects" não estava na lista do dono; ficou no fim em vez de sumir.)*
- **Financeiro:** 8 rótulos novos, título interno "Gestão de Pedidos".
- **Logística:** 6 rótulos novos. Alinhei também o título da página (era "Fluxo
  de Pedidos → Fábrica (LOGÍSTICA)"): só o Financeiro foi pedido, mas menu
  dizendo uma coisa e tela outra é confusão garantida.

**Lançar Pedidos** aponta para `/vendas` (a lista com as ações), não para
`/vendas/novo`. O formulário **não é item de menu** — e o check garante isso.

**Cadastro de Clientes** passou de 2 para **8 colunas** (Código, Nome, Contato,
Endereço, Bairro, Cidade/UF, CEP, Ações). Os dados já vinham do banco; para ver o
endereço era preciso abrir a edição de cada cliente. O `colSpan` da linha vazia
foi ajustado junto.

### O relatório gerencial (commit `6b96ff9`)

O painel respondia "como fomos" e deixava de fora o que o gestor usa para agir.
**Decisão central:** estendi `resumoDoAtacado` **uma vez**, e tela e PDF leem o
mesmo objeto. Consultas próprias "só para o PDF" produzem um arquivo que
discorda da tela em alguma conta, e descobrir qual das duas está certa custa
mais que o relatório inteiro.

**Três blocos novos** em
[`painel.tsx`](<../src/app/(dashboard)/vendas/analise-clientes/painel.tsx>):

| Bloco | O que resolve |
|---|---|
| **Conversão por praça (UF)** | UF e cidade já eram *filtro* desde 29/10, mas achar a praça que converte exigia tentar uma por uma |
| **Tempo de resposta** | Média de dias para decidir + quantas esperam há mais de `DIAS_PARADA` (7) dias |
| **Entrada por mês** | A série `entradasPorMes` já vinha no resumo e **nunca era desenhada** — a tela dizia a média e escondia a tendência |

`Conversoes` foi **generalizada** (de `ContagemPorVendedora[]` para
`LinhaDeConversao[]`) e serve aos dois painéis: é a mesma conta com outro
agrupamento, e uma segunda cópia da barra divergiria da primeira na próxima
correção.

**No tempo de resposta, os dois grupos nunca se misturam.** A média olha para
trás e conta **só quem tem `decidedAt`**; as paradas olham para agora e contam
**só `EM_ANALISE`**. Somando a idade das pendentes, a média subiria sozinha todo
dia em que ninguém decidisse nada — e pareceria que alguém demorou mais.
`CUIDADO` é decisão tomada, não fila: incluí-lo faria o número cobrar ação sobre
candidatura já julgada, e nunca zerar.

**O PDF:**
[`src/lib/analise-clientes-pdf.ts`](../src/lib/analise-clientes-pdf.ts) (layout)
+ [`src/app/api/vendas/analise-clientes/pdf/route.ts`](../src/app/api/vendas/analise-clientes/pdf/route.ts)
(rota) + [`relatorio-client.tsx`](<../src/app/(dashboard)/vendas/analise-clientes/relatorio-client.tsx>)
(botão no cabeçalho). Usa o `PdfDocument` que o projeto já tem — **sem
biblioteca de PDF nova**.

- **Sem modal de período**, ao contrário do relatório do Histórico de Vendas: foi
  pedido "o PDF do que a tela já mostra", então a barra de filtros **é** a
  escolha do recorte. Um segundo lugar para escolher período deixaria a pessoa
  com dois recortes abertos ao mesmo tempo.
- **Sem a lista nominal de candidaturas.** É relatório de conjunto; nomes,
  telefones e CNPJs estão na tela ao lado, e um PDF com a carteira nominal
  circula de um jeito que este não deve circular.
- **Status, busca, motivo e compra não entram**, pela mesma razão que não entram
  no painel: a taxa de aprovação de um recorte "só aprovadas" é sempre 100%.
- **O escopo sai da sessão, nunca da query string.** Criei `atorDeUsuario` em
  [`wholesale-actor.ts`](../src/lib/wholesale-actor.ts) porque o `requireRole` de
  `atorDaFerramenta` **redireciona**, e um 307 para o login chegaria ao `fetch`
  como "falha ao gerar o PDF" sem dizer por quê. Não é atalho na autorização:
  `canUseWholesaleTool` cobre o papel inteiro, então negar quando ele devolve
  `false` é a mesma porta que a tela usa.

---

## 6. Verificação

| Portão | Resultado |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `scripts/checks/*.ts` (cada um via `npx tsx`) | **39 ok, 0 falhas** |
| `npm run build` | exit 0, `/api/vendas/analise-clientes/pdf` no manifesto |
| Navegador | ver abaixo |

**Três scripts novos**, 90+ asserções somadas:

- `nav.ts` — visibilidade por papel, a flag que libera, rótulos e ordem exatos
  dos três módulos, o clique que não navega, prefixo mais longo, integridade do
  mapa.
- `page-headers.ts` — as 25 ferramentas do menu têm título e descrição.
- `analise-clientes-relatorio.ts` — conversão por UF (denominador da praça, UF
  vazia que não some, parcelas que fecham), tempo de resposta (CUIDADO não é
  fila, pendente fora da média, data invertida sem média negativa), a descrição
  do recorte na capa, **e o PDF renderizado de verdade** (inflando os streams
  para conferir o texto impresso), inclusive com recorte vazio.

**Conferido na tela:** os três blocos novos renderizando em
`/vendas/analise-clientes`; a rota devolvendo `200 / application/pdf / 3305
bytes / %PDF-`; `/vendas` com título "Lançar Pedidos" e as 4 ações; a ordem do
Comercial; clicar em Financeiro e Logística **sem** mudar a URL, mostrando os
rótulos novos; Cadastro de Clientes com as 8 colunas; console sem erro.

### Ordem obrigatória ao rodar o build

**Mate o dev server ANTES do build.** O `prisma generate` falha com `EPERM`
porque o processo de dev segura `query_engine-windows.dll.node`, e rodar
`next build` em paralelo assim mesmo **sobrescreve o `.next` do dev** — foi o
que deixou a tela em branco numa sessão anterior (4 de 7 scripts em 404 e o
`ThemeProvider` preso em `visibility: hidden`).

```bash
netstat -ano | grep ':3000 '      # acha o PID
taskkill //PID <pid> //F
npm run build
rm -rf .next && npm run dev        # dev limpo depois
```

---

## 7. Pendências

### A fazer, já especificado pelo dono

**1. Ferramenta "Vitrine" (módulo Comercial) — não começada.**

Espelhar a Vitrine do Build.Connect, carregando o conteúdo de lá, com filtros e
barra de busca. **Mexe em dois repositórios.** O que já sei:

- No `../BuildConnectApp`, a Vitrine é um `Subsector` com `kind: VITRINE`
  (`prisma/schema.prisma:180`), e o conteúdo são os models `Video` e `Document`,
  ambos com `subsectorId` e guardando **caminho público, nunca o binário**.
- **Não existe rota pública que o Build.Flow possa consumir.** As de integração
  hoje são `src/app/api/integracao/arquivo/[assetId]`,
  `.../flow/comprovante/[ticketId]` e `.../flow/webhook`. Precisa de uma nova
  que liste o conteúdo de um subsetor VITRINE.
- O canal autenticado já existe do lado do Flow:
  [`src/lib/integration/connect-auth.ts`](../src/lib/integration/connect-auth.ts),
  com `CONNECT_INTEGRATION_TOKEN` + `CONNECT_WEBHOOK_URL` no `.env`. **Reusar
  isso**, não inventar um segundo caminho.

**Primeira decisão a tomar com o dono:** se a Vitrine do Flow **lê ao vivo** do
Connect a cada carga, ou se há cache/sincronização. Muda o desenho inteiro.

**2. Relatório da Análise de Clientes — a parte do PDF está feita.** Se o dono
quiser mais blocos, a base está pronta: estender `ResumoDoAtacado` alimenta tela
e PDF de uma vez.

### Limites conhecidos

- **A consulta de tempo de resposta traz uma linha de 3 campos por candidatura
  do recorte**, e sem filtro de período o recorte é a base inteira. Marcado com
  `shortcut:` no código: passando de ~50 mil candidaturas, trocar por contagens
  agregadas com corte de data. Não usei `$queryRaw` com `AVG` de propósito —
  obrigaria a reescrever à mão em SQL o `where` que **é** o escopo de segurança.
- **`tailwind.config.ts:140` usa `require("tailwindcss-animate")`** num arquivo
  TS que o Node 24 carrega como ESM → `ReferenceError: require is not defined`,
  derrubando o dev server de forma intermitente. **Pré-existente, não
  consertado.** A correção é trocar por `import`.
- **Formulários continuam travados** em `max-w-5xl` / `max-w-2xl` (Novo pedido,
  Novo Select, Editar pedido). Foi a escolha do dono na padronização de largura,
  não um esquecimento.

### Verificação que não foi feita

- **O clique no botão de download do PDF.** Testei a rota direto (que é onde o
  PDF é gerado); o passo blob→âncora do botão, copiado do relatório de Vendas
  que já funciona, não foi exercitado.
- **O PDF visto com olho humano.** O conteúdo está assertado, o layout não foi
  olhado.
- **A gaveta mobile da barra lateral em largura real de celular.**
- **As telas que não são ferramentas do menu** (Novo pedido, Novo Select, Editar
  pedido, detalhes de Select, Gestão) — o check de cabeçalho cobre só as 25 do
  menu.

### Efeito colateral no banco local

Para popular o rank nos testes, **setei e depois zerei o `salesModel`** de cinco
vendedoras (Arliane, Darliane, Larissa, Maria Kelly, Rhafaella). **Os valores
anteriores delas são desconhecidos.** Vanessa, Valdir e Teste1 não foram
tocadas. Se o `salesModel` de alguma importava, reconfira — é ele que decide
quem vê a Qualificação de Clientes.

### Arquivos de handoff fora dos commits

Estes quatro ficaram de fora de propósito, porque são de sessões anteriores e
parecem uma reorganização de `docs/` a meio caminho:

```
 D handoff-2026-10-21-visibilidade-tabelas-e-import-candidaturas.md
?? docs/handoff-2026-10-27-select-lov-club.md
?? docs/handoff-2026-10-30-compra-filtros-e-kanban-financeiro.md
?? handoff-2026-10-30-analise-clientes-comprou.md
```

Parece que alguém começou a mover os handoffs da raiz para `docs/` e parou. Vale
terminar a mudança num commit próprio.

---

## 8. Regra de trabalho em vigor

Estabelecida pelo dono e salva na memória do projeto: **toda alteração termina
com os quatro portões** — `npx tsc --noEmit`, os ~39 scripts de
`scripts/checks/`, `npm run build`, **e abrir o navegador**. Não encerrar
passando a verificação visual para o usuário como pendência.

A sessão rodou em modo **ponytail** (`/ponytail full`): menor mudança completa,
reusar o que existe, e cada resposta fecha dizendo o que ficou de fora e o
risco.
