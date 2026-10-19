# Handoff — rodízio, filtros e o que ficou (sessão 6)

**Data:** 19/10/2026 · **Branch:** `master` · **HEAD:** `e03a2aa`
**Estado:** tudo comitado e pushado. Árvore limpa, `origin/master` em dia.
**Produção:** no ar (`/api/health` 200). **Mas o deploy do `e03a2aa` pode não
ter saído ainda** — conferir antes de supor que os filtros estão lá.

**Leia primeiro:** `handoff-2026-10-17-master-select-lgpd-next15.md`. Ele cobre
o merge no master, o Select, a LGPD, o Next 15 e as cores — e **não repito nada
dele aqui**. Este arquivo é só a continuação (18 e 19/10), mais a lista viva de
pendências.

---

## 1. O que esta sessão fez

Nove commits, de `affad68` a `e03a2aa`.

### Link de indicação: um botão por marca, e depois só a OKEY

`affad68` trocou o botão único (marca fixa em OKEY) por um por marca. `5a53f5f`
tirou o da Lov a pedido do dono — a LP dela diverge do estilo da OKEY e será
redesenhada.

**Tirou o BOTÃO, não a ROTA, e a diferença é a lojista.** `/atacado/lov-club`
continua respondendo 200: o link que alguma vendedora já mandou para um WhatsApp
continua abrindo e a candidatura ainda entra. O que parou foi a criação de links
novos. Devolver a rota depois não desfaz nada; devolver um 404 depois não traz
de volta quem bateu numa página de erro.

Os leads com `brand: LOV_CLUB` seguem intactos. Para trazer a Lov de volta:
reimportar `Heart` e devolver uma linha em `copiar-link-atacado.tsx` — a action
nunca foi tocada.

### Rodízio das candidaturas do link geral (`5afa4a6`)

A entrega grande desta sessão. **Duas portas, dois comportamentos:**

```
/atacado/okey?r=CODIGO   dona FIXA, não roda       (link da vendedora)
/atacado/okey            RODÍZIO, passa a cada dia (link da Gestão)
```

**Não existe LP nova.** A "LP geral" é a mesma página sem o `?r=`. Criar uma
separada duplicaria copy, imagens e o digest da trava de conteúdo, e as duas
divergiriam na primeira edição.

A regra, decidida pelo dono: a candidatura passa para a vendedora seguinte a
cada dia em que ninguém avalia, contado **da chegada**, e segue passando **até
alguém avaliar** — sem teto de voltas.

**Contar da chegada é o que deixa isto ser uma conta.** Se o prazo corresse de
"quando esta vendedora recebeu", a dona dependeria do histórico, precisaria ser
gravada a cada passagem e exigiria um relógio batendo. Contando da chegada:

```
voltas = dias inteiros desde createdAt
dona   = ativas[(rodizioIndice + voltas) % ativas.length]
```

**A `SEQUENCE` do Postgres é o que elimina a corrida.** Ler "qual foi a última"
e somar um perde quando duas lojistas enviam no mesmo segundo — e com link em
grupo de WhatsApp isso não é hipótese. `nextval()` é atômico por natureza.
Mesmo erro que `assignLeadSeller` já teve, e mesma razão de a contagem do rate
limit ter ido para uma instrução SQL única.

**Gravado, reconciliado na leitura — não derivado puro.** `listLeadsFor` filtra
por `sellerId` dentro do SQL e pagina no banco; dona calculada em JavaScript
obrigaria a carregar todas as pendentes para filtrar na memória. Na leitura e
não num agendador porque o prazo é de um dia e a rotina diária roda uma vez:
"1 dia" viraria "até 2 dias". Mesmo padrão do Select.

Uma coluna carrega duas informações: `rodizioIndice` NULL = veio pelo link de
uma vendedora; número = veio pelo geral e é a posição na fila. Índice **parcial**
no banco, porque com o tempo a maioria terá NULL.

**A distribuição manual da Gestão saiu** (`assignLeadSeller` e
`DistribuirLeadSelect`), a pedido do dono: as duas não podiam conviver, porque o
rodízio desfaria no dia seguinte a atribuição que a Gestão tivesse acabado de
fazer. A migration faz **backfill** das candidaturas sem dona que já existiam —
sem ele ficariam sem nenhum caminho de atribuição. A fila "sem vendedora" virou
**aviso**: candidatura ali significa que não havia vendedora ativa, e o que
resolve é ativar uma.

Sem nenhuma vendedora ativa, `sellerId` fica nulo e o índice é gravado mesmo
assim — a atribuição acontece na primeira leitura depois de alguém ser ativada.
Recusar perderia a candidatura de quem já preencheu dezoito campos.

### Busca e filtros na Análise de Clientes (`e03a2aa`)

Busca por nome + filtros de Status, Auxiliar e Vendedora, no `useFilterQuery`
que o resto do app já usa (estado na URL, texto com debounce, selects na hora).

**O filtro de vendedora é decidido no SERVIDOR.** Em `listLeadsFor` o escopo vem
primeiro: para quem é de Vendas o `sellerId` já está fixado no próprio id, então
`?vendedora=<outro id>` na barra de endereços não alarga nada. Esconder o select
e ignorar o parâmetro são duas decisões, e só a segunda é segurança — testada
contra o banco.

As opções de **Auxiliar** respeitam o escopo: oferecer a uma vendedora o nome de
um auxiliar que só aparece em candidatura de outra pessoa já contaria algo que
ela não deveria ver. A lista de **Vendedoras** inclui as inativas de propósito —
candidatura antiga aponta para quem saiu da equipe.

### Menores

- **Cor de marca** (`5afa4a6`): o botão OKEY ganhou o creme `#f0e6a8` pedido
  pelo dono. Com texto branco dá 1,27:1 e com o `--foreground` do tema escuro
  1,03:1 — ilegível nos dois. Com texto escuro **fixo** (`#3a2a00`): 10,98:1, e
  9,98:1 no hover. Mesmo arranjo que `distribuicao` já usa com o âmbar. Não
  entra na paleta de setor: setor diz em que módulo a pessoa está, marca diz de
  qual LP é o link. O check de contraste cobre isso.
- **E-mail do Art. 18** (`df5f844`): `contato@okeystore.com.br` →
  `okeytecnologia@gmail.com`, nos dois lugares (rodapé e aviso de privacidade).
- **`baseValidada()` extraída**: a validação da `APP_BASE_URL` agora é uma só
  para o link por vendedora e para o geral.
- **Agendador configurado** (`25ca449`): ver seção 2.
- **Escopo da LP geral** registrado em
  `docs/superpowers/specs/2026-10-17-lp-geral-round-robin-escopo.md`.

### Um pedido que foi feito e desfeito

O dono pediu para reduzir o aviso de privacidade do rodapé à frase única, eu
fiz, e ele reverteu antes de qualquer commit (*"vamos seguir a LGPD"*). **Nada
chegou a ser comitado nem publicado** — o aviso completo do Art. 9 continua no
ar como estava. Registrado para ninguém "reaplicar" uma mudança que foi
cancelada.

### Verificação ao fechar

`npx tsc --noEmit` limpo · **30/30** checks · `npx next build` completo · o
rodízio exercitado **contra o banco** (três candidaturas seguidas caindo em três
vendedoras diferentes, uma de 1 dia passando para a seguinte, uma decidida de 5
dias que NÃO roda) · os filtros exercitados contra o banco, inclusive a prova de
que uma vendedora passando `?vendedora=` de outra não vê nada a mais.

Dados de teste criados e apagados; as vendedoras reais foram reativadas ao fim.

---

## 2. O que FOI resolvido das pendências anteriores

- ✅ **`APP_BASE_URL` e `SELECT_CRON_SECRET`** no ambiente de produção.
- ✅ **Agendador.** `crontab` do root na VPS, **04:10 e 04:20**:
  ```cron
  10 4 * * * curl -fsS -X POST https://buildflowapp.com.br/api/cron/selects -H "Authorization: Bearer <segredo>" >/dev/null 2>&1
  20 4 * * * curl -fsS -X POST https://buildflowapp.com.br/api/cron/leads   -H "Authorization: Bearer <segredo>" >/dev/null 2>&1
  ```
  Provado na hora com o segredo lido de dentro do próprio crontab. **A saída vai
  para `/dev/null`: uma falha de autorização é SILENCIOSA.** O único lugar onde
  ela apareceria é EasyPanel → `web` → Logs (`POST /api/cron/leads 200`).
- ✅ **As 4 fotos da LP** em produção (conferidas de fora).

### ⚠️ Incidente registrado: o crontab do outro sistema foi perdido

A VPS roda um segundo sistema em `/root/trajano` (banco + API + web, com
`065_cor_okey.sql` entre as migrations). Ele tinha um backup diário às **03:17**
— `roles + db + imagens`, rotação de 14 dias — agendado no mesmo `crontab` do
root.

Durante a edição do crontab pelo console web, **essa linha foi perdida**. O dono
foi avisado, optou por não restaurar (*"não quero consertar nada"*) e depois
pediu para seguir sem ela. **O agendamento do backup do trajano não está mais
no crontab.** A linha original, caractere por caractere:

```cron
17 3 * * * IMAGENS_MOUNTPOINT=/var/lib/docker/volumes/trajano-imagens/_data /root/trajano/src/scripts/backup-vps.sh >> /root/trajano/backups/backup.log 2>&1
```

O script, os backups já feitos e o volume não foram tocados — só o agendamento.
Para conferir se ainda roda: `tail -5 /root/trajano/backups/backup.log`.

---

## 3. Pendências — todas do dono, nenhuma de código

### 🔴 1. `AUTH_SECRET` de produção exposto

Em 17/10 um print das variáveis do EasyPanel foi compartilhado em texto legível,
e o painel está em **HTTP num IP público** (`187.127.10.50:3000`) — os mesmos
valores já trafegavam em claro a cada acesso.

Expostos: `AUTH_SECRET`, senha do Postgres, `VAPID_PRIVATE_KEY`,
`CONNECT_INTEGRATION_TOKEN`, `CONNECT_WEBHOOK_SECRET`.

**O `AUTH_SECRET` é o urgente: ele assina as sessões, e quem tiver aquele print
forja sessão de GESTÃO sem senha.** O dono marcou 19/10 para trocar; **no
fechamento desta sessão ainda não havia trocado.** A senha do Postgres de
produção é, além disso, a mesma do `.env` local.

Como: gerar com `openssl rand -base64 32` (ou o equivalente em PowerShell),
EasyPanel → `web` → `Ambiente` → substituir → Salvar → Implantar. Todos
deslogam e entram de novo com a mesma senha.

### 🔴 2. O buildflow não tem backup nenhum

Conferido em 17/10: `db` → `Cópias de segurança` dizia *"Não há backups de banco
de dados no momento"* e *"Nenhuma ação encontrada"*. **Nunca foi feito um.**

A tela de criar backup já foi aberta e aceita agendamento. O que preencher:

```
Ativado      ligado          Cron       0 0 * * *   (meia-noite, longe das outras rotinas)
Agendar      Todos os dias   Retention  14          <- NAO "Unlimited"
Nome         buildflow       Provedor   Local Disk  (é a única opção cadastrada)
Caminho      buildflow/db
```

**`Retention` não pode ficar "Unlimited":** a candidatura é apagada do banco aos
90 dias, como o rodapé da LP promete; se os backups forem guardados para sempre,
os dados dela continuam existindo neles e o apagamento vira só aparência. 14 é o
mesmo prazo que o outro sistema usa.

**E essa tela não cobre o volume de uploads** — comprovantes de pagamento, fotos
de entrega, fotos das candidatas e imagens da LP vivem em disco, não no
Postgres. Um dump leva o *caminho*, não os arquivos. Falta um backup do volume
(o script do trajano faz `tar` do volume dele e é o modelo).

**Local Disk tem limite honesto:** protege contra apagar dado sem querer e
contra deploy ruim; **não** protege contra o servidor morrer. Offsite (Backblaze
B2 ou Cloudflare R2 têm 10 GB grátis) ficou para depois.

### 3. Painel do EasyPanel sem HTTPS

`187.127.10.50:3000` em HTTP num IP público. O dono não tem a senha de SSH e não
quis trocar a senha de root. O caminho sem SSH é apontar um subdomínio
(`painel.buildflowapp.com.br`) para o IP e configurar o domínio do painel, que
emite o certificado sozinho. O console web da VPS **abre logado como root**, se
um dia precisar.

### 4. As 4 descrições de imagem (`alt`) da LP

Conferido em produção: as quatro imagens estão no ar e os quatro `alt` estão
**vazios**. Leitor de tela não ouve nada no herói nem nos três motivos. O dono
disse que escreveria e depois pediu para não investigar mais — **continua
aberto**. O editor tem o campo e o botão "Salvar descrição"; se ao salvar
aparecer alguma mensagem diferente de *"Descrição salva."*, é defeito e precisa
ser investigado.

### 5. Deploy do `e03a2aa`

Os filtros da Análise de Clientes foram pushados mas o deploy pode não ter
saído. **Este deploy leva duas migrations**: `rate_limit_hit` e
`wholesale_rodizio` (SEQUENCE + coluna + backfill). As duas são aditivas e
idempotentes.

---

## 4. O que NÃO foi verificado

- **As telas do dashboard depois da troca de cor** (140 classes renomeadas, 4
  cores escurecidas, mais o creme novo). Houve **uma** conferência parcial: um
  print de `/vendas` em produção, tema escuro, papel VENDAS. Faltam
  `/dashboard`, `/financeiro`, `/logistica`, `/motorista` e **o tema claro
  inteiro** — justamente onde os seis setores reprovavam antes.
- **Os quatro controles de filtro lado a lado em tela estreita.** `tsc`, build e
  os testes contra o banco passam; nenhum deles mostra layout.
- **O login pela tela depois do rate limit no Postgres.** Server Action não
  responde a POST de `curl`. Provado: o módulo contra o banco (13 asserções) e o
  `await` conferido pelo compilador nos 8 pontos.
- **360 px num aparelho real** e **o gesto de 800 ms num celular real**.
- **O rodízio em produção**, com candidatura de verdade. Provado contra o banco
  local.
- **Restauração de backup.** Backup que nunca foi restaurado é hipótese, não
  garantia — vale testar o "Restaurar" uma vez num momento calmo.

---

## 5. Como retomar

1. `git log --oneline -1` deve dar `e03a2aa`; `git status` limpo. Não há
   trabalho não comitado.
2. `npm run dev` (esta sessão deixou o servidor parado — foi derrubado para
   regenerar o Prisma Client).
3. Se for mexer em produção, a ordem é **pendência 1 → 2 → 5**: trocar o
   `AUTH_SECRET`, criar o backup, conferir o deploy.
4. Escopo já capturado e **não implementado**: o redesenho visual da LP da Lov
   (o dono disse que manda paleta e especificação depois).

**Comandos de prova:**

```bash
npx tsc --noEmit
for f in scripts/checks/*.ts; do npx tsx "$f" || echo "FALHOU $f"; done
npx next build          # exige o next dev parado: os dois disputam o .next
```

**Números de hoje:** 30 checks · 50 migrations · `master` = `origin/master`.

---

## 6. Como esta sessão trabalhou (vale repetir)

Dois defeitos críticos desta leva de trabalho **só apareceram medindo**, nunca
em `tsc`, nos checks ou no código HTTP das rotas: as fontes da LP que o
middleware barrava (a página rodava em Georgia e ninguém via) e as seis cores de
setor reprovando contraste no tema claro.

A regra que saiu disso, e que vale para quem continuar: **contraste se mede, cor
não se olha; fonte se confere em `document.fonts`, não no CSS; e rota pública se
confere com `curl`, não com build verde.**

O outro padrão que se repetiu: **toda corrida deste repositório foi resolvida
mandando o banco decidir** — `updateMany` condicionado em `assignLeadSeller`, a
instrução SQL única do rate limit, e a `SEQUENCE` do rodízio. Quando aparecer a
próxima, é por aí.
