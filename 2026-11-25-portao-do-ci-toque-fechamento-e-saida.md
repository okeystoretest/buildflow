# O portão do CI, o toque, o fechamento e a saída

25 de novembro de 2026 — a sessão que fechou as pendências do porte

Este documento continua o `2026-11-24-relatorio-semanal-no-buildflow.md`, que
registrou o porte da ferramenta. Aqui se registra o que foi feito com as
pendências que ele deixou — e três coisas que ninguém sabia.

**Estado ao fim:** `tsc --noEmit` exit 0 · **54 checagens** (`npm run check`) ·
`npm run build` limpo · **8 commits** · 15 arquivos, **+866 −23** ·
CI verde (runs #16 e #17) · conferido no navegador nos dois temas.

**E isto está em produção.** Diferente da sessão anterior: a rota de cron
respondeu em `buildflowapp.com.br`, o que prova que a publicação já aconteceu
depois destes commits.

---

## 1. O que foi feito

| Commit | O que entrou |
|---|---|
| `b98c940` | O CI ganha banco, e as 28 checagens que nunca rodaram voltam |
| `f2c0422` | A ficha do cartão volta a mover: no toque não existia a primeira porta |
| `8ee4294` | `/marketing` deixa de dar 404 |
| `fd0293d` | A semana fecha quando a seguinte nasce |
| `6108836` | O app para de piscar cinza a cada toque no celular |
| `2d98a18` | A ferramenta passa a cobrar a entrega da sexta |
| `8778b10` | A camada de leitura ganha checagem de banco |
| `afed508` | O Relatório Semanal sai do sistema em PDF |

Dos 13 itens pendentes do documento anterior, **9 foram fechados** (§4.5, §5.1,
§5.3, §5.4, §6.1, §6.2, §6.3, §6.4, §6.7) e **4 ficaram por decisão** (§4.3,
§4.4, §4.6 mantidos como estão; §6.5 e §6.6 adiados).

---

## 2. As descobertas

Nenhuma delas era o trabalho pedido. As três primeiras apareceram no caminho.

### 2.1 O CI estava vermelho havia cinco pushes

O documento anterior suspeitava disso no §5.3. Não era suspeita: está no
histórico do GitHub.

```
#16  fd0293d  success   ← o primeiro verde deste arquivo
#15  1967b71  failure
#14  a0c9bd7  failure
#13  6d475ca  failure
#12  2c66d48  failure
#11  92007c8  failure
```

`scripts/checks/rate-limit.ts` fala com o Postgres de propósito e sai com
código 1 sem banco; `scripts/check.ts` aborta na primeira falha. Ele é a 25ª de
53 — **as 28 seguintes nunca rodaram no CI**. Na máquina do dev, que tem banco,
o portão ficava verde; só o CI estava cego.

Tem uma ironia no meio: o `ci.yml` traz escrito que o commit `92007c8` *"passou
no CI"* — e é exatamente o run **#11, failure**. O comentário que existe para
lembrar que verde não é entrega estava apoiado num verde que nunca houve.

### 2.2 Catorze commits nunca tinham sido empurrados

O `origin/master` estava parado em `1967b71`, antes de o módulo Marketing
existir. O porte inteiro da sessão anterior — os 14 commits — morava só na
máquina do dev. O push desta sessão levou 18 commits, não 4.

### 2.3 O EasyPanel não tem agendador

A [documentação oficial](https://easypanel.io/docs/guides/cron-job) não
descreve tela, menu nem aba de agendamento. Ela oferece dois caminhos: um
`crontab` dentro do Dockerfile, ou um serviço externo.

Nenhum dos dois serve aqui:

- **O do Dockerfile** usa caminhos do Alpine (`/etc/crontabs/root`,
  `/usr/sbin/crond`); a imagem daqui é `node:20-slim`, que é Debian e não tem
  nenhum dos dois. E o `CMD` atual usa `exec` de propósito para o node virar
  PID 1 e receber o `SIGTERM` — um segundo processo desmontaria isso.
- **O serviço externo** significaria entregar o `SELECT_CRON_SECRET` a um
  terceiro. Esse segredo abre as três rotinas, e uma delas (`/api/cron/leads`)
  apaga dados.

O caminho certo é o cron da própria VPS. Ver §5.1.

**E a pergunta maior que isso abre:** se o painel não agenda nada, quem chama
`/api/cron/selects` e `/api/cron/leads` hoje? Pode ser que ninguém. Para
descobrir, procure em produção por notificações que comecem com `Select:`.
Se nunca houve nenhuma, nunca rodou.

### 2.4 O `globals.css` não tinha base de toque nenhuma

Sem `-webkit-tap-highlight-color`, sem `touch-action`, sem
`overscroll-behavior`. Na prática o app **inteiro** piscava um retângulo cinza
a cada toque, e o puxar-para-atualizar do Android brigava com as rolagens
internas. Nada disso reproduz no navegador do desktop, nem com o modo
dispositivo ligado — são comportamentos de aparelho de verdade.

---

## 3. As decisões que custaram algo

### 3.1 O CI ganhou banco em vez de pular a checagem

Pular `rate-limit.ts` sem banco seria mais barato e pior: ela passaria a
mentir. `checkRate` degrada para um balde em memória quando o banco cai, então
as **6 primeiras asserções passam contra o fallback** — exatamente o que o
cabeçalho daquele script diz que se recusa a testar — e só a 7ª morre, no
`prisma.rateLimitHit.count`, que não tem fallback.

O contêiner é descartável e morre com o job, então a objeção escrita no próprio
`ci.yml` (*"um DATABASE_URL real em CI seria credencial de produção num log
público"*) não se aplica: `postgres://ci:ci@localhost` não existe fora do job.

**De brinde:** o passo de migrations prova que elas aplicam numa base limpa.
Antes isso só se descobria na subida de produção.

### 3.2 A semana fecha por "a seguinte nasceu", não por prazo em dias

A regra são **duas condições**: o período acabou **E** já existe uma semana
mais nova.

- `existeMaisNova` sozinho trancaria a semana corrente no dia em que alguém
  criasse a seguinte adiantado, no meio da semana, só para ir anotando.
- `periodEnd < hoje` sozinho tranca o que não precisa: enquanto a semana
  seguinte não existe, não há no que reaproveitar.

Sem contagem de dias de propósito: um número seria chute e teria de ser revisto
quando a rotina da reunião mudasse. O instante em que reaproveitar vira
possível é o nascimento da semana seguinte.

A tranca mora no `abrirRelatorio`, funil das quatro escritas da semana. `throw`
e não valor de retorno: o `catch` que cada action já tem vira a mensagem, igual
ao que `requireRoleAction` faz.

**O quadro Kanban não passa por ali, de propósito:** ele é o estado vivo,
movido à mão na reunião, e não o registro daquela semana.

### 3.3 Sem reabertura — e por isso sem migration

Reabrir seria a porta que este fechamento existe para não ter. Como não há
reabertura, não há o que lembrar, e portanto **nenhuma coluna nova e nenhuma
migration**. O primeiro desenho previa `reopenedAt`; a conversa com quem decide
dispensou.

**Consequência:** fechou, fechou. Não existe caminho pela tela para corrigir um
erro de digitação numa semana antiga. A regra inteira é uma função pura num
arquivo só — se um dia incomodar, é uma linha.

### 3.4 A lista "Mover para" voltou para TODO MUNDO

Ela tinha saído por ser uma segunda porta para a mesma ação. Voltou porque **no
toque a primeira porta não existe**: o drag-and-drop nativo do HTML não cobre
toque e um telefone não tem setas.

Voltou sem `@media (pointer: coarse)` de propósito: essa consulta mente em
notebook com tela sensível e em tablet com teclado, e esconder controle por
palpite de aparelho é o mesmo defeito que a gaveta do menu custou em `849f152`.
De quebra, a lista torna visível o atalho de teclado, que ninguém descobre
sozinho.

A lista e não dois botões de passo: o quadro tem 5 colunas, e ir do Brainstorm
ao Publicado com setas seriam quatro reaberturas da ficha.

### 3.5 Mover fecha a ficha

O cartão aparecendo na coluna nova é a resposta, e a recusa do servidor (*"nada
chega a Publicado sem evidência"*) vai para o aviso do quadro — que a ficha
aberta cobriria. Sem isso, tocar em "Publicado" numa tarefa sem evidência não
daria resposta visível nenhuma.

### 3.6 O dado de teste da checagem de banco mora em 2019

A média de 4 semanas lê as **três anteriores por período**, então as quatro
semanas do teste precisam ser as únicas antes da última delas. Em 2019 isso vale
com o banco vazio do CI e com o banco cheio da máquina do dev, onde os dados
reais são de 2026 e, por serem posteriores, nunca entram na janela.

### 3.7 `user-select: none` só em botão, nunca em link

A receita padrão manda aplicar em `button, a, [role="button"]`. Aqui os links
carregam **conteúdo que se copia** — a URL da evidência de uma tarefa é o caso.
Em link isso seria defeito, não acerto.

---

## 4. Decisões já tomadas (o §4 do documento anterior)

| | Pergunta | Resposta |
|---|---|---|
| §4.1 | A duplicação com o Build.Connect | **Não é duplicação.** As duas ferramentas são originais, cada uma no seu sistema; nenhuma precisa da outra |
| §4.2 | Quem preenche | A pessoa **já tem papel de Gestão** em produção |
| §4.3 | A barra mede "respondido", não "saúde" | Fica como está |
| §4.4 | Abas sublinhadas, não pílula | Fica como está |
| §4.5 | `/marketing` dá 404 | **Feito** |
| §4.6 | O cabeçalho próprio do painel | Fica como está |
| §5.1 | O arrasto com mouse | **Testado à mão: funciona** |
| §5.4 | Produção | **Publicado** |

---

## 5. Pendente de FAZER

### 5.1 O agendador da rotina de sexta

**A rotina existe e responde, mas ninguém a chama.** Ela falha calada por
desenho — se parar de rodar, nenhuma tela mente, só o aviso deixa de chegar.

O caminho é o cron da própria VPS (ver §2.3 para por que não é o EasyPanel):

```bash
# 1. o segredo num arquivo só do root (cole quando pedir; não aparece na tela)
read -s -p "Cole o segredo: " S; echo
printf "SELECT_CRON_SECRET='%s'\n" "$S" | sudo tee /etc/buildflow-cron.env > /dev/null
sudo chmod 600 /etc/buildflow-cron.env

# 2. testar ANTES de agendar (GET: só informa, não notifica)
. /etc/buildflow-cron.env && curl -s https://buildflowapp.com.br/api/cron/relatorio-semanal \
     -H "Authorization: Bearer $SELECT_CRON_SECRET"

# 3. sudo crontab -e, e a linha:
0 9 * * * . /etc/buildflow-cron.env && curl -fsS -X POST https://buildflowapp.com.br/api/cron/relatorio-semanal -H "Authorization: Bearer $SELECT_CRON_SECRET" >> /var/log/buildflow-cron.log 2>&1
```

**De manhã, nunca de madrugada.** A rotina decide "hoje é sexta?" pelo
calendário **UTC**, que é a régua das colunas `@db.Date`. O contêiner roda em
`America/Sao_Paulo` (UTC−3), então das 21h em diante o UTC já virou o dia
seguinte: agendada às 22h de sexta, ela acharia que é sábado e ficaria calada.

**Todo dia, não só na sexta.** O dia certo mora no código; chamada numa terça,
ela responde `"hoje nao e sexta"` e não faz nada. Assim a regra pode mudar sem
que ninguém precise mexer no servidor.

No `$SELECT_CRON_SECRET` da linha, o `$` está correto — é o **nome** da
variável, preenchido pelo arquivo carregado antes. Colar o valor ali no lugar
é o erro que custou uma rodada de depuração nesta sessão.

### 5.2 Trocar o `SELECT_CRON_SECRET`

Combinado em 25/11 e adiado. É `openssl rand -hex 32`, a variável no EasyPanel,
uma reimplantação e o valor novo no arquivo do §5.1. Vale independentemente do
agendador.

### 5.3 Tela estreita não foi verificada por janela

O Chrome recusou sair do maximizado em três tentativas. O que foi testado:
estreitar o contêiner a 300px, o que prova o `flex-wrap` do rodapé. **Não**
prova as media queries do app — que esta sessão não tocou.

### 5.4 O PDF não foi visto com olhos

Validados: assinatura `%PDF-`, `%%EOF` fechado, 2 páginas, e os cinco blocos
com conteúdo lidos. **Isso prova que é íntegro e tem o conteúdo certo, não que
está bonito na página.** Vale abrir um e olhar.

---

## 6. Sugestões

### 6.1 Descobrir se as outras duas rotinas já rodam

É a de maior consequência e custa um minuto: procure em produção notificações
que comecem com `Select:`. Se nunca houve nenhuma, a cobrança de parcelas e o
expurgo de candidaturas estão calados desde sempre — e a mesma visita à VPS
resolve as três.

### 6.2 Consertar o comentário mentiroso do `ci.yml`

A linha que diz que `92007c8` *"passou no CI"* é falsa (run #11 = failure). O
comentário inteiro existe para ensinar que verde não é entrega; apoiado num
verde inexistente, ele ensina errado. Uma linha.

### 6.3 Apagar semana fechada e recriar ainda é possível

`excluirRelatorio` não passa pelo funil que o `fd0293d` trancou. Não foi
fechado porque apagar é ato explícito e destrutivo, não o descuido que o
fechamento impede. Uma linha, se incomodar.

### 6.4 Prints órfãos acumulando no disco *(era §6.5)*

O upload grava o arquivo mas não associa — quem grava o caminho é o "Salvar" da
seção. É de propósito, mas o arquivo substituído nunca é apagado. Com o cron da
VPS agora encaminhado, uma rotina de limpeza fica barata.

### 6.5 Mover Cronograma e Vitrine para o Marketing *(era §6.6)*

Duas linhas no `nav.ts`, mas muda o menu de quem abre todo dia. Vale confirmar
com quem usa.

### 6.6 Um registro de que as rotinas existem

As três rotinas de cron falham caladas por desenho, e nada no sistema diz que
elas deveriam estar rodando. Um `/api/health` que também reporte "última
execução de cada rotina" tornaria o silêncio visível — hoje "nunca configurado"
e "configurado e funcionando" são indistinguíveis de fora.

---

## 7. Como conferir

```bash
npm run check                               # 54 checagens
npx tsc --noEmit && npm run build           # o resto do portão

npx tsx scripts/checks/relatorio-semanal-leitura.ts   # só a checagem de banco nova
```

A checagem de leitura **exige Postgres** e cria quatro semanas em 2019, que ela
apaga no `finally` — inclusive quando uma asserção falha.

No navegador, o que esta sessão mudou:

- Semanas antigas **sem o lápis**; só a mais nova com período em curso edita
- Ficha de qualquer semana com botão **PDF**, inclusive nas fechadas
- Cartão do Kanban → ficha → lista **"Mover para"**
- No celular: nenhum retângulo cinza ao tocar

---

## 8. Arquivos

```
.github/workflows/ci.yml             conteiner postgres:18 + passo de migrations

src/lib/
  relatorio-semanal-math.ts          + semanaFechada()
  relatorio-semanal-data.ts          + campo `fechada` na lista e na ficha
  relatorio-semanal-pdf.ts           NOVO — o layout A4 dos seis blocos
  actions/relatorio-semanal.ts       abrirRelatorio() tranca a semana fechada

src/app/
  globals.css                        base de toque
  (dashboard)/marketing/page.tsx     NOVO — redirect
  (dashboard)/marketing/relatorio-semanal/
    kanban-board.tsx                 passa onMove para a ficha
    task-details-modal.tsx           a lista "Mover para"
    report-card.tsx                  esconde o lápis da semana fechada
    report-view-modal.tsx            botão PDF + aviso de semana fechada
  api/cron/relatorio-semanal/        NOVO — a cobrança da sexta
  api/marketing/relatorio-semanal/pdf/   NOVO — a rota do arquivo

scripts/checks/
  relatorio-semanal-math.ts          + 7 asserções do fechamento
  relatorio-semanal-leitura.ts       NOVO — 8 asserções contra o banco
```

---

## 9. Nota sobre dado de desenvolvimento

Tudo que foi criado para conferir foi apagado: a base `buildflow_ci_probe` que
reproduziu a condição do CI, as quatro semanas de 2019 da checagem de leitura, e
o cartão K-02 voltou para a coluna onde estava. O banco terminou com as **6
semanas e os 12 cartões** que o `scripts/semana-exemplo.ts` deixa. Nenhum outro
dado foi tocado.
