# O Relatório Semanal do Marketing, portado para o Build.Flow

24 de novembro de 2026 — a sessão que trouxe a ferramenta do Build.Connect

Este documento descreve **o que foi feito**, **o que ficou pendente** e **o que
eu sugiro**. A ferramenta de origem está descrita nos dois documentos do
Build.Connect (`2026-11-23-relatorio-semanal-do-marketing.md` e
`2026-11-23-ajustes-do-relatorio-semanal.md`); aqui só se registra o porte.

**Estado ao fim:** `tsc --noEmit` exit 0 · **53 checagens** (`npm run check`) ·
`npm run build` limpo · **14 commits** · 48 arquivos, **+6.462 linhas** ·
conferido no navegador nos dois temas e em 544 px.

**Nada foi para produção.** O `build` prova que compila, não que está
publicado. A migration das 7 tabelas ainda não rodou lá.

---

## 1. O que foi feito

| Commit | O que entrou |
|---|---|
| `7ce98cb` | O Marketing vira módulo: menu, cor índigo, ícone, rota e porta de acesso |
| `198d8ec` | 7 modelos, migration, as contas da planilha e a leitura |
| `70fef48` | As 7 peças de `ui/` que faltavam |
| `849f152` | *(conserto)* a gaveta do menu no celular volta a ter palavras |
| `de82b0b` | A lista de semanas, com card e paginação |
| `15b64f7` | A ficha de leitura + o script de dado de exemplo |
| `01b155a` | As 6 actions do relatório e a validação da fronteira |
| `bc4e0f5` | O editor e o registro de pendências |
| `196eaed` | A semana nova, as duas vistas e o `Segmented` corrigido |
| `17a2cdc` | As quatro seções de linhas (entregas, métricas, OKRs, pauta) |
| `f81deac` | Bloqueios e decisões — os seis blocos fecham o editor |
| `36aeb13` | O quadro Kanban (abas 7 e 8) |
| `76a9e44` | O fluxo em seis passos e a evidência por print |
| `bb321e3` | *(conserto)* o servidor deixa de recusar o próprio caminho de upload |

A ferramenta está completa: lista, leitura, editor com os seis blocos, semana
nova em etapas, quadro Kanban com arrasto e teclado, evidência por link ou
print, e o painel de contagens.

---

## 2. As decisões que custaram algo

Estas são as diferenças deliberadas em relação ao Build.Connect. Nenhuma é
esquecimento.

### Sem subsetor, sem escopo

Lá o relatório pende do subsetor e todo `WHERE` carrega o `subsectorId` — é o
que impede abrir a semana de outra área por id colado na URL. Aqui o Marketing
é um só: a coluna de escopo não existe, e a porta é o
`requireRole(["GESTAO"])` da página. Pelo mesmo motivo **o `guards.ts` do
original não foi portado**: ele resolveria um escopo que não existe.

### Sem as colunas mortas da aprovação

`status`, `submittedAt` e `approvedAt` continuam no banco do Connect sem
ninguém escrevendo nelas desde que o ciclo saiu. Aqui elas não nasceram.

### A chave da semana é o PERÍODO, não o número

`@@unique([periodStart])`. A semana 1 de 2027 e a de 2028 têm o mesmo número e
períodos diferentes — é o período que diz de qual sexta se fala.

### Só GESTAO

O buildflow não tem papel de Marketing, e criar um custaria migração do enum
`Role` para um módulo de uma ferramenta. **Consequência: a Karen não consegue
usar a ferramenta hoje** — ver §4.1.

### Iniciais no lugar da foto

O `User` do buildflow não tem campo de avatar. O cartão mostra as iniciais, que
é o mesmo recurso a que a ferramenta de lá já recorre quando a pessoa não
enviou foto. Sem responsável, o círculo fica tracejado.

### O responsável é qualquer pessoa ATIVA

Lá a lista é quem está lotado no subsetor. O buildflow não tem lotação por
área, e restringir a GESTAO deixaria a lista com uma pessoa. A trava que
importa continua de pé: a action confere no servidor que o id recebido é de
usuário ativo.

### A página e a semana vivem na URL

`?page=` e `?semana=`. No Connect a página é estado local, e isso custou um
defeito lá: criar uma semana estando na página 2 deixava a pessoa na 2 enquanto
a semana nova entrava na 1, invisível.

### Três peças de UI não são cópia

- **Progress** usa o `tierColor` que o buildflow já tem. A escala do Connect
  tem cinco faixas e outras cores; duas réguas para "o quanto disto está
  pronto?" na mesma tela seria pior.
- **Tabs** é sublinhada, como a Gestão já desenha as dela. Pílula seria uma
  terceira gramática de aba no mesmo sistema.
- **Avatar** é só iniciais, pelo motivo acima.

### O cabeçalho do painel não foi portado

O painel do Connect desenha "RELATÓRIO SEMANAL" e uma linha de descrição. No
buildflow a barra superior já escreve o título e a descrição lendo o `NAV` —
repetir daria o mesmo título duas vezes na mesma tela. **Decisão em aberto**
(§4.6).

---

## 3. Os defeitos encontrados no caminho

Três deles não eram do porte; o terceiro era meu.

### 3.1 A gaveta do menu no celular ficava muda (`849f152`)

`colapsada` é a coluna estreita **do desktop**, guardada no `localStorage`. A
largura já tratava isso certo (`lg:w-[4.5rem]`), mas **oito pontos removiam
texto do DOM** sem guarda nenhum. Quem recolhia a barra no desktop e abria o
sistema numa janela estreita recebia a gaveta na largura cheia e sem uma
palavra escrita — logo, usuário, cabeçalhos de seção, todos os módulos, Gestão
e Sair.

Dois casos não eram classe CSS: a marca (props não atendem media query, virou
duas marcas) e o setor recolhido (um `if` em JavaScript que trocava a lista por
um gatilho de flyout — que ainda abriria por cima da própria gaveta).

### 3.2 O `Modal` compartilhado rolava com a barra do sistema (`15b64f7`)

Ganhou `kanban-scroll`. O conteúdo passa de 90vh com frequência, e a barra
padrão era larga, sempre visível e diferente do resto do app.

### 3.3 O servidor recusava o caminho de upload que ele mesmo gerava (`bb321e3`)

**Defeito meu, achado na Fase 5 ao enviar o primeiro print.** No Connect o
arquivo é servido em `/uploads/`; aqui a rota que confere a sessão é
`/api/uploads/`, e é esse o caminho que o `processAndSaveImage` devolve. Portei
o `startsWith("/uploads/")` para dois lugares — o schema que aceita a evidência
e a função que decide desenhá-la como imagem — e os dois recusavam o caminho
real. A lista de prefixos virou fonte única (`PREFIXOS_DE_UPLOAD`).

### 3.4 Uma `key` que faltava

Ao reler o painel do original, achei que faltava `key={detail.id}` no editor e
na ficha. Sem ela, trocar `?semana=` na barra de endereços manteria o
formulário da semana anterior sobre o id novo — troca silenciosa de dados.
Corrigido em `196eaed`.

---

## 4. Pendente de RESPOSTA — decisões suas

### 4.1 A duplicação com o Build.Connect

**Esta é a mais importante.** O porte criou a segunda ferramenta de relatório
semanal do Marketing. Enquanto a do Connect continuar ligada, quem preencher lá
não aparece aqui, e nenhuma das duas avisa a outra. É preciso decidir qual é a
verdadeira — e, se for esta, desligar a de lá (é um dado, `weeklyReportEnabled`
do subsetor, não uma migration).

### 4.2 Quem preenche

Hoje só GESTAO entra. Se a Karen precisa preencher, há dois caminhos: o acesso
modular que você já pediu para a Gestão (§6.1), ou um papel novo no enum.

### 4.3 A barra do card mede "respondido", não "saúde"

Uma semana com duas entregas ambas em 🟡 fecha a barra em verde, porque as duas
foram respondidas. É o comportamento do Connect e eu mantive. Uma linha para
trocar.

### 4.4 As abas são sublinhadas, não pílula

Escolhi o padrão da casa. Um arquivo para trocar.

### 4.5 `/marketing` direto dá 404

Nenhum link do sistema leva lá (o módulo tem `href: null`). Três linhas para um
redirect, se incomodar.

### 4.6 O cabeçalho próprio do painel

Não portei para não duplicar o título. Cinco linhas, se preferir igual ao
Connect.

---

## 5. Pendente de FAZER

### 5.1 O arrasto com mouse não foi verificado

É a única coisa do porte sem prova. Os handlers estão ligados
(`draggable`, `onDragStart`, `onDrop`) e o caminho de teclado funciona — provei
nos dois sentidos, inclusive a recusa de Publicado sem evidência. Mas eventos
sintéticos não disparam o drag-and-drop nativo do HTML: testar exige um arrasto
real do sistema operacional.

### 5.2 Não há teste de componente nem de banco

A camada de tela foi verificada no navegador, à mão. As 53 checagens cobrem as
contas, a validação e a navegação — não a tela. Ver a sugestão §6.4.

### 5.3 O `rate-limit.ts` quebra o portão no CI

Achado no começo da sessão, **anterior ao porte, e não consertado**:
`scripts/checks/rate-limit.ts` sai com código 1 quando não há Postgres.
Confirmei apontando para uma porta morta. Ele é a 25ª de 53 checagens, e o
`ci.yml` diz textualmente *"nenhum passo aqui toca banco"* e não sobe Postgres.
**Se for isso mesmo, o portão do CI aborta ali e as 28 checagens seguintes
nunca rodam.**

### 5.4 Produção

A migration das 7 tabelas precisa rodar (`npx prisma migrate deploy`, que o
entrypoint já faz a cada subida). O quadro inicial sai de
`npx tsx scripts/semana-exemplo.ts --so-cartoes`, que cria os 12 cartões e
nenhuma semana. **Não rode o script sem `--so-cartoes` em produção** — ele cria
seis semanas de demonstração.

---

## 6. Sugestões minhas

Em ordem do que eu acho que mais muda a ferramenta.

### 6.1 Fechar a semana por prazo

**O buraco que a remoção da aprovação abriu, e que veio junto no porte.** Hoje
qualquer pessoa com GESTAO reescreve uma semana já discutida na reunião,
inclusive meses depois, sem deixar rastro. Não sugiro trazer o ciclo de volta;
sugiro o equivalente barato: **depois de X dias a semana fecha para edição**, e
reabrir é ato deliberado.

Onde mexe: uma condição no `abrirRelatorio` de
[actions/relatorio-semanal.ts](src/lib/actions/relatorio-semanal.ts) e a mesma
conta alimentando a tela. Duas condições e uma asserção. **O prazo é decisão
sua** — duas semanas é o que eu chutaria.

### 6.2 Avisar sobre a sexta às 18h

A planilha dizia "entrega toda sexta até 18h" e a ferramenta não cobra ninguém.
**Aqui isso é mais barato do que no Connect**: o buildflow já tem
`src/lib/notifications/` e rotas em `src/app/api/cron/`. É uma rota nova e uma
consulta: "é quinta e a semana corrente não existe" → lembrete; "é segunda e a
semana passada ficou sem destaque" → alerta.

### 6.3 No celular, o quadro é somente leitura

O arrasto usa o recurso nativo do HTML, que **não cobre toque**, e as setas do
teclado não existem num telefone. Hoje, num celular, não há como mover um
cartão.

O Connect removeu a lista "Mover para" da ficha por ser uma segunda porta para
a mesma ação — mas lá, como aqui, **no toque não existe a primeira porta**.
Sugiro devolver essa lista **só onde não há arrasto** (`@media (pointer:
coarse)`), ou dois botões ‹ › no rodapé da ficha. É pequeno e devolve a
ferramenta inteira a quem abre no celular.

### 6.4 Uma checagem de banco para a leitura

A camada de leitura (`relatorio-semanal-data.ts`) é a que tem mais regra sutil
— a média de 4 semanas casando OKRs **pelo texto**, os contadores, o atraso — e
é verificada só à mão. Exercitei-a uma vez por script descartável e ela passou.

**Já existe precedente na casa**: `scripts/checks/rate-limit.ts` fala com o
Postgres de propósito. Sugiro transformar aquele script descartável numa
checagem de verdade — resolvendo junto o §5.3, porque as duas têm o mesmo
problema: ou o CI ganha um Postgres, ou as duas pulam limpo quando não há
banco.

### 6.5 O print trocado fica órfão no disco

O upload **grava o arquivo mas não associa** — quem grava o caminho é o
"Salvar" da seção. Isso é de propósito (permite trocar o print antes de salvar
sem deixar a linha apontando para um arquivo descartado), mas tem um custo que
o Connect também tem: **o arquivo substituído nunca é apagado**. Com o tempo a
pasta cresce com prints que ninguém referencia.

Sugiro uma rotina de limpeza no cron que já existe: apagar de
`uploads/relatorio-semanal/` o que não está referenciado em
`WeeklyReportDelivery.evidence` nem em `MarketingTask.evidence`, com alguma
folga de data.

### 6.6 Mover o Cronograma e a Vitrine para o Marketing

As duas são ferramentas de Marketing que moram em **Comercial** — estavam lá
porque não havia módulo de Marketing. **Agora há.** O `nav.ts` já descreve
tudo; mover é editar duas linhas. Vale confirmar com quem usa, porque muda o
menu de quem abre todo dia.

### 6.7 Quando a entrega precisar sair do sistema

A planilha era um arquivo que se mandava por e-mail; isto é uma tela. Se o
relatório precisar sair do sistema, `src/lib/pdf/` já existe no projeto — mas é
trabalho novo, não ajuste.

---

## 7. Como rodar

```bash
npm run check                               # 53 checagens
npx tsc --noEmit && npm run build           # o resto do portão

npx tsx scripts/semana-exemplo.ts           # 6 semanas (a de 23/11 cheia) + 12 cartões
npx tsx scripts/semana-exemplo.ts --so-cartoes   # só o quadro inicial (serve em produção)
npx tsx scripts/semana-exemplo.ts --limpar       # apaga o que ele criou
```

O script usa **datas fixas**, não relativas a hoje: é o que faz o `--limpar`
apagar exatamente o que criou, mesmo rodando semanas depois. O quadro é
idempotente pelo `code` (`K-01`…).

---

## 8. Arquivos

```
prisma/
  migrations/20261124122519_relatorio_semanal_marketing/
  schema.prisma                        7 modelos + 4 enums

src/lib/
  relatorio-semanal-math.ts            o domínio + as contas da planilha (puro)
  relatorio-semanal-data.ts            a leitura, com os números calculados
  relatorio-semanal-schemas.ts         a validação da fronteira (sem "use server")
  relatorio-semanal-labels.ts          rótulos, formatação e PREFIXOS_DE_UPLOAD
  relatorio-semanal-templates.ts       a pauta e os 12 cartões
  actions/relatorio-semanal.ts         10 actions

src/app/(dashboard)/marketing/relatorio-semanal/
  page.tsx            painel.tsx           report-card.tsx
  report-view-modal.tsx                    report-editor.tsx
  report-steps.tsx    resumo-section.tsx   report-sections.tsx
  blockers-section.tsx                     section-card.tsx
  pendencias.tsx      use-secao.ts         health-select.tsx
  evidence-field.tsx  new-report-modal.tsx
  kanban-board.tsx    kanban-summary.tsx
  task-modal.tsx      task-details-modal.tsx

src/components/ui/    avatar, empty-state, progress, segmented, select,
                      tabs, textarea (novos) + badge e button (variantes)

scripts/
  semana-exemplo.ts                    dado de exemplo e o quadro inicial
  checks/relatorio-semanal-math.ts     46 asserções (as contas)
  checks/relatorio-semanal-schemas.ts  47 asserções (a fronteira)
```

O `relatorio-semanal-schemas.ts` é um módulo **sem** `"use server"` de
propósito: módulo `"use server"` só exporta função assíncrona — um schema
exportado de lá quebra o build, e o `tsc` **não** pega isso.

---

## 9. Nota sobre dado de desenvolvimento

Tudo o que criei para conferir foi apagado: a semana 51 de teste, a tarefa
K-13, os dois `.webp` que o upload gravou no disco e as semanas temporárias da
conferência da lista. O banco terminou com o que o
`scripts/semana-exemplo.ts` deixa: **6 semanas (a de 23/11 cheia) e os 12
cartões do quadro**. Nenhum outro dado foi tocado.
