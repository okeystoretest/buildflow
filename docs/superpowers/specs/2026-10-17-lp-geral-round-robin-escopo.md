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

## 3. EM ABERTO — precisa do dono antes de implementar

### Pergunta 1 — "desativar" a LP da Lov é o quê?

As opções têm consequências diferentes e nenhuma é obviamente certa:

| Opção | O que a lojista vê | Efeito em link já compartilhado |
|---|---|---|
| **404** | página de erro | link que a vendedora já mandou morre |
| **Redireciona para a da OKEY** | a LP da OKEY | candidatura entra como OKEY, trocando a marca sem avisar ninguém |
| **Redireciona para a LP geral** | a LP geral | entra sem marca, e cai no round-robin |
| **Página "em breve"** | aviso | ninguém se cadastra, mas o link não quebra |

**O que importa decidir junto:** já existe link da Lov circulando em WhatsApp de
lojista? Se existir, 404 é a opção que mais machuca.

**E os leads da Lov já cadastrados?** Eles continuam no banco com
`brand: LOV_CLUB`. A ferramenta de Análise de Clientes filtra por marca —
desativar a LP não pode esconder as candidaturas que já chegaram.

### Pergunta 2 — qual conteúdo e qual visual a LP geral usa?

Hoje o conteúdo é por marca e a LP geral, por definição, não tem marca.

- Usa a copy e o visual da OKEY, sem o nome da marca?
- Usa uma identidade neutra ("Build.Flow Atacado")?
- Usa a copy da planilha, que já fala "nossa marca" e nunca diz OKEY — e nesse
  caso ela quase já serve?

A terceira é a mais barata e provavelmente a certa, mas é decisão de marca.

### Pergunta 3 — "acessível Gestão" quer dizer o quê?

A LP de captação é **pública por natureza** — a lojista que se cadastra não tem
login. Então "acessível Gestão" só pode significar uma destas:

- **(a)** O LINK dela é gerado/copiado só por quem é GESTÃO (a página em si
  continua pública para quem recebe o link).
- **(b)** A página inteira exige sessão de GESTÃO — o que a tornaria inútil como
  página de captação.

Quase certamente **(a)**. Confirmar.

### Pergunta 4 — quem entra no rodízio, e o que acontece quando muda?

- Todas as `VENDAS` + `salesModel: ATACADO` **ativas**? (É o conjunto que o
  sistema já usa para o link de indicação.)
- Uma vendedora desativada sai do rodízio **na hora**, ou só na próxima volta?
- Vendedora nova entra no fim da fila ou na posição seguinte à atual?
- A Gestão pode tirar alguém do rodízio sem desativar a conta dela?
- **E se não houver nenhuma vendedora de Atacado ativa?** A candidatura vira
  sem-dona (fila da Gestão) ou é recusada? (Recusar perde o lead; sem-dona é o
  comportamento que já existe hoje e parece o certo.)

### Pergunta 5 — "aqueles mesmos botões" são quais?

Duas leituras possíveis:

- **(a)** Em `/vendas` nasce um terceiro botão, "Geral - Form", ao lado de
  "OKEY - Form" — e o da Lov sai junto com a LP dela.
- **(b)** A LP geral tem, dentro dela, os mesmos elementos da LP da OKEY.

A leitura (a) é a que casa com "botões previamente implementados", que foram os
de copiar link. Confirmar — e, se for (a), decidir **quem** vê esse botão: só
GESTÃO (coerente com o item 4 do DECIDIDO) ou também as vendedoras.

### Pergunta 6 — o link por vendedora continua existindo?

O round-robin e o link individual resolvem coisas diferentes: um distribui
quem chega sem dona, o outro credita quem a vendedora trouxe. Os dois podem
conviver, e provavelmente devem. Confirmar que não é para substituir.

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
