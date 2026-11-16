# Acompanhamento Gerencial, Metas por Loja e Formulários de Acompanhamento

Desenho de 13/11/2026. Fonte: pedido do dono + planilha
`Acompanahmento Gerencial - FLOW.xlsx` (3 abas, 2 gráficos embutidos).

## Intenção

Hoje a Gestão mede meta **só por vendedora** (`SalesGoal`), e mede num lugar só
— o Ranking de Vendas, que é um telão de disputa. Falta a leitura gerencial:
como a **loja** está contra o alvo dela, mês a mês no ano, e o registro escrito
das conversas de acompanhamento com cada vendedora. A planilha é exatamente
esse trabalho feito à mão, e é ela que define o que a tela deve mostrar.

### Objetivos

1. Uma ferramenta em **Comercial** que entregue, em tela, o que a aba
   "Acompanhamento Gerencial" da planilha entrega: grade Jan→Dez da loja e das
   vendedoras, painel individual com % da meta e P.A., e os dois gráficos.
2. **Meta por Loja de Origem** em Gestão > Metas, apurada pelas vendedoras
   vinculadas à loja.
3. **One-on-One** e **Acompanhamento Quinzenal** como formulários gravados, com
   histórico por colaborador.

### Não-objetivos

- Não substituir o Ranking de Vendas nem mudar como ele calcula.
- Não exportar PDF/Excel (não foi pedido).
- Não criar meta de loja por campanha — campanha segue por vendedora, em itens.
- Não mexer na segunda Loja de Origem: ela continua existindo só para o
  acompanhamento de pedidos, como hoje.

### Anti-objetivo

Um painel que mostre um realizado **diferente** do que o resto do sistema mostra
sem a tela dizer por quê. Dois números de faturamento que não fecham destroem a
confiança nos dois.

## Decisões do dono (13/11/2026)

| Pergunta | Resposta |
|---|---|
| Qual é a "primeira" Loja de Origem? | **Campo explícito.** Estrela em Gestão > Usuários marca a loja principal. |
| Meta da loja × metas individuais | **As duas digitadas.** O painel mostra a soma das individuais ao lado da meta da loja e avisa a diferença. |
| One-on-One e Quinzenal | **Um registro com tipo.** Campos comuns compartilhados, histórico único por colaborador. |
| Acesso | **Tudo só para GESTAO.** |

## Abordagens consideradas

**De onde o painel tira o realizado do ano** — a decisão estrutural:

1. **Chamar `computeRankData` 12 vezes**, uma por mês. Correto por construção,
   mas cada chamada carrega os pedidos do mês com `include: seller`, mais
   contratos Select, mais campanhas: ~12 cargas pesadas por abertura de tela.
   Descartada por custo.
2. **Uma consulta do ano + as funções puras do rank** (`computeRealizado` e
   `vendidoDoVendedor`, de `rank-math.ts`), agrupando por mês em memória.
   3 consultas para o ano inteiro e **nenhuma regra de negócio duplicada**: o
   filtro de faturado, o valor sem frete e o ajuste manual incremental seguem
   definidos num lugar só. **Escolhida.**
3. **Tabela de consolidado mensal** (cache materializado). Resolve um problema
   de escala que não existe — dezenas de vendedoras, milhares de pedidos por
   mês — e cria um segundo lugar onde o número pode ficar velho. Descartada.

Para a opção 2, `FATURADO_WHERE` em `src/lib/rank-data.ts` deixa de ser `const`
privada e passa a ser exportada. É o ponto todo da escolha: se o critério de
"venda confirmada" mudar, muda para as duas telas juntas.

## Parte 1 — Comercial > Acompanhamento Gerencial

Rota `/vendas/acompanhamento`, item novo no NAV de Comercial com
`roles: ["GESTAO"]`, no fim da lista (a ordem das ferramentas é do dono). Três
abas internas, espelhando o arquivo: **Painel · One-on-One · Quinzenal**.

### Filtros

Instantâneos, via `useFilterQuery`, como em Logística > Métricas:
`Ano` · `Loja de Origem` · `Vendedora` (foca o painel individual) · `Escopo`
(Varejo/Atacado). O recorte de período é o próprio ano com as 12 colunas
mensais; não há seletor de datas livre, porque meta é mensal e um recorte de
17/03 a 09/05 não tem meta contra a qual comparar.

### Bloco 1 — Grade anual (a metade esquerda da planilha)

Linhas: `Meta da Loja` (digitada) · `Realizado da Loja` · `Soma das Metas
Individuais` · uma linha por vendedora vinculada. Colunas: Jan→Dez + Total.

### Bloco 2 — Painel individual (a metade direita)

Uma linha por mês da vendedora selecionada: `Meta`, `Atingido`, `% da Meta`,
`P.A.`, `vs. mês anterior`.

- **P.A.** = Σ `Order.itemCount` ÷ nº de pedidos faturados no mês (peças por
  atendimento). Na planilha é digitado à mão; aqui é derivado. Sem pedido no
  mês mostra `—`, nunca `0`.
- **`vs. mês anterior`** compara o realizado com o realizado do mês anterior.
  **Na planilha a coluna com esse nome calcula `(ATINGIDO−META)/META`**, que é
  progresso da meta: o mesmo número da coluna ao lado, menos 1. Corrigido aqui
  de propósito, porque a coluna `% da Meta` já diz a outra coisa.

### Bloco 3 — Gráficos

Dois, como os embutidos na planilha:

1. **Colunas agrupadas** — realizado por vendedora, mês a mês, com a meta
   individual como linha de referência.
2. **Linha** — Meta × Atingido por mês da vendedora selecionada.

SVG à mão em `src/components/shared/mini-charts.tsx`, não biblioteca nova: o
projeto não tem nenhuma, os dois gráficos são estáticos, e os tokens de cor por
setor (claro/escuro) já existem. Rótulos acessíveis em `<title>`, sem JS.

### População, e a divergência com o Ranking

O **realizado da loja soma todas as vendedoras cuja loja principal é aquela,
tenham ou não meta individual no mês**; a linha de quem não tem meta aparece com
`s/ meta` no lugar do %. O Ranking faz o oposto — só entra quem tem meta, ver o
cabeçalho de `rank-math.ts` — então os dois totais podem divergir.

Escolhido assim porque este painel responde "quanto a loja faturou contra o alvo
da loja": uma venda real cuja meta a Gestão esqueceu de cadastrar não pode fazer
a loja parecer pior do que foi. **A tela diz isso em uma linha**, abaixo do
total, para ninguém descobrir a divergência sozinho. É a decisão mais fácil de
reverter deste documento, se o dono preferir o critério do Ranking.

## Parte 2 — Gestão > Metas por loja

### Schema

```prisma
// User
primaryOriginStore   OriginStore? @relation("UserPrimaryOriginStore", fields: [primaryOriginStoreId], references: [id], onDelete: SetNull)
primaryOriginStoreId String?

// Meta de faturamento da LOJA no mês. Independente das metas individuais.
model StoreGoal {
  id String @id @default(cuid())
  originStore   OriginStore @relation(fields: [originStoreId], references: [id], onDelete: Cascade)
  originStoreId String
  amount  Decimal @db.Decimal(12, 2)
  month   Int
  year    Int
  @@unique([originStoreId, month, year])
  @@index([month, year])
}
```

**Migração:** `primaryOriginStoreId` recebe a única loja de quem tem exatamente
uma (`UPDATE` a partir da tabela de junção, com `HAVING count(*) = 1`). Quem tem
duas fica nulo e a Gestão escolhe: não há como adivinhar, e adivinhar errado
joga o faturamento da pessoa na loja errada, em silêncio.

### Telas

- **Usuários:** na lista de Lojas de Origem já existente (máx. 2), uma estrela
  marca a principal. Com uma loja só, é marcada sozinha. A action valida que a
  principal está entre as selecionadas, e exige escolha quando há duas.
- **Metas:** bloco novo "Meta da Loja" acima do de vendedora — seleciona loja,
  valor e período (segue o período exibido do histórico, que já existe). A
  tabela lista, por loja: meta, soma das metas individuais das vendedoras
  vinculadas, a diferença, e quantas vendedoras entram na conta.

Actions novas em `src/lib/actions/goals.ts`: `setStoreGoal` (upsert pela chave
única) e `deleteStoreGoal`. `createUser` e `updateUser` em `management.ts`
passam a aceitar `primaryOriginStoreId`.

## Parte 3 — One-on-One e Acompanhamento Quinzenal

Um modelo, um tipo, campos comuns compartilhados — como a planilha descreve
campo a campo nas linhas "Instruções de Desenvolvimento".

```prisma
enum FollowUpKind   { ONE_ON_ONE, QUINZENAL }
enum FollowUpStatus { NAO_INICIADO, EM_ANDAMENTO, PRECISA_REVISAO, EM_ESPERA, ENTREGUE }

model FollowUp {
  id   String @id @default(cuid())
  kind FollowUpKind
  collaboratorId String       // vendedora acompanhada
  managerId      String       // quem preencheu (automático: usuário da sessão)
  heldOn   DateTime           // Data de Realização / do Feedback
  // comuns aos dois formulários
  strengths        String     // Reconhecimento e Pontos Fortes / Forças em Evidência
  improvement      String     // Oportunidades de Desenvolvimento / Ponto de Desenvolvimento
  collaboratorView String     // Perspectiva do Colaborador / Reflexão (frase)
  actionPlan       String     // Plano de Ação (Semanal / Definido)
  notes            String?    // Considerações Gerais / Observações
  // só One-on-One
  performance String?         // Métricas e Indicadores de Desempenho
  status      FollowUpStatus? // padrão NAO_INICIADO
  // só Quinzenal
  topic    String?            // Tema Central da Conversa
  support  String?            // Apoio Necessário
  reviewOn DateTime?          // Prazo de Reavaliação
  @@index([collaboratorId, heldOn])
  @@index([kind, heldOn])
}
```

Comportamento dos campos, como a planilha pede:

| Campo | Comportamento |
|---|---|
| Colaborador | Autocomplete que lista a partir de **5 caracteres** digitados. |
| Data | Preenchida com **hoje**, visível e editável. |
| Gestor Responsável pelo Suporte | **Automático**: o usuário da sessão. A planilha se contradiz aqui — a instrução de campo diz "nomear o líder", a de desenvolvimento diz "registro automático de quem preenche"; vale a de desenvolvimento, que é a especificação. |
| Status de Evolução | Dropdown com as 5 opções, padrão **Não Iniciado**. Só no One-on-One. |
| Prazo de Reavaliação | Data. A planilha diz "texto livre", mas é uma data e vai como data. |
| Demais | Texto livre. |

Cada aba: formulário de novo registro + lista dos registros (filtro por
colaborador e período), com edição e exclusão. Obrigatórios: colaborador, data e
os quatro campos comuns de conteúdo — `notes` é opcional, como "observações
complementares" indica.

## Regras e checagens

Módulo puro novo `src/lib/acompanhamento-math.ts` (grade anual, P.A., variação
mensal, diferença entre meta da loja e soma das individuais), com
`scripts/checks/acompanhamento-math.ts` no portão `npm run check` — a convenção
do projeto para regra de negócio pura. Casos cobertos: mês sem pedido (P.A.
`null`, não `0`), mês anterior zerado (variação `null`, sem divisão por zero),
vendedora sem meta (entra no realizado, sem %), loja sem meta (sem % de loja),
ajuste manual incremental coerente com o Ranking.

## Decisões de implementação (minhas, revisáveis)

Lacunas que a revisão do documento encontrou e que eu fecho sem mudar o que foi
decidido acima:

1. **"Soma das Metas Individuais"** usa só as metas **Gerais** (`campaignId`
   nulo), como o Ranking. Meta de campanha é em peças e não soma em R$.
2. **Sem loja selecionada** o painel mostra **todas as lojas somadas**: meta da
   loja = soma das metas de loja do mês, realizado = todas as vendedoras com
   loja principal definida.
3. **Vendedora sem loja principal** não entra em loja nenhuma. Gestão > Metas
   mostra um aviso contando quantas estão assim, com link para Usuários — senão
   o faturamento dela desaparece de todas as lojas em silêncio.
4. **Datas só-data** (`heldOn`, `reviewOn`) são gravadas à meia-noite do fuso do
   negócio via `instanteNoFuso` (`rank-window.ts`), nunca `new Date(texto)`: em
   servidor UTC a data escolhida voltaria um dia na exibição.
5. **Colaborador do formulário** é qualquer usuário **ativo** (a Gestão também
   acompanha quem não é vendedora); a busca ordena vendedoras primeiro.
6. **Meta de loja é upsert**: regravar a mesma loja/mês substitui o valor, não
   cria duplicata — é o que a chave única garante, e o que a Gestão espera ao
   corrigir um número digitado errado.
7. **P.A. conta pedidos faturados**, o mesmo universo do realizado: dois
   denominadores diferentes na mesma linha dariam um P.A. que não corresponde ao
   valor ao lado.

## O que fica para quem implementa

- Ordem exata das colunas e dos blocos na tela, dentro do desenho acima.
- Rótulos e textos de ajuda (`FieldHelp`), no tom das telas existentes.
- Paleta dos gráficos a partir dos tokens de setor já existentes.
- Nomes dos arquivos e divisão entre server e client component, seguindo o
  padrão de `logistica/metricas`.
