# Handoff — merge no master, Select, LGPD e Next 15 (sessão 5)

**Data:** 17/10/2026 · **Branch:** `master` · **HEAD:** `be0ffe8`
**Estado:** tudo comitado **e pushado**. `origin/master` está em dia.
**Em produção:** sim. O deploy rodou, aplicou as migrations e está no ar.

**Leia antes:** `handoff-lp-atacado-2026-10-16-correcoes.md` (sessão 4) e
`PRODUCT.md`. Este arquivo registra o que a sessão 5 mudou e o que sobrou.

**Diferença das sessões anteriores:** as sessões 1–4 trabalharam na branch
`feat/lp-atacado-analise-clientes` sem comitar. Esta fechou tudo, mergeou no
`master` e publicou. Não existe mais trabalho não comitado.

---

## 1. O que esta sessão fez

Dez commits, de `bb0382d` a `be0ffe8`.

```
be0ffe8  Cor de setor: escurece os quatro solidos em que o branco reprovava
c189e56  Rate limit no Postgres, teclado no editor, cores de setor em texto
4fc455d  LP Atacado: paragrafos dos motivos, aviso do Art. 9, expurgo 90 dias
3adbed6  Next 14.2.35 -> 15.5.28: o critical da porta publica fecha
a798f58  LP Atacado: fontes passavam pelo middleware; bronze no fundo errado
b2a7304  Merge: LP de Atacado, Analise de Clientes e Select de servico
df46240  docs: remove os tres documentos soltos superados pelas specs
6bd6f05  Select: venda de servico com as migrations que criam as tabelas
31997fd  LP Atacado: namespace publico separado do das candidatas
bb0382d  Upload: magic bytes e tetos de decodificacao em todo caller
```

**Verificação ao fechar:** `npx tsc --noEmit` limpo · **29/29** checks de
`scripts/checks/` verdes · `npx next build` completo (o primeiro desta linha de
trabalho) · rotas em **produção** conferidas por HTTP contra a linha de base
(`/atacado/okey` 200, `/atacado/lov-club` 200, `/atacado/nike` 404, `/login`
200, `/` 307, `/api/health` 200).

### O commit do Select e o risco que ele fechava

O commit `e6a1de6` (sessão anterior) tinha levado 5 models e 2 enums do Select
para o `schema.prisma` **comitado**, e nenhuma migration comitada criava essas
tabelas — as três estavam não rastreadas. O `CMD` do container é
`migrate deploy && exec node server.js`: banco sem as tabelas e Prisma Client
com elas derrubaria a aplicação no instante em que o código do Select fosse
comitado sozinho.

As três migrations foram no **mesmo commit** que o código que as exige. O log do
deploy confirma: `49 migrations found` · `No pending migrations to apply`.

### Dois defeitos críticos achados MEDINDO no navegador

Nenhum dos dois aparecia em `tsc`, nos 29 checks, nem no código HTTP das rotas.
São a confirmação da lição da sessão 3, por um caminho novo: **código de status
200 não prova que a página está certa.**

**1. A LP nunca carregou as próprias fontes.** `/fonts/atacado/*.woff2` não
estava em `PUBLIC_PATHS` nem em `PUBLIC_FILES` do middleware, que respondia
**307 para /login no próprio arquivo da fonte**. Os dois `@font-face` ficavam
com status `error` e a página — cujo mundo visual inteiro mora em Playfair e
Manrope — renderizava em **Georgia**. Com `font-display: swap` nada quebra
visivelmente, e foi exatamente por isso que passou por tudo. A sessão 4 tinha
mexido no descritor `format()` achando que era isso; o descritor nunca foi o
problema. Conserto: `"/fonts"` no `PUBLIC_PATHS`.

**2. O bronze de texto media contra o fundo errado.** `--accent-text` fora
calibrado em 4,87:1 contra o osso (`#FAF8F4`), mas os micro-rótulos das métricas
vivem nos cards da superfície **alternada** (`#F1ECE4`), onde davam 4,24:1 —
reprovado para 11px. Escurecido para `36 37% 36%`: 4,79:1 na alternada e 5,30:1
no osso. **A regra geral:** o teto a respeitar é o fundo mais ESCURO em que o
token aparece, não o mais claro.

### Next 14.2.35 → 15.5.28

O advisory que importava era **DoS no App Router via Server Actions**, e a LP de
Atacado é porta pública com Server Action de submissão.

```
antes   1 critical · 9 high · 2 moderate
depois  0 CRITICAL · 8 high · 3 moderate
```

`next` caiu de *critical* para *moderate*. Os 8 *high* restantes são **a cadeia
de build do Tailwind 3** (braces, chokidar, fast-glob, micromatch, postcss,
postcss-nested, postcss-selector-parser, tailwindcss) — não estão no caminho de
requisição. `npm audit fix --force` instalaria `tailwindcss@4`, que reescreve o
design system; isso é decisão separada e não vai de carona num upgrade de
segurança. Zerar o *moderate* do `next` exige Next 16, que quebra a aplicação
hoje.

React ficou em **18.3.1**: `next@15.5.28` aceita `^18.2.0` como peer, então não
arrastou migração para o React 19.

`params`, `searchParams`, `cookies()` e `headers()` viraram assíncronos no 15. A
migração foi pelo **codemod oficial** (`@next/codemod next-async-request-api`):
34 arquivos, 0 erro. Reescrever 37 páginas à mão para uma mudança mecânica é
onde entram os erros de digitação.

### LGPD: o aviso e o expurgo

Não existia **nenhum** caminho de exclusão de candidatura, nem automático nem
manual: uma candidatura de 2026 ficaria no banco em 2031 com foto da loja e
CNPJ. E o rodapé da LP tinha só a finalidade, numa linha, onde o Art. 9 pede
quem trata, para quê, por quanto tempo e como exercer os direitos do Art. 18.

- `src/lib/wholesale-retention.ts` — `RETENCAO_DIAS = 90`, contados do **envio**
  (`createdAt`), que é exatamente o que o rodapé promete. As duas pontas leem a
  mesma constante, e `scripts/checks/wholesale-content.ts` prende que continuem
  iguais. Página que promete 90 e job que apaga em 180 é a página mentindo.
- O **arquivo sai antes da linha**. Apagar a linha primeiro perde o caminho do
  arquivo e deixa a foto órfã no volume para sempre — vazamento de dado pessoal
  que nenhuma consulta mostra.
- Uma transação por candidatura, não uma para todas: um registro problemático
  não deve impedir que os outros 300 sejam apagados.
- Controlador é a **razão social** (`Deliane Araujo Trajano Confecções`), não o
  nome comercial — o check reprova se alguém trocar por "Okey Store". CNPJ e
  e-mail conferidos na política do próprio site da marca.

### Rate limit: do processo para o Postgres

O contador vivia num `Map` do processo. Restart, OOM ou redeploy zerava, e com
**duas instâncias o teto efetivo dobrava em silêncio** — cada processo tinha o
seu balde, e nada dizia que "15 por hora" estava valendo 30.

- **Uma linha por tentativa**, não contador por janela fixa: preserva a janela
  deslizante que os quatro chamadores já tinham. Janela fixa deixa passar o
  dobro do teto na emenda entre duas janelas.
- **Uma única instrução SQL**, não ler-depois-escrever: contagem, inserção
  condicionada e limpeza da janela na mesma instrução. Quem é barrado **não
  insere linha** — tentar dez mil vezes não gera dez mil linhas.
- **Degrada, não desliga e não tranca:** banco fora cai no balde em memória (o
  código anterior, preservado). Liberar tudo tira a contenção no pior momento;
  recusar tudo transforma falha de banco em ninguém entrar no sistema.
- A função virou assíncrona; o compilador apontou os 8 pontos de chamada.

### Cores de setor: o passe completo

O hex de cada setor foi escolhido para **fundo de botão** com branco por cima, e
virou **cor de texto** em 140 lugares. Medido: **nenhum dos seis passava no tema
claro** — `distribuicao` dava 2,11:1 onde o mínimo é 4,5:1, e `vendas` reprovava
também no escuro (3,57:1).

- Token `--<setor>-text` por tema em `globals.css`, com a **mesma hue e a mesma
  saturação** do sólido: só a luminosidade muda, a marca continua a mesma. Medido
  contra a superfície mais difícil de cada tema (no claro o fundo da página, mais
  escuro que o card; no escuro o card, mais claro que o fundo). Resultado: 4,64:1
  a 8,23:1 nos doze pares.
- O mesmo check achou defeito **pré-existente que ninguém tinha medido**: o texto
  branco dos botões sólidos reprovava em quatro setores (financeiro 3,62, brand
  3,15, motorista e servico 2,87). Os quatro foram escurecidos mantendo hue e
  saturação; os seis passam agora.
- `scripts/checks/cor-de-setor.ts` lê os valores do **próprio** `globals.css` e
  do `tailwind.config.ts` e recalcula — nenhum número copiado. Também afirma que
  ninguém voltou a usar a cor sólida como cor de texto, que é a regressão exata e
  invisível na tela.

### Outros

- `/vendas` ganhou o botão **"Novo Select"**, só para `GESTAO`. A tela aceita
  VENDAS e FINANCEIRO por link direto; esconder o botão não decide nada, a
  action confere o papel no servidor.
- **Teclado no editor de imagens da LP:** segurar Enter ou Espaço com o foco no
  alvo, pelos mesmos 800 ms. Não contradiz a recusa de atalho de teclado no
  cabeçalho de `modo-edicao.tsx`: aquela é contra atalho **global**, capturado
  por leitor de tela e extensão antes de a página ver a tecla. Com o foco no
  alvo, ninguém disputa. `tabIndex`/`role` só existem quando `podeEditar`.
- **A explicação do CNPJ** ganhou `aria-describedby`. Na planilha ela vem entre
  parênteses dentro da pergunta; na tela é parágrafo à parte, e sem isso quem usa
  leitor de tela ouvia só a pergunta. O texto **não** pode entrar no `rotulo`: o
  rótulo é o nome do campo nas recusas do servidor.
- **Os três parágrafos dos motivos** (a planilha só tinha título e subtítulo)
  foram escritos com autorização do dono sob a regra de **nenhuma afirmação
  nova** — e a regra é conferível: cada parágrafo tem de conter um trecho que já
  aparece na copy aprovada, e o check afirma as duas pontas.
- **`whatsappLink` montado a partir do número que o dono confirmou**, não do que
  o site publica: o site mostra oito dígitos e celular brasileiro tem nove.
  Montar o `wa.me` a partir dali exigiria escolher o nono dígito, e um dígito
  escolhido manda a lojista para o WhatsApp de um estranho. O check aceita `null`
  ou 13 dígitos, nada no meio.
- `/api/cron` **fica** na allowlist do middleware. O handoff anterior dizia que
  devia sair no commit do Select; está errado. A rota confere o Bearer dela
  própria e responde 401 sem o segredo, então liberar no middleware não abre
  nada — e remover quebraria o agendador sem ganhar nada.
- **Três documentos removidos** (`docs/integracao-connect.md`,
  `docs/push-notificacoes.md`, `docs/resumo-2026-09-10.md`), superados pelas
  specs. `push-notificacoes.md` era o único com conteúdo próprio:
  `git show df46240~1:docs/push-notificacoes.md` traz de volta.

### Checagens novas (29 no total, eram 24)

- `scripts/checks/wholesale-retention.ts` — aritmética e **fronteira** do prazo:
  `<` e não `<=`, sinal do cálculo (invertido, o expurgo apagaria a base
  inteira), independência de fuso, e a igualdade entre o prazo da página e o do
  job.
- `scripts/checks/rate-limit.ts` — fala com o **banco** de propósito: teto
  inclusivo, barrada sem gravar linha, chaves independentes, a janela deslizando
  de volta, limpeza por chave e o expurgo de 24h.
- `scripts/checks/cor-de-setor.ts` — recalcula contraste a partir do CSS.

---

## 2. Pendências — só o dono resolve (todas em produção)

Nenhuma delas tem código pendente. É tudo configuração ou conteúdo.

1. ~~`APP_BASE_URL` no ambiente de produção~~ — **FEITO em 17/10/2026.**
2. ~~`SELECT_CRON_SECRET` no ambiente de produção~~ — **FEITO em 17/10/2026.**
   Valor de 64 caracteres em hexadecimal (sem `+`, `/` ou `=`, que são fonte de
   erro difícil de achar dentro de um header e de uma linha de `curl`).
3. ~~Agendador~~ — **FEITO em 17/10/2026.** `crontab` do root na VPS:

   ```cron
   10 4 * * * curl -fsS -X POST https://buildflowapp.com.br/api/cron/selects -H "Authorization: Bearer <segredo>" >/dev/null 2>&1
   20 4 * * * curl -fsS -X POST https://buildflowapp.com.br/api/cron/leads   -H "Authorization: Bearer <segredo>" >/dev/null 2>&1
   ```

   **04:10 e 04:20, e não 03:10/03:20 como eu tinha proposto:** a VPS roda outro
   sistema (`/root/trajano`) cujo backup estava agendado para 03:17, e backup é
   pesado de disco. Ver a nota sobre a VPS compartilhada na seção 3.

   Provado na hora, com o segredo lido de dentro do próprio crontab (e não da
   variável de ambiente da sessão, que podia estar certa com o crontab errado):

   ```bash
   curl -s -X POST https://buildflowapp.com.br/api/cron/leads      -H "$(crontab -l | grep leads | grep -o 'Authorization: Bearer [^\"]*')"
   ```

   Resposta: `{"ok":true,"retencaoDias":90,"candidaturasApagadas":0,...}`.
   Os zeros são o resultado certo — a LP é nova e nenhuma candidatura chegou
   aos 90 dias.

   **Como conferir que segue rodando:** EasyPanel → `web` → Logs, procurar
   `POST /api/cron/leads 200`. Duas linhas por dia. A saída vai para
   `/dev/null`, então uma falha de autorização seria **silenciosa** — este log
   é o único lugar onde ela apareceria.

4. **As 4 imagens da LP em produção.** O volume de produção nasce vazio — as
   fotos que existem são as do ambiente local. Entrar como `GESTAO`, abrir
   `/atacado/okey`, **pressionar e segurar 800 ms o nome da marca no rodapé**,
   subir uma por vez.
5. **As 4 descrições de imagem (`alt`).** Hoje o manifesto grava `""` nos quatro
   lugares: leitor de tela não ouve nada no herói nem nos três motivos. Mesmo
   editor, botão "Salvar descrição".
6. **🔴 Segredos de produção expostos.** Em 17/10/2026 um print das variáveis de
   ambiente foi compartilhado em texto legível, e o painel do EasyPanel está em
   **HTTP num IP público** (`187.127.10.50:3000`) — os mesmos valores já
   trafegavam em claro a cada acesso. Ficaram expostos: `AUTH_SECRET`, a senha do
   Postgres, `VAPID_PRIVATE_KEY`, `CONNECT_INTEGRATION_TOKEN` e
   `CONNECT_WEBHOOK_SECRET`. **O mais grave é o `AUTH_SECRET`: com ele se forja
   sessão de qualquer usuário, inclusive GESTÃO, sem senha.** O dono optou por
   não trocar por enquanto. Trocar o `AUTH_SECRET` desloga todos e é o único jeito
   de fechar isso. A senha do Postgres de produção é, além disso, **a mesma** do
   `.env` local.

   **O dono marcou 19/10/2026 para trocar o `AUTH_SECRET`** (pedido feito em
   17/10). Se esta data passar sem a troca, a exposição continua valendo: não é
   algo que expira sozinho. Os outros segredos seguem pendentes depois dele —
   os `CONNECT_*` precisam ser combinados com o Build.Connect, que é o outro
   lado da integração.
7. **Painel do EasyPanel sem HTTPS.** O caminho sem SSH é pôr um subdomínio
   (`painel.buildflowapp.com.br`) apontando para o IP e configurar o domínio do
   painel, que emite o certificado sozinho.

---

## 3. Achados abertos que ninguém consertou

| Achado | Onde | Por que ficou |
|---|---|---|
**A VPS é compartilhada.** `187.127.10.50` roda o buildflow (em Docker, pelo
EasyPanel) **e** um segundo sistema em `/root/trajano` — banco próprio, volume
`trajano-imagens`, e um backup diário por script (`roles + db + imagens`, com
rotação de 14 dias). São independentes, mas dividem CPU, disco e o `crontab` do
root. Quem agendar qualquer coisa nessa máquina precisa olhar o que já está lá
antes: foi por isso que as rotinas do buildflow ficaram às 04:10/04:20.

**O buildflow aparentemente não tem backup.** O trajano tem; o buildflow, até
onde esta sessão viu, não — nem do Postgres nem do volume de uploads. O volume
é o mais grave, porque comprovante de pagamento, foto de entrega e as imagens
da LP vivem em disco e não saem num dump do banco. Onde verificar: EasyPanel →
serviço `db` → `Cópias de segurança`. **Perder o banco é irreversível; o dono
optou por olhar isso depois.**

| **Candidatura aprovada também é apagada no dia 90** | `src/lib/wholesale-retention.ts` | Registrado como `shortcut:` no módulo. Aprovada no dia 85, o contato some em 5 dias, porque a aprovação não cria Customer e o contato vive só na candidatura. O dono escolheu a opção C: o conserto é a **aprovação** passar a gravar o que o negócio precisa, com finalidade própria — não esticar o prazo de todo mundo |
| **8 advisories *high* na cadeia do Tailwind 3** | `package.json` | Só zeram com Tailwind 4, que reescreve o design system |
| **`next` em *moderate*** | `package.json` | Só zera com Next 16, que quebra a aplicação hoje |
| **Fila de leads sem rejeição em lote** | `/vendas/analise-clientes` | Decisão do dono: segue 1 a 1. O ataque mais barato continua sendo encher a fila de candidaturas plausíveis |
| **Divergência de copy na pergunta 18** | `apply-form.tsx` | Resolvido por `aria-describedby`, não por alinhar o texto — o rótulo é o nome do campo nas recusas do servidor e não pode crescer |

---

## 3b. Escopo pedido e ainda não implementado

Em 17/10/2026 o dono passou um escopo novo, capturado em
`docs/superpowers/specs/2026-10-17-lp-geral-round-robin-escopo.md`:

1. **Desativar a LP da Lov** (diverge do estilo da OKEY; o redesenho vem depois).
2. **LP geral sem identificador na URL**, com **distribuição round-robin** dos
   cadastros entre a equipe de Atacado.
3. O botão de copiar o link dela em `/vendas`.

**Nada foi implementado.** O documento separa o que o dono decidiu do que está
em aberto — são seis perguntas cujas respostas mudam a implementação, e a mais
cara delas é o que "desativar" significa para os links da Lov que já estão
circulando em WhatsApp de lojista.

O documento também registra a armadilha técnica: round-robin ingênuo é
read-then-write, e duas lojistas enviando no mesmo segundo caem na mesma
vendedora. É o mesmo defeito que `assignLeadSeller` tinha e que foi corrigido
em 16/10 — a correção está lá como referência.

---

## 4. O que NÃO foi verificado

- **As telas do dashboard depois da troca de cor.** 140 classes renomeadas e 4
  cores escurecidas. `tsc`, 29 checks e `next build` passam — nenhum dos três
  enxerga cor errada numa tela. Houve **uma** conferência visual parcial: um
  print de `/vendas` em produção, tema escuro, papel VENDAS, onde título, aba,
  badges e a tarja de Pendência estão legíveis. Faltam `/dashboard`,
  `/financeiro`, `/logistica`, `/motorista` e **o tema claro inteiro** — que é
  justamente onde os seis setores reprovavam antes.
- **O login pela tela, depois do rate limit no Postgres.** Server Action não
  responde a POST de `curl`, e a extensão do navegador caiu. O que está provado é
  o módulo contra o banco (13 asserções, incluindo o teto de 8/15min do login) e
  o `await` conferido pelo compilador nos 8 pontos de chamada. O caminho
  completo do formulário de login não foi reexercitado.
- **360 px num aparelho real.** A prova feita foi estrutural (zero largura fixa,
  zero `nowrap` largo, `min-width: 0` no fieldset presente): janela maximizada no
  Windows ignora `resize`, e `X-Frame-Options: DENY` — corretamente — bloqueou a
  medição por iframe.
- **O gesto de 800 ms num celular real.** Foi exercitado com eventos de ponteiro
  sintéticos a 950 ms, e o `user-select: none` está no alvo. Dedo de verdade em
  tela de verdade, não.
- **"Copiar link de indicação" em produção**, que depende da pendência 1.

**A lição da sessão 3 vale de novo, por outro caminho:** a rodada que achou os
dois defeitos críticos foi a que **mediu no navegador** — contraste calculado,
`document.fonts` lido, formulário preenchido de verdade. `tsc` limpo, 29 checks
verdes e quatro rotas em 200 descrevem um sistema que compila, não uma página
que funciona.

---

## 5. Como retomar

1. Confirme o estado: `git log --oneline -1` deve dar `be0ffe8`, e
   `git status` deve estar limpo. Não há trabalho não comitado.
2. `npm run dev` (esta sessão deixou o servidor parado).
3. Se for mexer em produção, comece pela pendência **6** — enquanto o
   `AUTH_SECRET` antigo valer, qualquer um com aquele print entra como GESTÃO.
4. Depois o bloco 1–3 (as duas variáveis e o agendador), que é o que faz a
   promessa dos 90 dias do rodapé ser cumprida.
5. As pendências 4 e 5 (fotos e `alt`) são conteúdo e fecham a LP pública.
6. A seção 4 é a dívida de verificação. A mais barata e mais útil: abrir as cinco
   telas do dashboard **nos dois temas** e olhar.

**Comandos de prova desta sessão**, para repetir:

```bash
npx tsc --noEmit
for f in scripts/checks/*.ts; do npx tsx "$f" || echo "FALHOU $f"; done
npx next build          # exige o next dev parado: os dois disputam o .next
```
