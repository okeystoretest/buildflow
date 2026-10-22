# Handoff — 21/10/2026 — Visibilidade das tabelas + importação de candidaturas

Sessão em modo "ponytail" (menor mudança que resolve por inteiro).

**Commitado e enviado em 22/10:** `19104aa` em `master`
(`origin/master` atualizado). O commit carrega também a **conversão por
vendedora no painel**, que estava na árvore de trabalho sem commit desde
ANTES desta sessão e ocupa as mesmas regiões dos três arquivos do dashboard —
não havia como separar por arquivo. `Resumo 19_10 - sessao 7.md` continua
fora do controle de versão, como estava.

**Pendência que bloqueia o uso:** a migração do Prisma **não foi aplicada**.
Ver [Antes de qualquer coisa](#antes-de-qualquer-coisa-no-próximo-chat).

**O banco local foi esvaziado (22/10).** As 657 candidaturas de
`WholesaleLead` foram apagadas a pedido, com backup — ver
[Exclusão da base](#exclusão-da-base-2210).

---

## 1. Contraste do texto e dos cabeçalhos (todo o sistema)

**Pedido:** aumentar a visibilidade do texto e dos cabeçalhos, principalmente
nas tabelas.

**O que mudou** — dois lugares, não os 475 usos:

- `src/app/globals.css`: o token `--muted-foreground` subiu de contraste nos
  dois temas (claro 45% → 36% de luminosidade, escuro 60% → 70%). É a cor de
  quase todo texto secundário: cabeçalho de tabela, rótulo, legenda e as
  perguntas da ficha da cliente. Estava **reprovado em WCAG AA** (4,06:1 sobre
  `bg-secondary` no tema claro; o mínimo é 4,5:1). Agora: 5,67:1 claro e
  6,52:1 escuro. Só a luminosidade mudou — hue e saturação intactas, mesma
  convenção que o arquivo já usava para as cores de setor.
- Os **19 `<thead>`** do sistema passaram de `text-muted-foreground` para
  `text-foreground` (10,8:1). Cabeçalho é rótulo estrutural, não texto
  secundário. Não foi adicionado `font-semibold`: `th` já é negrito por padrão
  e o preflight do Tailwind não reseta isso — a classe não teria efeito.

## 2. Tabela fechada (substituiu uma tentativa de degradê)

A primeira tentativa foi um degradê no cabeçalho; **foi rejeitada** ("não ficou
muito bom") e removida. O que ficou, em `globals.css` (4 declarações, dentro de
`@layer base`):

```css
table { border: 1px solid hsl(var(--border)); }
th, td { border: 1px solid hsl(var(--border)); }
thead { background-color: hsl(var(--secondary)); }
```

Descoberta relevante: três telas (Pedidos, Candidaturas, Select) já tinham as
linhas verticais na mão (`border-r border-border`, 59 usos) e as outras nove
não — era por isso que algumas tabelas pareciam "abertas". Agora é uniforme; as
classes antigas continuam válidas e redundantes (`border-collapse: collapse`
funde as duas em uma linha só).

Para isso valer nas 12 tabelas, foi preciso **remover o fundo próprio de três
`<thead>`** (`bg-card` no Rank, `bg-secondary/50` no Financeiro e no histórico
do motorista): utility do Tailwind vence regra de `@layer base`, e essas três
ficariam fora do padrão. O `secondary` é opaco, que é o que o cabeçalho
`sticky` do Rank exige.

**Se quiser ajustar:** cabeçalho sem fundo = apague o bloco `thead`; grade só
horizontal = apague `th, td`.

## 3. Motivo da reprovação: da célula para o clique

**Pedido:** tirar o motivo de reprovação exposto na linha e mostrá-lo só sob
interação. Primeiro foi feito com `title` nativo; **foi rejeitado** (lento, não
existe no toque, inalcançável por teclado) e trocado por clique.

- **Novo:** `src/app/(dashboard)/vendas/analise-clientes/lead-status-cell.tsx`
  — clique no chip "Reprovado" abre uma bolha compacta com
  `Motivo: XX — rótulo`. Fecha ao clicar de novo, clicar fora, `Esc` ou rolar.
  O alvo é um `<button>`: foco, Enter/Espaço e leitor de tela vêm de graça.
- **Apagado** em `page.tsx`: o garfo `status === "REPROVADO"` que trocava as
  colunas Auxiliar/Vendedora pelo motivo via `colSpan`. Saiu mais código do que
  entrou (−45/+38).

**Duas decisões que não são óbvias:**

- `position: fixed`, não `absolute`: a tabela vive num `overflow-x-auto`, e
  quando um eixo do overflow deixa de ser `visible` o outro também para de ser
  — o contêiner recorta nos dois lados e uma bolha `absolute` apareceria
  cortada. O preço do `fixed` é que a posição vem do `getBoundingClientRect` no
  clique; por isso ela **fecha ao rolar** em vez de recalcular.
- A bolha usa `bg-card`, não o token de popover. **`--popover` existe no
  `globals.css` mas nunca foi mapeado no `colors` do `tailwind.config.ts`** —
  uma utility sobre token não mapeado não gera regra nenhuma, e a bolha saiu
  transparente, sem erro de build e sem aviso. `--card` tem valor idêntico nos
  dois temas e está mapeado. **Isso continua pendente como decisão** (ver
  abaixo).

## 4. Importação das candidaturas da planilha antiga

**Pedido:** botão que importe a planilha histórica + o modelo da planilha.

### O modelo

27 colunas, as atuais do cadastro. Gerado por `modeloCsv()` e pelo botão
"Baixar modelo" dentro do sistema. Separador `;` e BOM — sem isso o Excel
pt-BR empilha tudo numa coluna e quebra os acentos.

```
marca;data_recebimento;nome;email;telefone;cnpj;instagram;cidade;uf;
modelo_atendimento;modelo_atendimento_outro;historia;tempo_mercado;
tamanho_equipe;marcas_que_trabalha;como_nos_achou;como_nos_achou_outro;
tempo_que_segue;faixa_investimento;quer_visita;status;motivo_reprovacao;
motivo_cuidado;atendente;auxiliar;decidido_por;data_decisao
```

**`atendente` é a VENDEDORA DONA** (alterado em 22/10, a pedido): aceita nome
ou e-mail e **vincula de verdade** (`sellerId`) — a candidatura passa a
aparecer na lista daquela vendedora e nos filtros por vendedora. O nome é
casado ignorando acento, caixa e espaço duplo. Nome que não existe, ou que
existe em duas pessoas, **recusa a linha** dizendo isso (no segundo caso,
pedindo o e-mail para desempatar): candidatura histórica gravada sem dona
sumiria da conferência de todo mundo. A coluna `vendedora_email` deixou de
existir — virou redundante. `auxiliar` é a coluna nova que alimenta a
"Auxiliar" da lista: texto livre, em maiúsculas, sem vínculo.

Só `marca` e `nome` são obrigatórios; o resto em branco fica em branco. As duas
imagens do formulário não têm coluna (são upload, não célula) — a ficha já
exibe "Imagem não disponível".

**É CSV, não .xlsx.** O projeto não tem parser de `.xlsx` e colocar um seria
dependência permanente no app para um uso só. O Excel abre, edita e salva CSV.
Se `.xlsx` for exigência, é dependência nova — decidir antes de implementar.

### O código

| Arquivo | Papel |
|---|---|
| `src/lib/wholesale-import.ts` (novo) | Puro: colunas, mapa de cabeçalho, validação linha a linha. Sem banco. |
| `src/lib/actions/import.ts` | `importWholesaleLeadsCsv` — só o que exige banco (resolver e-mail → id, gravar). Reusa o `parseCsv` que já existia. |
| `analise-clientes/page.tsx` | `<CsvImport>` no card da lista, **só Gestão**. |
| `src/components/shared/csv-import.tsx` | O modelo passou a sair com `;` e BOM (vale para os 4 importadores do sistema). |
| `scripts/checks/wholesale-leads-import.ts` (novo) | 48 asserções. |

Comportamento: cabeçalho lido **por nome**, não por posição (quem preenche no
Excel reordena coluna sem perceber). Linha ruim não derruba o lote — cada
recusa aparece com o número da linha do Excel. CNPJ repetido **não é erro** (o
schema registra que repetição é informação, não erro — é ela que alimenta o
aviso da ficha); a importação só conta quantos repetem e avisa.

### Reimportar ATUALIZA, não duplica (22/10)

A importação virou `upsert` por `importKey` — uma coluna nova, nula para quem
veio do formulário público e preenchida só nas importadas. A chave sai do
conteúdo, porque a planilha não tem id: `planilha:<marca>:cnpj:<cnpj>`, caindo
no telefone e depois no nome normalizado quando não há CNPJ
(`chaveDeImportacao`). Consequências:

- Reimportar o arquivo corrigido atualiza as linhas que casam e cria as novas.
  O relatório separa "cadastrado" de "atualizado".
- Uma importação **nunca** sobrescreve cadastro do formulário: a chave dele é
  nula, e o prefixo `planilha:` só existe na importação. CNPJ que coincide com
  um cadastro real entra como candidatura nova e vira aviso de repetição.
- Célula de data vazia não apaga a data já gravada.
- `shortcut:` registrado em `chaveDeImportacao`: duas pessoas sem CNPJ e sem
  telefone, com o mesmo nome e a mesma marca, colapsam numa só.

A coluna e o índice único entraram **na mesma migração pendente** (ela nunca
foi aplicada, conferido no `_prisma_migrations`), em vez de virar uma segunda.

### Dashboard: "Reprovações por motivo" (22/10)

O bloco "Últimas candidaturas" do painel virou a contagem de reprovações por
motivo — a lista das últimas já está inteira e filtrável na tela ao lado.
`agrupaPorMotivo` é pura e conferida em `scripts/checks/wholesale-dashboard.ts`
(ordem, empate desempatado pelo código, motivo nulo visível como "Sem código",
código fora da taxonomia, parcelas fechando com o total). O percentual é sobre o
total de REPROVAÇÕES, não sobre o recebido. A consulta de `recentes` caiu de
`take: 10` para `take: 1`: só o KPI da última candidatura ainda a lê.

### A migração (o que ainda não foi aplicado)

`prisma/migrations/20261021120000_wholesale_lead_import/` torna **nulos** cinco
campos de `WholesaleLead`: `serviceModel`, `storeImageKind`, `foundUs`,
`investmentBand`, `wantsVisit`.

Por quê: a planilha antiga não registrava essas respostas, e elas eram
obrigatórias no banco. Não foi usado o valor `OUTRO` que dois dos enums já
têm — "Outro" é uma **resposta**, e a ficha diria à analista que a lojista
respondeu isso quando ninguém perguntou nada. A faixa de investimento seria a
pior: é numérica e entraria em qualquer leitura por faixa como se fosse
declarada. `wantsVisit` não tem nem esse recurso — `false` leria como "não quer
visita".

O formulário público **continua exigindo as cinco** (`validateApplyPayload` não
mudou): o nulo é exclusivo de quem veio pela importação. `DROP NOT NULL` não
altera nenhuma linha existente — reversível e sem perda.

O `decision-modal.tsx` foi ajustado para os cinco nulos: `rotulo()` devolve "—"
em vez de nada, `wantsVisit` virou três estados, e o rótulo da foto deixa de
afirmar qual foto foi pedida quando não houve formulário.

---

## Antes de qualquer coisa no próximo chat

```bash
npm run prisma:migrate   # aplica a migração — SEM ISSO a importação quebra em runtime
npx prisma generate      # falhou com EPERM: DLL travada pelo next dev rodando
```

Os **tipos** do Prisma foram regerados (conferido em
`node_modules/.prisma/client/index.d.ts`, e é por isso que o `tsc` passa); só o
binário do engine não. Pare o dev server antes de rodar.

## Verificação (tudo verde no fim da sessão)

```bash
npx tsc --noEmit
npx tsx scripts/checks/wholesale-leads-import.ts   # 48 asserções
npx tsx scripts/checks/cor-de-setor.ts             # contraste + guardas
npx tsx scripts/checks/wholesale-apply-validation.ts
npx tsx scripts/checks/wholesale-rejection-codes.ts
npx tsx scripts/checks/wholesale-permissions.ts
```

A checagem de contraste ganhou três guardas novas, todas testadas com regressão
proposital:

1. `--foreground` e `--muted-foreground` medidos contra `bg-secondary` (a
   superfície mais difícil dos dois temas).
2. Nenhum `<thead>` com cor ou fundo próprio (tira a tabela do padrão sem erro
   nenhum aparecer).
3. Nenhuma classe `-popover` (token não mapeado = elemento transparente).

A checagem da importação pegou **dois defeitos reais** durante a escrita, e os
dois seguem cobertos:

- o código de reprovação é `"01"`, não `"1"` — e o **Excel come o zero à
  esquerda**, então todo motivo digitado à mão seria recusado e pareceria
  importação quebrada. Hoje `1` casa com `01`.
- `31/02/2026` virava `03/03` em silêncio (comportamento do `Date`). Hoje é
  recusado.

## Exclusão da base (22/10)

A pedido, as **657 candidaturas** do banco local foram apagadas: 3 eventos de
decisão e 14 chamadas de remoção de arquivo (2 fotos existiam de fato no
disco). A tela de Análise de Clientes está vazia.

Foi usada a rotina da casa, `apagarCandidatura` (a mesma da exclusão manual da
Gestão e do expurgo de retenção), e não um `DELETE` cru: ela tira as fotos, os
eventos e a linha numa transação por candidatura.

**Backup** (JSON com os eventos aninhados + as fotos) ficou na pasta temporária
da sessão, `scratchpad/backup-candidaturas-2026-10-22/`. **Ela some.** Se o
histórico importava, ele já se perdeu ou precisa ser recuperado de outro lugar.
Não foi guardado dentro do projeto de propósito: são dados pessoais (nome,
e-mail, telefone, CNPJ) e um commit acidental viraria vazamento. Não existe
rotina para restaurar esse JSON — teria de ser escrita.

Antes disso houve um pedido de "zerar os dados importados" que **não foi
executado**: não havia nada importado (a migração nunca rodou), e o critério
óbvio — candidatura sem imagem — casava com 650 das 657. Executado, teria
destruído a base inteira. Foi esse episódio que motivou a `importKey`.

## Pendente / decisões em aberto

1. **Aplicar a migração** (acima). Bloqueia o uso da importação.
2. **`--popover` e `--popover-foreground`**: declarados no `globals.css`, não
   mapeados no `tailwind.config.ts`. As duas saídas resolvem — mapear ou apagar
   as variáveis. Enquanto ninguém decide, a checagem barra o uso da classe.
   **Atenção:** qualquer componente shadcn instalado depois (popover, dropdown,
   tooltip) usa `bg-popover` de fábrica e entraria transparente pelo mesmo
   motivo.
3. **Nada foi visto na tela.** Nenhuma das quatro entregas foi aberta no
   navegador — nem a grade das tabelas, nem a posição da bolha nas bordas do
   viewport, nem a importação de ponta a ponta com banco. A validação pura está
   coberta por script; o resto não.
4. **`.xlsx`**: se for exigência, precisa de dependência nova (decidir o custo).
5. **59 `border-r border-border`** agora redundantes nas três tabelas antigas.
   Zero efeito visual, 59 edições — deixados de propósito.
6. **Importação não tem desfazer.** Se a planilha vier errada, a remoção é
   manual, candidatura por candidatura. Testar com 2–3 linhas antes do lote.
7. **`status` em branco** joga tudo para "Em análise", e aí candidatura antiga
   entra na fila de trabalho de hoje. Preencher o status na planilha. Os
   valores fechados aceitam acento, espaço e minúscula ("Em análise" ==
   `EM_ANALISE`) — corrigido em 22/10, junto com a assertiva.
8. **A bolha fecha ao rolar** — certo para rolagem de verdade, mas dispara
   também se algo rolar sozinho (um `scroll into view` de foco). Se aparecer
   sumindo sem motivo, o conserto é reposicionar em vez de fechar.
9. **Nenhuma dívida `shortcut:` nova foi deixada.** O único `shortcut:` que
   chegou a existir (o do `title` nativo) saiu junto com a abordagem que foi
   trocada. A única dívida registrada no projeto continua sendo a de
   `src/lib/wholesale-retention.ts` (retenção de 90 dias), anterior a esta
   sessão.

## O que no commit NÃO é desta sessão

Para não atribuir errado no próximo chat, `19104aa` também leva:

- **Conversão por vendedora no painel** (`agrupaPorVendedora`,
  `ContagemPorVendedora`, o componente `Conversoes` e as checagens dela), em
  `src/lib/wholesale-dashboard.ts`, `scripts/checks/wholesale-dashboard.ts` e
  `analise-clientes/dashboard/page.tsx`. Estava na árvore sem commit quando a
  sessão começou, nas mesmas regiões que as mudanças de hoje.
- A remoção de três `handoff-*.md` antigos, apagados antes da sessão.

## Arquivos desta sessão

**Novos**
- `src/lib/wholesale-import.ts`
- `scripts/checks/wholesale-leads-import.ts`
- `src/app/(dashboard)/vendas/analise-clientes/lead-status-cell.tsx`
- `prisma/migrations/20261021120000_wholesale_lead_import/migration.sql`

**Modificados**
- `prisma/schema.prisma`
- `src/app/globals.css`
- `src/lib/actions/import.ts`
- `src/components/shared/csv-import.tsx`
- `scripts/checks/cor-de-setor.ts`
- `src/app/(dashboard)/vendas/analise-clientes/page.tsx`
- `src/app/(dashboard)/vendas/analise-clientes/decision-modal.tsx`
- Os 13 arquivos com `<thead>`: `dashboard/rank-board.tsx`,
  `financeiro/paineis-client.tsx`, `financeiro/select/page.tsx`,
  `gestao/planos-panel.tsx`, `gestao/tabs-client.tsx`,
  `logistica/metricas/page.tsx`, `motorista/chamados/historico/page.tsx`,
  `vendas/clientes/manager-client.tsx`, `vendas/excursoes/manager-client.tsx`,
  `vendas/page.tsx`, `vendas/relatorio-campanha/page.tsx`,
  `components/shared/crud-table.tsx`
