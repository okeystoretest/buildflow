# O Cronograma muda de módulo, ganha escrita, e a IA ganha dono

25 de novembro de 2026 — a sessão que trouxe a ferramenta do Build.Connect

Este documento continua o `2026-11-25-portao-do-ci-toque-fechamento-e-saida.md`.
Aqui se registra o porte do **Cronograma de Conteúdo** do Build.Connect para o
Build.Flow, a mudança de módulo e de permissões que ele exigiu, e a ferramenta
**Inteligência Artificial** que apareceu no fim.

**Estado ao fim:** `tsc --noEmit` exit 0 · **55 checagens** (`npm run check`,
967 asserções) · `npx next build` limpo · 11 arquivos modificados
(**+1218 −351**) e 16 arquivos novos (**2057 linhas**) · 2 migrações ·
conferido no navegador nos dois temas, como GESTAO e como VENDAS.

**Nada está commitado, e nada está em produção.** Diferente da sessão anterior:
tudo abaixo está só na árvore de trabalho e no banco local. Ver §4.1 e §4.2.

---

## 1. A decisão que encolheu o trabalho pela metade

A primeira pergunta era onde ficaria a verdade da agenda, já que o Flow passaria
a escrever. A resposta do dono mudou o projeto inteiro:

> A sincronização é apenas do Connect pro Flow. O que é criado no Flow fica
> apenas nele. As coisas criadas no Connect não podem ser editadas no Flow.

Com isso **o BuildConnectApp não foi tocado**: nenhuma migração lá, nenhum
endpoint de escrita, nenhuma mudança na leitura que já existia. E o problema que
parecia mais caro — como um usuário do Flow vira autor no banco do Connect —
deixou de existir, porque atividade criada aqui tem autor daqui.

O preço, registrado para quem vier depois: **as duas agendas nunca convergem**.
Uma atividade criada no Flow não aparece no Connect, e não há caminho previsto
para isso passar a acontecer.

---

## 2. O que foi feito

### 2.1 O Cronograma saiu do Comercial e virou ferramenta do Marketing

Era `/vendas/cronograma` — uma janela só-leitura para o calendário do Connect,
morando no Comercial porque era lá que a vendedora a usava. Virou
`/marketing/cronograma`. Mudança de prateleira, não remoção: a tela, a lib pura
e as checagens dela continuaram valendo.

O módulo Marketing passou de **GESTAO** para **GESTAO e VENDAS**. O
`scripts/checks/nav.ts` ganhou as asserções que provam os dois lados — que
VENDAS entra e que FINANCEIRO não.

**FINANCEIRO perdeu o Cronograma.** É consequência direta do "exclusivamente
Gestão e Vendas" que foi pedido, e vale dizer em voz alta porque ninguém reporta
perda de acesso como bug: a pessoa só acha que o sistema nunca teve aquilo.

**O Relatório Semanal continuou só da GESTAO**, e isto é o único ponto onde se
entregou menos que o literal do pedido ("o módulo e suas respectivas
ferramentas"). O motivo: ele não é tela de ler, é um editor — criar semana,
lápis, Kanban que arrasta e exclui — e **todas** as actions dele são
`requireRoleAction(["GESTAO"])`. Abri-lo a VENDAS sem um modo leitura entregaria
uma tela de botões que falham. Pendência §4.3.

`/marketing` digitado na barra deixou de ter destino fixo: agora manda cada
papel para a primeira ferramenta **que ele vê**, lida do `nav.ts`. Com destino
fixo, VENDAS caía no Relatório Semanal e era recusada pelo `requireRole` de lá —
um clique que termina na raiz do sistema sem dizer por quê.

### 2.2 A ferramenta ganhou escrita

Modelo `ContentPost` próprio (migração `20261125172750_cronograma_conteudo`,
puramente aditiva), com os mesmos campos do Connect **menos o alcance**: lá
`visibility` existe porque uma base serve três abas; aqui a ferramenta é uma só,
e toda atividade aparece para quem abre o Cronograma.

Criar, editar, mudar status e excluir, em `src/lib/actions/cronograma.ts`. Quem
entra: GESTAO e VENDAS. Quem altera: **só o autor, sem override para a Gestão** —
no Connect o Admin tem, para organizar a agenda do time; aqui a regra pedida foi
"cada um edita o que é seu", e uma exceção seria uma segunda regra para alguém
descobrir por acidente.

A tela mostra as duas origens no mesmo calendário. A do Connect abre a ficha em
leitura e **diz de onde veio**; sem essa linha, um card sem lápis parece defeito
e a pessoa procura o botão que nunca existiu.

**A falha do Connect virou tarja, não parede.** Antes a tela era só a janela de
lá, e o Connect fora do ar virava uma tela de erro inteira — certo quando não
havia mais nada a mostrar. Agora há: as atividades daqui vivem no nosso banco, e
sumir com elas porque **outro** serviço caiu seria esconder o trabalho da própria
pessoa.

### 2.3 As quatro peças que faltavam

| Peça | Como entrou |
|---|---|
| **Backlog de produção** | Quatro colunas por status, com contagem no cabeçalho. Usa **o mesmo card do calendário** — é a mesma atividade de outro ângulo, e um segundo desenho dobraria o lugar onde a cor da marca e a regra do lápis precisam ser mantidas. Não se arrasta: mover status é mudar um campo, e isso já tem porta. |
| **Funil** | Rosca + distribuição pelos dias. A distribuição reaproveita o `ColunasAgrupadas` da casa (servidor, tokens de série validados por tema, tooltip sem JS). A rosca foi desenhada aqui, nas mesmas cores. **Nenhuma biblioteca nova.** |
| **Filtro por responsável** | Só da GESTAO, como no Connect. **Casa por primeiro nome, não por id** — é a única chave que existe nas duas origens, porque o Connect manda o primeiro nome e mais nada. Filtrar por id apagaria toda atividade de lá no instante em que alguém escolhesse uma pessoa. Preço registrado: duas "Ana" contam como a mesma. |
| **Roteiro por IA** | Prompt copiado do Connect campo a campo, usando os rótulos que a tela já traduz. Gemini — o mesmo provedor de lá, zero dependência nova (é um POST com JSON). Campo editável, não visualizador: o rascunho da IA é para mexer. |

As três vistas vivem na URL (`?vista=`), como o período e a marca: o recorte
sobrevive ao F5 e pode ser mandado por link. Há **um só montador de link**, e ele
carrega todos os recortes — com um por controle, trocar de mês apagava o filtro
de marca.

### 2.4 "Peça" virou "atividade"

As duas telas chamavam a mesma coisa de nomes diferentes: **peça** aqui,
**atividade** no Connect, `post` no banco dos dois. Como agora elas mostram o
mesmo calendário lado a lado, padronizou-se em **atividade** (decisão do dono).

Renomeação em bloco em 14 arquivos — texto, comentários, tipos, actions, nomes de
arquivo e de componente. Antes se conferiu que **nenhum "peça" era verbo**.

Dois ficaram como `post`, de propósito: o campo `posts` da resposta do Connect (é
o nome real no JSON — renomear descreveria errado o formato) e o modelo
`ContentPost` no banco, que é o mesmo nome nos dois sistemas.

### 2.5 A ficha ganhou o desenho do Connect

Rótulo miúdo acima do título, status como selo no canto, fila de selos coloridos
(funil, cada formato, cada rede com ícone, marca), bloco de line-up, e **cada
informação dentro da própria moldura** em grade 2×2 — o `Field` de lá, com os
mesmos valores.

As **cores dos selos** não existiam no Flow (formato e rede eram cinza). Foram
copiadas valor por valor, com a fórmula do selo: tinta cheia no texto, `59` na
borda, `1f` no fundo. É isso que faz o mesmo hexadecimal servir nos dois temas
sem duas paletas.

Uma adaptação que não é cópia: no lugar do bloco de **alcance** do Connect, que
aqui não existe, vai o bloco de **origem** — a pergunta que esta ficha precisa
responder e a de lá não: *por que não posso editar isto?*

**"Criado por" é campo novo:** o autor não existia na tela. Nas atividades do
Connect ele diz "No Build.Connect", porque o `createdBy` não atravessa a
fronteira, por decisão de lá.

### 2.6 Inteligência Artificial, no módulo de Gestão

Aba nova em `/gestao`, no fim da lista, seguindo o precedente do `PlanosPanel`
(aba complexa em arquivo próprio). Migração `20261125180329_ia_settings`, linha
única de id fixo.

Configura **modelo** e **instrução de sistema** — que antes eram constante no
código e variável de ambiente: trocar o modelo exigia deploy, ajustar o tom
exigia um programador.

**A chave da API não entrou na tela, e é decisão de segurança.** Ela fica em
`GEMINI_API_KEY`, no ambiente, como todo segredo deste sistema. A tela **informa
se a chave existe**, nunca o valor. (Registro de honestidade: o Connect guarda a
dele no banco, mas **cifrada** — ele resolve o mesmo problema por outro caminho,
não por descuido.)

**O nome do modelo é validado antes de gravar**, e não é formalidade: ele vira
pedaço da URL do provedor (`.../models/<modelo>:generateContent`). Um campo de
texto livre ali é alguém escrevendo caminho. Conferido no navegador com
`models/gemini/../../admin` → recusado, nada gravado.

**Botão "Testar"**, porque sem ele o erro de configuração aparece na pessoa
errada: um modelo digitado errado só daria as caras quando alguém do Marketing
clicasse "Gerar com IA" no meio do trabalho — e quem conserta é a Gestão, que não
recebe o erro.

---

## 3. As descobertas

Nenhuma era o trabalho pedido. As três apareceram na passagem de verificação, que
só aconteceu porque o dono perguntou se os testes tinham sido feitos — e **não
tinham**.

### 3.1 A regra de autoria estava escrita duas vezes

O comentário dizia *"A MESMA CONTA DA ACTION"*. Era uma **cópia**: a tela
calculava `createdById !== null && === viewerId` para decidir o lápis, e a action
recalculava igual para deixar a escrita passar. Duas cópias de uma regra de
permissão divergem sem dar erro — a tela oferece um botão que o servidor recusa,
ou esconde um que ele aceitaria.

Virou **uma função pura** em `lib/cronograma.ts`, usada pelos dois, com asserções
próprias.

### 3.2 O teste estava mentindo

Ao escrever essas asserções: `podeEditarAtividade("", "")` devolvia **`true`** —
string vazia é igual a string vazia — e o rótulo do teste dizia "não casa". `""`
é o que um `?? ""` descuidado produz num `viewerId`. Corrigiu-se **a função**,
não o rótulo: vazio não é id de ninguém.

Defeito que nenhum teste de tela pegaria, porque na tela o id nunca chega vazio.

### 3.3 O eixo do gráfico repetia rótulo

No funil, o eixo saía `1, 1, 1, 0, 0` empilhado: o componente da casa divide o
topo em cinco linhas iguais e, com teto 2, as marcas caem em 0,5 e 1,5;
arredondar colapsava os rótulos. Marca fracionária agora fica **sem rótulo** — a
linha continua guiando o olho, e não há "meia atividade" escrita em lugar nenhum.

---

## 4. O que ficou pendente

### 4.1 Nada está commitado
11 arquivos modificados, 16 novos, 2 migrações. Tudo na árvore de trabalho.

### 4.2 As migrações só existem no banco local
`cronograma_conteudo` e `ia_settings` foram aplicadas com `prisma migrate
deploy` aqui. Produção precisa do mesmo comando.

### 4.3 O Relatório Semanal segue só da GESTAO
Ver §2.1. Para abrir a VENDAS ele precisa de um modo leitura: esconder "Nova
semana", o lápis do card, o lápis do modal de leitura, e as escritas do Kanban
(arrastar, criar, excluir). Estimado em ~1h. **É decisão do dono**, não
consequência técnica.

### 4.4 A instrução de IA é uma só
No Connect a Retaguarda tem uma por marca (OKEY / Lov Club). Aqui é uma para
todas. Portá-la é um módulo inteiro que não foi pedido.

### 4.5 `GEMINI_API_KEY` não está configurada
Sem ela o botão recusa com a mensagem certa, mas não gera. Local: `.env` da raiz
(já no `.gitignore`), e **reiniciar o dev** — variável de ambiente só é lida na
subida. Produção: *Environment* do serviço no EasyPanel. **Não precisa mexer no
Dockerfile**: o par `ARG`/`ENV` de lá existe só para `NEXT_PUBLIC_*`, que é lida
no build; esta é lida em runtime e nunca chega ao navegador.

A chave não dá para copiar do Connect: lá ela está cifrada e a tela só mostra uma
dica. Se a original se perdeu, gerar outra no Google AI Studio — a antiga
continua valendo para o Connect.

### 4.6 Três coisas nunca foram provadas de ponta a ponta

- **O Build.Connect no ar.** Todos os testes rodaram com o lado de lá fora. A
  junção das duas origens no mesmo dia e a tarja de "há mais no Connect" seguem
  sem prova real.
- **A IA.** Sem chave, a chamada para antes de montar a URL, então o caminho
  "modelo salvo → provedor" nunca foi exercitado. A validação do nome tem 20
  asserções, o que não é a mesma coisa.
- **A recusa do servidor a uma edição forjada.** Server action não é chamável à
  mão sem o id gerado pelo Next. O que existe é uma função só, asserções, os dois
  chamadores provados pelo `tsc` e a prova de tela. Não é um POST forjado.

### 4.7 Largura de celular não foi testada
Chegou-se a **958 CSS px** (tablet: barra lateral vira hambúrguer, backlog cai
para 2 colunas, 7 colunas se espremem, sem rolagem horizontal). Abaixo disso não
foi possível: o Chrome da máquina está com **zoom em ~54%** (prova:
`outerWidth 516` com `innerWidth 958` — `outerWidth` não sofre zoom), a janela não
desce de ~516px físicos, o atalho de zoom é bloqueado pela ferramenta e o zoom
ali é global, não por site. **`Ctrl+0` na janela resolve** e o teste pode ser
refeito.

Ressalva conhecida para o telefone: no mês, 42 rótulos de dia embaixo do gráfico
ficam minúsculos.

### 4.8 Bookmark antigo dá 404
`/vendas/cronograma` não tem redirect. Os Favoritos descartam sozinhos href que
sumiu do menu, então não há atalho quebrado — só link guardado à mão. Duas linhas,
se valer a pena.

### 4.9 Um processo antigo segura a porta 3000
Um `next dev` anterior a esta sessão, servindo código velho. Ele trava o
`npm run build` completo, porque o `prisma generate` não consegue reescrever a
DLL do engine — por isso se rodou `npx next build`, que passa. O encerramento
dele foi barrado pelo classificador de permissões e ficou para o dono.
