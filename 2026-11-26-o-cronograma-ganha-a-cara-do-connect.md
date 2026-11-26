# O Cronograma ganha a cara do Connect, e o trabalho finalmente sobe

26 de novembro de 2026 — a sessão dos ajustes finos, da prova de verdade e do push

Este documento continua o `2026-11-25-cronograma-no-marketing-e-ferramenta-de-ia.md`.
Aqui se registra o acerto do visual contra o Build.Connect imagem por imagem, o
que apareceu sem ser procurado, o que foi provado e o que **não** foi — e, pela
primeira vez em três sessões, o trabalho **commitado e no GitHub**.

**Estado ao fim:** `tsc --noEmit` exit 0 · **55 checagens** (`npm run check`,
**999 asserções**) · `npx next build` limpo, do zero, com o servidor parado ·
**2 commits em `master`, push feito** (`afed508..6a8213e`) · 36 arquivos,
**+4589 −784**, 19 arquivos novos · conferido no navegador nos dois temas, com o
**Build.Connect no ar**.

**O que subiu já está no GitHub. O que ainda NÃO está em produção:** as duas
migrações e a chave do Gemini. Ver §6.1 e §6.2.

---

## 1. O que foi feito

### 1.1 O Relatório Semanal (três ajustes pedidos)

O disco de iniciais do cartão foi de **24 para 28px**. É a única pista de quem
toca a tarefa numa varredura da coluna, e com duas iniciais em 10px ele pedia
aproximação. O círculo tracejado de "sem responsável" cresceu junto — se só um
dos dois mudasse, a fileira de cartões desalinhava.

**"Tarefas por status" e "Categoria × status" viraram gavetas FECHADAS por
padrão.** Elas ficam depois do quadro, e abertas empurravam as colunas para cima
da dobra: quem abre o Kanban vem mexer em cartão, não ler tabela. Fechadas, os
dois títulos viram um índice do que há embaixo.

São **`<details>` nativos**, e não `useState`: o painel é componente de servidor,
e abrir uma gaveta não vale mandar JavaScript ao navegador. De graça vêm o
teclado, o leitor de tela e o "localizar na página", que acha texto dentro da
gaveta fechada e a abre sozinho.

**A aba 6 deixou de se chamar "Pauta" e virou "One-on-one"** nos quatro lugares
em que é RÓTULO: o passo do editor, o título do bloco, a aba da ficha de leitura
e o cabeçalho do PDF. Onde "pauta" aparece no meio de uma frase explicativa
continua — ali é a palavra comum do português, não o nome do campo.

### 1.2 O Cronograma ganhou a cara do Connect

A descoberta que organizou tudo: **o Connect usa DUAS receitas de selo**, e qual
vale depende de onde o selo está.

| Onde | Receita |
|---|---|
| **Chip do calendário** | cor cheia no fundo (sólido) |
| **Ficha e telas largas** | translúcido — borda em 35%, fundo em 12% |

E não é incoerência dele: o chip mede dois centímetros e pode estar **sobre o
amarelo de uma marca**. A cor cheia é a única que não depende do que está atrás.

Isso resolveu de quebra um remendo da sessão anterior: havia **duas versões** do
selo no card (uma para card neutro, outra para card de marca, com a cor na
borda), justamente porque o translúcido sumia sobre o amarelo. Com o selo sólido
o problema deixa de existir e as duas versões viraram uma. **O código encolheu.**

Outras mudanças do calendário:

- **A bolinha do card virou a etapa do funil**, como no chip de lá. Era o status.
  Preço: o status saiu do card e agora só aparece ao abrir a ficha (ver §6.4)
- **Ícones de verdade das redes.** O código só sabia desenhar Instagram e
  YouTube; **tudo o mais caía numa câmera genérica** — um conteúdo de TikTok
  mostrava uma câmera. A biblioteca da casa não tem o TikTok, e o Connect
  desenha os três à mão. Copiados em `plataforma-icone.tsx`
- **Um ícone por rede**, não só o da primeira. Rede desconhecida **não desenha
  nada**: ícone errado afirma coisa falsa, a ausência apenas não afirma
- **Marca e responsável viraram selos** com contorno e preenchimento. Eram texto
  solto, e na fila ao lado de dois selos sólidos pareciam sobra de legenda

### 1.3 A barra do funil

Os filtros por etapa e a legenda que traduz TOFU, MOFU e BOFU, copiada do
Connect palavra por palavra.

Ela resolve um problema que o calendário sozinho não resolvia: **o selo do card
mostra a sigla crua** porque é só o que cabe numa célula de sete colunas, e até
aqui a ferramenta inteira **não traduzia essas três palavras em lugar nenhum**.

O filtro por etapa é novo e tem três cuidados:

- **Acumula.** Clicar em MOFU com TOFU ligado dá "TOFU e MOFU". Quem pergunta
  "quanto do meu mês é topo e meio?" precisa das duas somadas
- **Preserva o resto.** Clicar numa etapa mantém marca, período e vista — é o
  montador único de link que segura isso
- **O vazio diz quem o esvaziou.** Antes a tela dizia "Nenhuma atividade neste
  período" e mandava procurar no mês errado. Agora diz "Nada de MOFU neste
  período"

**As marcas NÃO entraram na barra**, embora apareçam na do Connect: o filtro de
marca já está no cabeçalho, e dois controles para a mesma pergunta sempre
parecem discordar.

### 1.4 O funil ficou fiel

Três diferenças reais contra o original, corrigidas:

- A rosca **não usava as cores de etapa** (usava uma paleta genérica) e **não
  tinha o total no centro**
- A distribuição pelos dias era **o gráfico errado**: colunas agrupadas, quando
  no Connect é **área empilhada**. Três colunas por dia em 42 dias dão 126
  barras de dois pixels, e "o volume está subindo?" não se responde contando
  barra
- **O eixo ficou curado na raiz.** O "1, 1, 1, 0, 0" empilhado que a sessão
  anterior remendou escondendo rótulo quebrado: o Connect faz o **teto do eixo
  ser múltiplo de 4**, aí não existe marca fracionária para esconder. O remendo
  saiu

Com 42 dias, **só as segundas-feiras ganham rótulo** — a grade começa na segunda,
então é uma régua semanal. É a ressalva de celular da sessão anterior, resolvida.

### 1.5 O formulário

- **Formatos e redes ficam coloridos SÓ quando escolhidos.** Primeiro eu tinha
  feito o contrário (todos tingidos sempre) e estava errado: sete chips
  coloridos de uma vez viram um vitral, e "qual eu marquei?" passava a depender
  de achar um anel no meio da cor. **A cor é o estado**
- **Etapa do funil virou três botões largos**, nas cores exatas das imagens:
  TOFU azul, MOFU âmbar, BOFU vermelho. Como é escolha única, o grupo é um
  `radiogroup` de verdade — para quem usa leitor de tela, a diferença é saber
  que escolher uma desmarca a outra
- **Marca virou dois botões**, com a paleta própria da marca quando escolhida
- **Ícones de verdade nas redes**, cada chip tingido na cor da rede
- **O campo "Status" saiu**, como no Connect (ver §6.4)

### 1.6 Clicar num dia vazio abre o formulário

Com a data daquele dia já preenchida. Três cuidados que não são óbvios:

- **É um `<button>` de verdade**, não um clique pendurado na célula. Teclado
  chega com Tab, abre com Enter, leitor de tela anuncia
- **Ocupa só a sobra da célula, por baixo dos cards** — nunca por cima. Com
  posicionamento absoluto ele roubaria o clique de quem só queria abrir uma
  atividade existente. **Testado nos dois casos**
- **O "+" só aparece no passar do mouse.** Um sinal fixo em 42 células é mais
  tinta na tela do que o calendário inteiro

### 1.7 O que foi apagado

Deleção é parte do trabalho e precisa ficar registrada:

| O quê | Por quê |
|---|---|
| `backlog.tsx` e a aba Backlog | pedido do dono |
| `agruparPorStatus`, `STATUS_ORDEM`, `ColunaDoBacklog` | só existiam para o backlog |
| action `mudarStatus` | **nunca teve chamador** — escrita para um arrasto que nunca existiu. Action exportada sem uso é porta aberta que ninguém olha |
| `corDoPonto` | a bolinha virou funil |
| `corDoFunil` | virou a paleta do Connect |
| a bifurcação do selo no card de marca | o selo sólido tornou-a desnecessária |

---

## 2. As descobertas

Nenhuma era o trabalho pedido.

### 2.1 Um selo de texto ilegível em 1,62:1

Ao medir o contraste das cores novas, descobri que a receita de selo da casa
(`estiloDeSelo`, escrita na sessão anterior) pinta **o texto com a cor cheia**.
No tema escuro funciona. No claro, não:

| Selo | Tema claro, antes |
|---|---|
| MOFU (âmbar `#f5a524`) | **1,62 : 1** |
| Carrossel (laranja `#f97316`) | **2,14 : 1** |

O mínimo aceitável é 4,5:1. Era texto que **não se lia** — e ninguém tinha visto
porque no escuro passa.

O Connect resolve com **duas tintas por cor** (`text-[#fcd34d]` no escuro,
`[.light_&]:text-[#b45309]` no claro). Aqui saiu uma mistura com `--foreground`,
que já é escura no tema claro e clara no escuro: mesmo resultado **sem uma
segunda tabela de cores para manter em dia**, e formato novo criado no Connect já
nasce legível. Depois: **4,82:1** no claro, **7,84:1** no escuro.

### 2.2 A tinta calculada contraria a intuição

O selo sólido precisa de texto por cima. "Cor forte pede texto branco" parece
óbvio e está errado em mais da metade da paleta. Escrevi o teste com o que achava
e **a função me corrigiu em duas cores**:

| Cor | Texto branco | Texto escuro | Ganha |
|---|---|---|---|
| Âmbar (MOFU) | 1,98 : 1 | **6,8 : 1** | escuro |
| Ciano (Story) | 2,33 : 1 | **5,8 : 1** | escuro |
| **Azul (TOFU)** | 3,42 : 1 | **4,30 : 1** | **escuro** |
| **Vermelho (BOFU)** | 3,76 : 1 | **3,90 : 1** | **escuro** |
| Roxo (Reel) | **4,38 : 1** | 3,08 : 1 | branco |

Corrigi a expectativa do teste, não a função. **A tinta é calculada por
luminância**, então cor nova criada no Connect já nasce com a tinta certa sem
ninguém lembrar de escolher.

### 2.3 O botão OKEY em 4,23:1

A cor da marca (`#f0e6a8`) é um amarelo pálido feito para ser **fundo de card**,
não tinta. Passada pela receita comum, o rótulo saía num verde-oliva lavado.

A resposta estava na própria imagem de referência: ali o texto "OKEY" é escuro.
**A marca já tem o par fundo/tinta definido pelo Connect.** Usando esse par:
**9,78:1**.

### 2.4 "LANCAMENTO" vazando do banco

O chip dizia `LANCAMENTO` — caixa alta, sem cedilha, enquanto os vizinhos diziam
"Reel", "Story". Não era estilo: era **a chave crua do banco vazando para a
tela**, porque faltava a tradução desse formato no mapa de rótulos. Agora lê
"Lançamento", e conserta também a ficha.

### 2.5 As minhas próprias verificações mentindo

Duas vezes neste dia um teste meu disse "quebrou" quando estava certo:

- Procurei `/Detalhes da atividade/` num texto que o CSS põe em **maiúsculas**
- Procurei `/Nova atividade/` no corpo da página — **"Nova atividade" também é o
  nome do botão do cabeçalho**, então dava sempre verdadeiro

E o cálculo de contraste errou duas vezes antes de acertar, porque lia
`color(srgb 0.55 …)` — formato novo do Chrome, valores de 0 a 1 — como se fossem
0 a 255.

**Lição registrada:** quando uma verificação automática contraria o que a tela
mostra, a suspeita começa pela verificação. Olhar a tela custou menos que
confiar no script.

---

## 3. O que foi provado, e como

### 3.1 O portão
`tsc --noEmit` limpo · **55 checagens, 999 asserções** · `npx next build` limpo,
do zero, com o servidor de desenvolvimento parado.

### 3.2 O Build.Connect NO AR — a lacuna que mais pesava

Todas as sessões anteriores testaram com o Connect fora. Desta vez ele subiu na
porta **3002**, e o banco dele já tinha **6 atividades em setembro/2026**, duas
de cada etapa do funil. Não foi preciso inventar dado.

- **A tarja vermelha de erro sumiu** e as atividades de lá entraram no calendário
- **Os cards do Connect desenham com o visual novo**: bolinha da etapa, selo de
  formato sólido, selo de etapa sólido, "ADMINISTRADOR" com contorno
- **A ficha de lá abre em leitura**: "Vinda do Build.Connect", "Criado por: No
  Build.Connect", **sem botão de editar nem excluir**
- **O filtro por etapa recorta os dados de lá**: BOFU devolve exatamente as 2

### 3.3 Editar preserva o status gravado

A afirmação mais arriscada da sessão, feita primeiro lendo código. Testada:

1. Status posto em **AGENDADO** direto no banco
2. Título trocado pela tela e salvo
3. Banco relido: **título mudou, status continua AGENDADO**

Depois restaurado ao original. A action só grava `status` quando ele é enviado,
e o formulário não envia mais.

### 3.4 O PDF, por dentro

Não bastava ver que gerava. O arquivo foi baixado, os fluxos **descomprimidos** e
os títulos lidos: `1 · RESUMO DA SEMANA` … `6 · ONE-ON-ONE`. E "Pauta" não
aparece em lugar nenhum do arquivo.

### 3.5 Os números de contraste, medidos no navegador

| | Tema claro | Tema escuro |
|---|---|---|
| Chips do formulário, escolhido (pior) | 5,40 : 1 | 6,67 : 1 |
| Chips do formulário, neutro (pior) | 5,69 : 1 | 6,49 : 1 |
| Descrições da legenda | 5,22 a 7,54 | 8,28 a 10,88 |
| Selo sólido do card (pior) | **3,99 : 1** | **3,99 : 1** |

O **3,99** precisa ser dito com todas as letras: é o selo "TOFU" em azul cheio,
com letra de 10px. O mínimo recomendado é 4,5, e **nem com texto branco (3,42)
nem com escuro (3,99) ele chega lá**. É **teto do estilo sólido nesta paleta**,
não erro de implementação — a mesma limitação que o Connect tem. Escolheu-se a
melhor das duas tintas e parou-se aí. Ver §6.12.

### 3.6 Também provado nesta sessão
- Criar atividade **sem o campo Status**: `POST 200`, nasce em "Ideia", aparece
  no calendário · excluir funciona
- **Clicar num card que divide a célula com o botão de criar**: card abre a
  ficha, espaço livre abre o formulário com a data certa. Sem roubo de clique
- Filtro acumulando, removendo e preservando marca/período/vista
- O gráfico de área com **as três camadas** (setembro tem as três etapas)
- Tudo acima **nos dois temas**

---

## 4. Os commits

| | |
|---|---|
| `e353e6d` | As tabelas do quadro nascem recolhidas e a Pauta vira One-on-one |
| `6a8213e` | O Cronograma vira ferramenta do Marketing, ganha escrita e a cara do Connect |

Push: `afed508..6a8213e master -> master`.

Separados em dois porque são trabalhos distintos: o Relatório Semanal não depende
do Cronograma, e o Cronograma depende da ferramenta de IA (o Roteiro usa as
configurações dela), então os dois últimos foram juntos.

**Os três documentos de sessão (`2026-11-2*.md`) ficaram FORA do Git** de
propósito: não há precedente desse tipo de arquivo versionado neste repositório,
e um push publica no GitHub. Decisão em aberto — ver §6.21.

---

## 5. Armadilhas operacionais (custaram tempo real)

### 5.1 Construir e desenvolver ao mesmo tempo quebra a tela
Aconteceu **três vezes neste dia**. `npx next build` com o `npm run dev` ligado
embaralha os arquivos em `.next`, e a tela passa a dar erro vermelho ou o
salvamento trava em "Salvando...".

**A regra:** se a tela travar ou o salvamento não responder — pare o servidor,
`rm -rf .next`, suba de novo. Não é defeito do sistema.

### 5.2 "Ação de servidor não encontrada"
Sintoma: o botão fica preso em "Salvando..." para sempre. O registro do servidor
diz `Failed to find Server Action`. Significa que a página aberta no navegador é
de uma versão e o servidor é de outra. **Mesma cura da §5.1.**

### 5.3 O `rm -rf .next` falha logo depois de matar o servidor
O Windows demora a soltar os arquivos. Repetir o comando 2 ou 3 vezes resolve.

### 5.4 O zoom do Chrome
A pendência §4.7 da sessão anterior (zoom em 54%) **acabou** quando o navegador
foi reaberto: agora está em 100%. Mas o comando de redimensionar janela
**é aceito e silenciosamente ignorado** por este Chrome. Ver §6.13.

---

## 6. O que ficou pendente

Numeração própria deste documento. Status: 🔴 bloqueia produção · 🟡 decisão do
dono · 🟢 acabamento · 🔵 teste · ⚪ higiene.

### 🔴 6.1 — As duas migrações não existem na produção
`cronograma_conteudo` e `ia_settings` só foram aplicadas localmente.

**Resolver:** `npx prisma migrate deploy` no servidor, **ANTES** do deploy do
código. Se o código subir primeiro, procura tabela que não existe.

### 🔴 6.2 — `GEMINI_API_KEY` não configurada
Sem ela o botão recusa com a mensagem certa, mas não gera.

**Resolver:** *Environment* do serviço no EasyPanel (produção) e `.env` da raiz +
**reiniciar o servidor** (local). **Não mexer no Dockerfile** — o par `ARG`/`ENV`
de lá existe só para `NEXT_PUBLIC_*`, que é lida no build; esta é de runtime.
Não dá para copiar do Connect (lá está cifrada); se perdeu, gerar outra no Google
AI Studio — a antiga continua valendo lá.

### 🔴 6.3 — `/vendas/cronograma` dá 404
Agora a rota realmente não existe. Favoritos do sistema se limpam sozinhos; isso
é só para link salvo à mão.

**Resolver:** duas linhas de `redirects()` no `next.config.mjs`. ~10 min.

### 🟡 6.4 — Nenhuma tela muda o status
O campo saiu do formulário (pedido) e o Backlog saiu antes. **Toda atividade
criada no Flow fica em "Ideia" para sempre.** As vindas do Connect continuam com
status de verdade — o selo na ficha não é enfeite para elas.

| Opção | O quê | Custo |
|---|---|---|
| A | Deixar assim | 0 |
| **B (recomendada)** | Esconder o selo nas atividades criadas aqui | ~15 min |
| C | Devolver o status num menu do card | ~45 min |

**Por que B:** o selo hoje mostra "Ideia" como se fosse estado escolhido, quando
é só o padrão. Esconder é mais honesto que manter e mais barato que devolver.

### 🟡 6.5 — A bolinha do card repete o selo da etapa
Só precisa decidir se escolher a opção **C** acima — aí a bolinha volta a ser o
status e para de repetir. Com A ou B fica como está (é assim no Connect).

### 🟡 6.6 — O Relatório Semanal segue só da GESTÃO
Único ponto onde se entregou menos que o literal do pedido. Ele é um editor, e
**todas** as actions exigem Gestão; abri-lo a Vendas hoje daria uma tela de
botões que falham.

**Resolver:** modo leitura — esconder "Nova semana", o lápis do card, o lápis do
modal e as escritas do quadro. **~1h.**

### 🟡 6.7 — A instrução de IA é uma só, para todas as marcas
No Connect a Retaguarda tem uma por marca.

**Recomendação: esperar.** É um módulo inteiro para um problema que ainda não
apareceu — a instrução única nunca foi usada de verdade, porque falta a chave.

### 🟡 6.8 — A barra do funil está acima da grade
No Connect é rodapé. Ficou em cima porque carrega um filtro, e todos os outros
controles desta tela estão no topo. **Mover é 1 linha.**

### 🟢 6.9 — Botões de período, marca e vista na paleta do Flow
Não na do Connect. **Recomendação: não mexer** — eles usam o token que identifica
o módulo em todo o Build.Flow, e trocar deixaria o Cronograma destoando de todas
as outras telas.

### 🟢 6.10 — Os nomes das etapas divergem
"Topo — atrair" aqui, "TOFU · Atração" lá. **Recomendação: não mexer** — a
legenda nova já traduz as siglas; renomear mexe na ficha e no gráfico para ganhar
semelhança, não clareza.

### 🟢 6.11 — Três coisas do formulário do Connect que não entraram
O link "Limpar redes sociais"; "Responsável" ainda é lista suspensa; e
"Quem vê este conteúdo" **não existe aqui por decisão** (lá a base serve três
abas, aqui a ferramenta é uma só). **Recomendação: não mexer.**

### 🟢 6.12 — O selo sólido para em 3,99:1
Ver §3.5. É teto do estilo, não defeito.

**Se incomodar:** voltar aqueles dois selos ao estilo translúcido (4,82:1 no pior
caso) — mas aí deixam de parecer com os do Connect. Troca entre fidelidade e
legibilidade, decisão do dono.

### 🔵 6.13 — Largura de celular — **o mais provável de dar problema**
O zoom foi destravado (§5.4), mas o redimensionamento programático é ignorado.
Nunca foi visto abaixo de 1920px.

**Resolver, por ordem de facilidade:** F12 → ícone de celular no Chrome (30 seg) ·
abrir `http://<ip-da-máquina>:3000` no telefone · arrastar a borda da janela.

**O que olhar:** botões de funil (3 colunas) e de marca (2 colunas) no
formulário, a barra de legenda (3 colunas), e o calendário de 7 colunas — esse
já apertava antes.

**Análise estática feita no lugar do teste:** a maior largura mínima introduzida é
**256px** (a coluna da legenda), e cabe num celular de 390px; os grids de funil e
marca não têm mínimo nos filhos. **É raciocínio, não resultado visto.**

### 🔵 6.14 — Nunca testado como VENDAS
Só como Gestão. A barra e o filtro são novos e aparecem para Vendas; e
`/marketing` digitado na barra manda cada papel para a primeira ferramenta que
ele vê — nunca visto do lado de Vendas. **Precisa de um login de teste.**

### 🔵 6.15 — A tarja "há mais no Connect" nunca apareceu
Só surge com mais de 200 atividades num período. **Recomendação: não forçar** —
encher o banco do Connect de lixo e limpar depois é risco maior que o ganho.

### 🔵 6.16 — Navegação por teclado não percorrida
Os nomes acessíveis estão certos (lidos na árvore da página), mas ninguém
navegou por Tab. ~20 min.

### 🔵 6.17 — A recusa do servidor a uma edição forjada
**O único teste de segurança que falta.** A regra "só o autor edita" tem função
única, asserções e prova de tela — mas ninguém tentou burlar por fora. Se ela
ceder, uma pessoa edita a atividade de outra e **nada quebra, nada avisa**.

**Resolver:** extrair o identificador da action da própria página e mandar uma
edição apontando para atividade de outro dono. ~30 min.

### ⚪ 6.18 — Dois servidores rodando
Flow na **3000**, Build.Connect na **3002** (este foi subido nesta sessão). Com o
Connect de pé o calendário mostra as atividades de lá; sem ele, volta a tarja.

### ⚪ 6.19 — Ver §5.1 e §5.2
Notas operacionais, não trabalho.

### ⚪ 6.20 — O projeto não tem lint configurado
O script `npm run lint` existe mas só oferece criar uma configuração do zero. E o
comando que ele usa (`next lint`) **vai ser removido no Next 16**.

**Resolver:** `npx @next/codemod@canary next-lint-to-eslint-cli .` ~30 min.
**Risco:** ligar o lint num projeto grande costuma acusar dezenas de avisos de
uma vez; arrumar só os **erros** e deixar os avisos para depois.

### ⚪ 6.21 — Os três documentos de sessão fora do Git
Versionar na raiz, mover para `docs/` (já versionado) ou deixar fora. Decisão do
dono.

---

## 7. Plano de execução proposto

Ainda **não aprovado**. Estimativa: **~3h de trabalho** + **~20 min do dono**.

### Ordem recomendada

```
1º   decisões          6.4 (e 6.5 se for C), 6.6, 6.8        10 min do dono
2º   teste de celular  6.13 — F12 modo dispositivo           30 seg do dono
        └─ se achar defeito, conserto                        +30 min
3º   6.3               redirect do link antigo               10 min
4º   6.16 + 6.17       teclado e o teste de segurança        50 min
5º   a decisão         6.4 implementada (+ 6.6 se aprovado)  15 min a 1h45
6º   6.20              migrar o lint                         30 min
7º   6.1 + 6.2         migrações e chave, NO SERVIDOR        10 min do dono
8º   deploy
```

**Os passos 7 e 8 são os últimos de propósito.** Tudo antes gera commit, e o
deploy acontece uma vez só — com as migrações já aplicadas e a chave no lugar.

### O que o plano deixa de fora, de propósito
6.7 (esperar a ferramenta rodar), 6.9, 6.10, 6.11 (semelhança sem clareza),
6.12 (decisão do dono), 6.15 (risco maior que o ganho), 6.18 e 6.19 (não são
trabalho). Justificativas em cada item.

### O que falta para começar
1. As decisões de 6.4, 6.6 e 6.8
2. O resultado do teste de celular (6.13)
3. Um login de teste de Vendas, para 6.14
4. Se o lint (6.20) entra agora ou fica para depois
