# Escopo — LP geral com distribuição round-robin, e desativação da LP Lov

**Data:** 17/10/2026 · **Estado:** ESCOPO CAPTURADO, nada implementado
**Pedido por:** o dono, em 17/10/2026, para execução futura
**Depende de:** nada no código. Pode começar quando o dono mandar.

**Este documento não é uma spec pronta.** É o escopo como foi passado, mais as
perguntas que precisam de resposta antes de alguém escrever código. As seções
marcadas **DECIDIDO** vêm do dono; as marcadas **EM ABERTO** não têm resposta e
mudam a implementação de forma material — quem implementar sem resolvê-las vai
adivinhar, e adivinhar aqui custa retrabalho.

**Leia antes:** `docs/superpowers/specs/2026-10-14-lp-atacado-analise-clientes-design.md`
(a spec da LP e da ferramenta de Análise de Clientes, que esta mudança estende)
e `handoff-2026-10-17-master-select-lgpd-next15.md` (o estado atual).

---

## 1. O que existe hoje

Duas LPs de captação de revendedora, uma por marca, na mesma rota dinâmica:

```
/atacado/okey        200    conteúdo e mundo visual da OKEY
/atacado/lov-club    200    MESMO conteúdo, mesmo visual, só o nome muda
/atacado/<outra>     404
```

O conteúdo é **compartilhado por referência** entre as duas marcas
(`WHOLESALE_CONTENT` em `src/lib/wholesale-content.ts`): a planilha não
diferencia a copy por marca, só o nome exibido. Essa decisão é a razão de a LP
da Lov ter nascido sem custo — e é também a razão de ela estar "divergindo do
estilo da OKEY" agora, porque ela nunca teve estilo próprio.

A atribuição de vendedora acontece pelo **link de indicação**: cada vendedora de
Atacado tem um `referralCode` opaco, e o link que ela copia é
`/atacado/<marca>?r=<codigo>`. Quem chega sem `?r=` vira candidatura **sem
dona**, e a fila sem-dona é da Gestão (ver `resolveReferral` e
`assignLeadSeller`).

Em `/vendas`, a vendedora de Atacado tem dois botões, um por marca
(`src/app/(dashboard)/vendas/copiar-link-atacado.tsx`): **OKEY - Form** (ícone
de cereja) e **Lov - Form** (ícone de coração).

---

## 2. DECIDIDO pelo dono

1. **A LP da Lov sai do ar por enquanto.** Motivo declarado: diverge do estilo
   visual da OKEY. As instruções de design, paleta e especificação visual dela
   virão depois, em outro momento.
2. **Nasce uma LP geral**, que **não depende de identificador na URL** — ou
   seja, um link único, sem `?r=<codigo>` e sem marca no caminho.
3. **Essa LP distribui os cadastros em round-robin** entre a equipe de vendas do
   Atacado: o 1º cadastro vai para uma vendedora, o 2º para a seguinte, e assim
   por diante.
4. **A LP geral é "acessível Gestão"** (ver a pergunta 3 abaixo sobre o que isso
   quer dizer exatamente).
5. **Ela tem "aqueles mesmos botões previamente implementados"** (ver a
   pergunta 5).

---

## 3. RESPONDIDO pelo dono em 17/10/2026

| # | Pergunta | Resposta |
|---|---|---|
| 1 | O que é "desativar" a Lov | **Tirar o botão de copiar link, não a rota.** FEITO (commit `5a53f5f`): `/atacado/lov-club` segue em 200, o link já compartilhado continua funcionando, e o que para é a criação de links novos |
| 2 | Conteúdo da LP geral | **Exatamente a da OKEY**, só que sem vendedora específica |
| 3 | "Acessível Gestão" | **O link e os botões, para usuários de GESTÃO.** A página segue pública |
| 4 | Lead parado | **Passa para outra vendedora após 1 dia**, e segue passando **até alguém avaliar** (sem teto) |
| 5 | "Aqueles mesmos botões" | Os mesmos de copiar link, **agora para a Gestão** — não um terceiro botão em `/vendas` |
| 6 | Link por vendedora | **Continua.** O da Gestão é o caminho geral e democrático, que permite mais entradas |
| — | Prazo de 1 dia conta de quando | **Da CHEGADA do lead** |
| — | Mecanismo | Delegado: *"da forma mais eficaz possível"* |

### A consequência da resposta 4 que o dono precisa saber

Sem teto, um lead que ninguém avaliar **roda para sempre**: depois de passar por
todas as vendedoras, recomeça. A dona muda sozinha todo dia sem ninguém agir.

Isso atende ao pedido literal, mas não resolve o problema de fundo — lead que
ninguém avalia não precisa de mais rodízio, precisa de **visibilidade**. A fila
da Gestão já existe e é o lugar natural para isso. Fica registrado como algo a
revisitar, não como algo a mudar agora.

---

## 3b. O desenho escolhido (o "mais eficaz" delegado ao implementador)

**Gravado no banco, reconciliado na leitura.** Não derivado puro.

A razão é concreta: `listLeadsFor` filtra por `sellerId` **dentro do SQL**
(`where: { sellerId: actor.userId }`) e pagina no banco. Dona derivada em
JavaScript obrigaria a carregar todas as candidaturas pendentes para então
filtrar e paginar na memória — troca uma consulta indexada por uma varredura
que cresce com o negócio.

É o mesmo padrão que o Select já usa neste repositório: o valor é derivável, a
leitura reconcilia, e nenhuma tela mente se a reconciliação atrasar.

### Peças

1. **`CREATE SEQUENCE` no Postgres** para o número de ordem do rodízio.
   `nextval()` é atômico por natureza — não existe read-then-write, não existe
   corrida, e não precisa de tabela de contador nem de `UPDATE ... RETURNING`.
   É o que torna este o caminho mais eficaz, e não só o mais simples.

2. **Coluna `rodizioIndice Int?`** em `WholesaleLead`.
   - `null` → a candidatura veio pelo link de uma vendedora (`?r=`). **Não roda.**
   - número → veio pelo link geral. É a posição dela na fila do rodízio.

   Uma coluna só, e ela carrega as duas informações: se roda, e de onde parte.

3. **Na chegada** (`actions/wholesale-apply.ts`), sem `?r=`:
   `rodizioIndice = nextval()`, e `sellerId = ativas[rodizioIndice % ativas.length]`.
   Sem nenhuma vendedora ativa: `sellerId = null` e o índice gravado mesmo
   assim — a reconciliação atribui quando alguém for ativada, em vez de perder
   a candidatura.

4. **Dona esperada, a qualquer instante:**
   ```
   dias  = dias inteiros entre createdAt e agora
   dona  = ativas[(rodizioIndice + dias) % ativas.length]
   ```
   Determinística, sem relógio e sem estado extra. Dia 0 é da primeira, dia 1
   passa para a seguinte.

5. **Reconciliação na leitura de `listLeadsFor`:** antes de consultar, um
   `UPDATE` põe `sellerId` em dia para as candidaturas com `rodizioIndice`
   não-nulo e `decidedAt` nulo. Candidatura **decidida não roda mais** — é o
   "até alguém avaliar" da resposta 4.

6. **Ordem estável das vendedoras.** `ativas` ordenada por `id`, não por nome
   nem por data: nome muda, e ordem instável faria a mesma conta dar donas
   diferentes em leituras seguidas.

7. **O botão da Gestão** copia `/atacado/okey` **sem `?r=`**. Não há página
   nova: a LP geral é a mesma da OKEY sem o código de indicação, que é
   exatamente o que a resposta 2 descreve.

### O que isto NÃO muda

- O link por vendedora e o `resolveReferral` continuam como estão (resposta 6).
- Quem chega com `?r=` válido tem `rodizioIndice = null` e dona fixa.
- `assignLeadSeller` (a Gestão distribuindo à mão) continua. **Decidir o que
  acontece quando a Gestão atribui à mão um lead que está no rodízio** é um
  ponto a resolver na implementação: o mais coerente é a atribuição manual
  tirar do rodízio (`rodizioIndice = null`), senão o rodízio desfaz no dia
  seguinte o que a Gestão decidiu.

---

## 4. Armadilha técnica que quem implementar precisa saber

**O round-robin é um read-then-write, e este repositório já se queimou com
exatamente isso.**

O jeito ingênuo — ler "qual foi a última vendedora", somar um, gravar — perde
sob concorrência: duas lojistas que enviam o cadastro no mesmo segundo leem o
mesmo ponteiro e caem na mesma vendedora. Com formulário público, isso não é
hipótese remota: é o que acontece quando a vendedora dispara o link para um
grupo de WhatsApp.

Foi o mesmo defeito que `assignLeadSeller` tinha e que foi corrigido em
16/10/2026 virando `updateMany` com `sellerId: null` no WHERE (o banco decide,
não a aplicação). Ver também `src/lib/rate-limit.ts`, onde a contagem e a
inserção foram postas na MESMA instrução SQL pelo mesmo motivo.

Caminhos que funcionam:
- Um contador no banco incrementado e lido **na mesma instrução**
  (`UPDATE ... SET n = n + 1 RETURNING n`), e a vendedora escolhida por
  `n % total`.
- Ou escolher por **menor número de leads recebidos**, resolvido numa consulta
  só — tem a vantagem de se reequilibrar sozinho quando alguém entra ou sai, e
  a desvantagem de não ser estritamente sequencial.

O dono pediu **sequencial** ("o primeiro para uma, o segundo para outra"), então
o contador é o que atende ao pedido literal. Vale perguntar se o objetivo real é
*sequência* ou *equilíbrio* — são coisas diferentes quando alguém entra de
férias.

---

## 5. O que NÃO está neste escopo

- O redesenho visual da LP da Lov. O dono disse que as instruções de design,
  paleta e especificação vêm depois.
- Qualquer mudança na ferramenta de Análise de Clientes além do necessário para
  a atribuição funcionar.
- Mexer no link de indicação individual que já existe.
