# Handoff — correções da LP de Atacado (sessão 4)

**Data:** 16/10/2026 · **Branch:** `feat/lp-atacado-analise-clientes` · **HEAD:** `3171230`
**Estado:** tudo abaixo está **na árvore de trabalho, NÃO comitado.**

**Leia antes:** `docs/handoff-lp-atacado-2026-10-16.md` continua sendo o documento
de entrada para contexto, specs e pendências do dono. Este arquivo só registra o
que a sessão 4 mudou e o que sobrou.

---

## 1. O que esta sessão fez

Revisou os três commits da sessão 3 (`90e7ca0..3171230`) com dois subagentes —
uma revisão de código e uma auditoria de segurança da nova superfície pública — e
corrigiu os achados.

**Verificação ao fechar:** `npx tsc --noEmit` limpo · **24/24** checks de
`scripts/checks/` verdes · as quatro rotas conferidas por HTTP contra a linha de
base (`/atacado/okey` 200, `/atacado/lov-club` 200, `/atacado/nike` 404,
`/login` 200, `/dashboard` 307) · `theme-color` `#fbf9f6` na LP e `#29A0D9` no
login, provando que a sobrescrita segue escopada por rota.

### Critical

| # | Defeito | Conserto |
|---|---|---|
| 1 | **Aplicação inteira em 500**, inclusive `/login`. `modo-edicao.tsx` é client component e importava `@/lib/lp-assets`, cuja primeira linha era `import ... from "fs/promises"` — o webpack não resolvia `fs` no bundle do navegador e a compilação morria | `src/lib/lp-assets.ts` ficou **puro** (constantes, tipos, guardas de texto); o I/O foi para **`src/lib/lp-assets-server.ts`** (arquivo novo). A separação é a barreira: nada que só exista no Node entra no módulo que o cliente importa |
| 2 | **Fotos das candidatas legíveis sem sessão.** `PASTA_PUBLICA` era `"atacado"`, a mesma pasta onde `wholesale-apply.ts` grava as duas fotos de cada lead, com a mesma extensão `.webp`. `GET /api/lp/atacado/2026/10/loja_<uuid>.webp` devolvia a foto da loja de uma não-cliente, com `Cache-Control: public, immutable` de um ano | `PASTA_PUBLICA = "lp-publico"`. Namespace separado na origem; tudo é derivado da constante. **Provado por HTTP: o caminho de lead agora dá 400** |
| 3 | **LP abria rolada nos 18 campos.** O efeito que leva o foco ao título da etapa rodava na montagem, e o alvo fica na última seção antes do rodapé | Guarda de primeira execução (`montou` ref) em `apply-form.tsx` |

### Important

- **Erro de etapa 1 aparecendo na etapa 4.** DDD do WhatsApp, ponto no domínio do
  e-mail e `@` sozinho só eram ditos pelo servidor. Agora `etapaValida()` aplica
  as mesmas funções puras via `setCustomValidity`, no balão nativo da etapa dona.
- **Corrida do manifesto.** O risco não era dois editores: era o mesmo dono
  trocando duas imagens em sequência (a segunda sobrescrevia a entrada da
  primeira e deixava o arquivo órfão). O contexto do modo edição ganhou
  `ocupado`, que trava todos os campos enquanto qualquer gravação está em voo.
- **Descrição da imagem não salvava sozinha.** A action aceita `imagem: ""` como
  "só atualizar o alt" (exige que a entrada já exista), e o editor tem botão
  "Salvar descrição".
- **Gatilho de 800 ms provavelmente não completava no celular.** O alvo era texto
  selecionável: a seleção nativa dispara aos ~500 ms e emite `pointercancel`.
  Acrescentado `user-select: none` e `-webkit-touch-callout: none`; o `<span>`
  virou `<div>` (o filho é um `<p>`, bloco dentro de inline é HTML inválido).
- **Fontes com descritor legado sem fallback.** `format("woff2-variations")`
  sozinho; se o motor não reconhece, o `@font-face` fica sem fonte e a página cai
  em Georgia com `font-display: swap` escondendo o erro. Agora três entradas:
  `format("woff2") tech(variations)`, o legado, e `format("woff2")`.
- **Dez afirmações comerciais fora da trava de digest.** Margem, tecido,
  atendimento e exclusividade estavam em texto fixo no TSX, que declara no próprio
  cabeçalho não escrever afirmação comercial. Movidas para `wholesale-content.ts`
  como `metrics`, `highlights` e `metaDescription`; o digest passou a cobri-las.
  **Digest novo: `196980fc...603a`** (o antigo cobria só reasons+advantages+faq;
  nenhum texto da planilha mudou). A única frase reescrita foi a meta description,
  para carregar a condição da margem ("conforme a linha e o volume") que ela
  omitia — e ela é a primeira coisa que a lojista lê no preview do WhatsApp.
- **`assignLeadSeller` era read-then-write.** Virou `updateMany` com
  `sellerId: null` no WHERE, idioma que `actions/deliveries.ts` já usa.
- **Relógio do celular.** O cliente mandava `Date.now()` e o servidor subtraía do
  seu: celular adiantado dava diferença negativa e **nunca conseguia enviar**.
  Agora o cliente manda **tempo decorrido** (`performance.now()`, monotônico), e o
  campo do payload é `msPreenchendo` — não existe mais comparação entre relógios.

### Segurança

- **`getClientIp` só devolve IP literal** (`isIP` de `node:net`), falhando
  fechado em `"desconhecido"`. Fecha os dois gatilhos (hop configurado acima do
  real e o fallback `x-real-ip`) e protege o rate limit **do login**, que usa a
  mesma função. Resolve o L1 de graça: `submittedIp` passa a ser um IP ou nada.
- **`/api/uploads/atacado/*` exige `canUseWholesaleTool`**, não só "tem sessão".
  Escopado só a essa pasta: comprovantes e notas fiscais têm outras regras.
- **A falha de banco virou `GENERICO`.** A mensagem anterior contava a um
  remetente sem sessão que a escrita falhou. As duas recusas de sharp seguem
  específicas de propósito — a lojista precisa saber qual foto trocar.
- **`realpath` na rota pública** antes de ler o arquivo (`path.resolve`
  canonicaliza texto; `readFile` segue symlink). Defesa em profundidade.
- **Gramática do Instagram** (`^[A-Za-z0-9._]{1,30}$`), com `normalizarInstagram`
  reduzindo ao handle o que a lojista realmente cola ("Copiar link do perfil"
  entrega a URL completa). Fecha L2 e M12 juntos.

### Minor

Slug de marca **recusado** em vez de higienizado (higienizar colapsava slugs
distintos na mesma pasta, e um slug vazio punha o manifesto na raiz
compartilhada) · caminho relativo do manifesto derivado do **disco**
(`caminhoRelativoDaLp`) e não de um `replace` da base pública configurável ·
herói com `loading="eager"` + `fetchPriority="high"` (é a imagem de LCP) ·
cancelar o seletor de arquivo não apaga mais a foto já aceita · teto de 4 MB e
instrução de HEIC também no editor · `router.refresh()` depois de trocar imagem
(a rota é dinâmica, `revalidatePath` sozinho não aparecia) · barra de progresso
conta etapa **concluída** · `canSeeLead` confere `actor.userId` · 
`classifyDuplicateMatch` lança em vez de rotular "telefone" quando nada casou ·
mensagem do rate limit diz "mais tarde" (o balde é de 60 min) · CSS órfão
`.ficha-imagem` removido · tupla `LUGARES_DOS_MOTIVOS` em vez de cast.

### Checagens novas que prendem os consertos

- `scripts/checks/lp-assets.ts`: afirma que `PASTA_PUBLICA !== "atacado"` e que
  os caminhos de lead (`atacado/2026/10/loja_<uuid>.webp`,
  `instagram_<uuid>.webp`) são **recusados**. Fica vermelho se alguém reaproximar
  os namespaces.
- `scripts/checks/wholesale-apply-validation.ts`: lê o `rotulo=` de cada campo em
  `apply-form.tsx` e compara com a tabela do validador — os rótulos do servidor
  agora são os da tela ("Como podemos te chamar?", não "Nome completo"). Mutação
  conferida: trocar um rótulo deixa a linha vermelha. Mais 14 casos de Instagram.
- `scripts/checks/wholesale-content.ts`: digest novo, mais asserções de que as
  **três** aparições da margem carregam a condição.

---

## 2. Pendências — só o dono resolve

1. **Comitar o Select no `master`.** A branch não compila em checkout limpo:
   `wholesale-apply.ts` importa `validateUploadDataUrl`, que só existe no
   `image.ts` não comitado. O commit precisa levar: `src/lib/image.ts`,
   `src/components/ui/button.tsx` (o `variant="servico"`),
   `tailwind.config.ts`, **as 3 pastas de migration** e o botão "Novo select" de
   volta em `(dashboard)/vendas/page.tsx`.
2. **🔴 Schema sem migration — risco achado nesta sessão.** O commit `e6a1de6`
   arrastou 5 models + 2 enums do Select para o **schema comitado** (linhas
   1044–1191), e **nenhuma migration comitada cria essas tabelas** — as 3 que
   criam estão não rastreadas. O `CMD` do container é
   `migrate deploy && node server.js`: banco sem as tabelas, Prisma Client com
   elas. Não derruba hoje (nenhum arquivo comitado consulta `selectContract`),
   derruba no instante em que o código do Select for comitado sem as migrations.
   **Correção para o handoff anterior:** ele diz que `schema.prisma` carrega
   trabalho não comitado do Select. Não carrega — `git status` mostra o arquivo
   limpo. O acidente que ele avisava já aconteceu.
3. **`APP_BASE_URL`** — ausente de todos os `.env`. Sem ela o botão "Copiar link"
   responde *"APP_BASE_URL não configurada no servidor."* Precisa de `https://` e
   sem espaço em volta, no `.env` local e no runtime do EasyPanel.
4. **As fotos.** Os quatro lugares (`hero`, `motivo-1..3`) estão no espaço
   reservado. Entrar como `GESTAO`, abrir a LP, **pressionar e segurar 800 ms o
   nome da marca no rodapé**, subir uma por vez.
5. **Os fatos da marca** — o dono pediu para ignorar os da referência (telefone,
   endereço, "Desde 2014", prazos, promessa de contato em 2h) e mandar os dele.
   Nada disso está na página.
6. **Os 3 parágrafos dos motivos.** A planilha só tem título e subtítulo; não
   foram inventados.
7. **Decidir o upgrade do Next.** 14.2.35 com 24 advisories abertas, duas
   CRITICAL, sem patch em 14.x. A que toca de frente é **DoS no App Router via
   Server Actions**, que cai na porta pública. **Não rodar `npm audit fix
   --force`** (instala `next@16.4.1` e quebra a aplicação). Agendar 14 → 15.5.24+
   ou aceitar o risco por escrito.
8. **O aviso de privacidade completo.** Hoje a página tem **uma linha** no rodapé
   com a finalidade. Falta controlador, prazo de retenção e contato para os
   direitos do titular (Art. 9). É texto, e texto é do dono.

---

## 3. Achados abertos que ninguém consertou

| Achado | Onde | Por que ficou |
|---|---|---|
| **Sem retenção e sem exclusão** (LGPD Arts. 15/16) | não existe `wholesaleLead.delete` em lugar nenhum | Precisa de decisão de prazo (90 dias é defensável) e de um job agendado. `deleteUploadedFile` já existe e já recusa sair da raiz |
| **Rate limit em memória do processo** | `src/lib/rate-limit.ts` | Restart, OOM ou redeploy zera; duas instâncias = teto de 30/h em silêncio. Conserto é store compartilhado, decisão de arquitetura |
| **Fila sem rejeição em lote** | `/vendas/analise-clientes` | O ataque mais barato não é a queda, é encher a fila com candidaturas plausíveis — 3.600 linhas são 3.600 julgamentos |
| **`/api/cron` na allowlist pública** | `src/middleware.ts` | Aberto por decisão: remover agora quebraria o agendador do Select. **Deve sair no commit do Select** |
| **Spec diz `NEXT_PUBLIC_APP_URL`, código lê `APP_BASE_URL`** | decisão 35 | Emendar a spec |
| **Divergência de copy na pergunta 18** | `apply-form.tsx` | A planilha traz o parêntese junto; a página o quebra em parágrafo. Registrar ou alinhar |
| **Sem caminho de teclado para o gatilho oculto** | `modo-edicao.tsx` | Um GESTÃO só de teclado não alcança o editor. O comentário rejeita atalho com motivo declarado; sem plano B |
| **Specs afirmam o que o código não cumpria** | decisão 26 da spec principal, decisão 3 da spec do editor | Emendar junto: `atacado/<ano>/` é da candidata (autenticado), `lp-publico/<slug>/` é da LP (público) |

---

## 4. O que NÃO foi verificado

- **Aparência.** O navegador ficou disponível no fim da sessão e a LP foi
  confirmada carregando, mas **não houve inspeção visual**: contraste medido,
  360 px sem rolagem horizontal, as duas fontes carregando, o acordeão do FAQ.
- **O cadastro em 4 etapas na prática** — avançar, voltar, a validação nova por
  etapa, e o `<input type="file">` remontado ao voltar para a etapa 2.
- **O editor de ponta a ponta** — o gesto num celular real, a troca de imagem, a
  leitura pela rota `/api/lp`. As correções do gesto e do HEIC são de mecanismo
  conhecido, não medidas.
- **Nenhum envio de formulário completo.** O caminho `msPreenchendo` e as regras
  por etapa não passaram por um envio real.
- **O dashboard nos dois temas** depois do mundo visual novo.
- **`next build`** — proibido enquanto o `next dev` do dono compartilha o `.next`.
  O `tsc` limpo não é o build.

**A lição da sessão 3 continua valendo e foi reconfirmada:** rodada que toca CSS
ou rota pública e não termina em `curl` é rodada não verificada. O defeito que
derrubou a aplicação inteira (Critical 1) passava por `tsc` limpo e 24 checks
verdes — só bater na porta pegou.

---

## 5. Como retomar

1. Peça o `next dev` de pé e confirme as quatro rotas (seção 1 deste doc tem a
   linha de base).
2. Revise o diff não comitado desta sessão — **nada foi comitado de propósito**,
   para o dono ver antes.
3. Com o navegador, feche a seção 4: abrir a LP, medir contraste, 360 px,
   percorrer as 4 etapas e trocar uma imagem no editor.
4. Depois, o bloco da seção 2 (o commit do Select resolve 1 e 2 juntos).

**Não comitado nesta sessão, por arquivo:** `src/lib/lp-assets.ts` (reescrito),
`src/lib/lp-assets-server.ts` (**novo**), `src/lib/request-ip.ts` (reescrito),
`src/lib/actions/lp-assets.ts`, `src/lib/actions/wholesale-apply.ts`,
`src/lib/actions/wholesale-leads.ts`, `src/lib/wholesale-apply-validation.ts`,
`src/lib/wholesale-content.ts`, `src/lib/wholesale-permissions.ts`,
`src/lib/wholesale-queries.ts`, `src/app/api/lp/[...path]/route.ts`,
`src/app/api/uploads/[...path]/route.ts`, `src/app/atacado/atacado.css`,
`src/app/atacado/[marca]/{page,sections,apply-form,modo-edicao}.tsx`,
`scripts/checks/{lp-assets,wholesale-apply-validation,wholesale-content}.ts`.

Os outros ~45 caminhos não comitados são da feature Select e do trabalho do dono
no IDE — **não** desta sessão. Nunca `git add -A`.
