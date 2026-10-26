# Handoff — 26/10/2026 — Redesign do Ranking de Vendas

**Commit:** `ad7ddd9` — *Redesign do Ranking de Vendas, com indicadores que a tela
ja tinha como calcular*. Empurrado para `origin/master` (`15da221..ad7ddd9`).
Árvore limpa ao fim da sessão.

**Um arquivo tocado:** `src/app/(dashboard)/dashboard/rank-board.tsx`
(+621 / −194). Nenhuma consulta nova, nenhum campo novo no banco, nenhuma
dependência adicionada, nenhum outro arquivo do produto modificado.

---

## 0. O pedido

> "Vamos reformular (melhorar) o design do dashboard Ranking de Vendas, utilize a
> imagem que mandei de referência."

Veio uma imagem de referência: um mock escuro do **mesmo** dashboard, com os
mesmos nomes e os mesmos valores — ou seja, uma proposta de redesenho desta tela,
não de outra. Isso o classifica como **refinamento**, não substituição de mundo
visual: o tema escuro, o IBM Plex, o roxo de Vendas e a régua de cor continuam.

## 1. Escopo — a única decisão levada ao usuário

A referência mostrava indicadores que **não existem nos dados**. O escopo foi
perguntado uma vez, com três opções, e a resposta foi:

> **Visual + derivados** — todo o visual, mais os indicadores calculáveis na
> própria tela. **Zero query nova.**

O que ficou **de fora** por essa escolha (continua pendente, item 1 das
pendências):

| Da referência | Por que não entrou |
|---|---|
| `Canal: Atacado` na Maior Venda Semanal | `maiorSemana` só traz `{total, nome}` |
| `+18.4% vs média sem.` | exige a média das semanas, que ninguém calcula |
| `Faturado em: 14/10/2026` no Maior Pedido | a data não vem no `RankData` |
| Etiqueta `E-comm` nas linhas de Site | não há flag; detectar pelo sufixo "- Site" do nome seria gambiarra |

Os três primeiros exigem mexer em `src/lib/rank-data.ts`.

## 2. O redesign

Toda a lógica ficou **intacta**: rodízio de campanhas a cada 5 min, auto-refresh
de 30 min, ajuste manual (salvar/desfazer/restaurar), tela cheia, e todos os
comentários de regra de negócio do arquivo. O que mudou é a camada visual e um
punhado de números derivados.

**Visual:**

- **Cabeçalho virou card.** Ícone em disco roxo, título, selo "Ao vivo" (verde,
  pulsa com `motion-safe:`) ou "Histórico", e o subtítulo "Performance comercial
  integrada · Atacado & Varejo". Motivo: no telão o título solto sobre o fundo
  competia com os KPIs.
- **Controles agrupados.** Calendário + mês + ano num controle só; Editar
  valores / Restaurar num par com divisor. Antes eram seis botões soltos.
- **KPIs:** rótulo em caixa alta com `tracking-widest`, ícone em disco tingido,
  valor grande com **os centavos em corpo menor** (`brlPartes`) — no telão quem
  olha decide pela ordem de grandeza, e o centavo só roubava altura. O valor
  continua inteiro, não arredondado.
- **Inicial em disco** (`iniciais()`) identificando quem fez o recorde, antes de
  o nome ser lido. Primeiro + último nome de verdade, pulando partículas
  ("Arliane Araujo Trajano" → `AT`).
- **Pódio com moldura.** No Progresso Geral o top 3 ganha `border` + `bg-secondary/50`;
  do 4º em diante, número de posição. **Não** é barra colorida na lateral: a cor
  nesta tela é a régua de progresso, e uma faixa a mais competiria.
- Painéis Varejo/Atacado ganharam **ponto colorido** (ciano / violeta) + pílula de
  contagem + Total à direita.

**Números derivados — todos do que já estava na tela:**

| Indicador | Fórmula |
|---|---|
| Total por painel | `rows.reduce(+vendido)` |
| "6 operações" / "4 contas" | `rows.length` |
| Top 3 concentram X% | soma dos 3 primeiros ÷ soma do `rankGeral`. **`null` com ≤3 vendedoras** (a resposta seria sempre 100%) |
| Participação no faturamento | atacado ÷ (varejo + atacado). **`null` se ambos forem 0** |
| Total em premiações | `perf.rows.reduce(+premiacao)` |
| Meta da equipe (campanha) | `perf.rows.reduce(+meta)` |
| Ticket médio por vendedora | `volume ÷ (nº de linhas com qtd > 0)` — quem está zerada não forma média de ninguém |
| Pacing do mês + projeção | ver item 4 |

## 3. Dois desvios deliberados da referência

**a) As faixas do selo de situação são as MESMAS de `tierColor`/`tierText`.**

Na referência, 48% era "Elegível" e 24% era "Em pacing" — uma régua que não bate
com nenhuma outra do sistema. Adotei 34 / 67 / 100, os cortes que a barra já usa:

```
meta ≤ 0  → "Sem meta"      (neutro)
qtd  = 0  → "Sem vendas"    (neutro)
≥ 100     → "Meta batida"   (emerald)
≥ 67      → "Elegível"      (blue)
≥ 34      → "Em pacing"     (amber)
resto     → "Abaixo"        (red)
```

Com réguas diferentes, 40% seria "amarelo" na barra e "elegível" no selo — duas
leituras do mesmo número na mesma linha. É o princípio do produto *"a mesma
informação não tem duas cores"* aplicado a palavra e cor.

**b) O selo verde "Campanha Ativa" saiu.** O rótulo do card já diz
`CAMPANHA · PG - 30`; o selo ao lado repetia. Redundância do mock, não estética
fixada pelo dono — se ele quiser de volta, é uma linha.

## 4. Decisões técnicas que deixam rastro

**Coluna Status só a partir de 1280px** (`hidden ... xl:table-cell`).
A tabela foi de 5 para 6 colunas. Abaixo de `xl` o card vale 2/3 da grade
(`lg:col-span-2` em `lg:grid-cols-3`), e cinco colunas já era o limite. Como a
palavra do selo sai da **mesma faixa** do percentual que fica ao lado, escondê-la
não tira informação de ninguém. Abaixo de 1280px a contagem de colunas volta a
ser a de antes da sessão.

**O pacing tem um `shortcut:` registrado no código:**

```ts
// shortcut: dias corridos, nao dias uteis — sabado e domingo contam como dia
// de venda. Trocar por dias uteis quando a operacao tiver calendario proprio.
```

E uma guarda: **antes do dia 3 o pacing não aparece.** Dividir por 1/31 do mês
multiplica qualquer venda por trinta, e o telão mostraria um número absurdo.
Só existe no mês corrente — mês fechado não se projeta.

## 5. Verificação

**Rodado:**

```bash
npx tsc --noEmit    # limpo, antes e depois dos ajustes finais
```

**ESLint não rodou:** `next lint` está depreciado no Next 15 e **não há ESLint
configurado** neste projeto — o comando abre o wizard de setup. Não é regressão
desta sessão; é o estado do repo.

**Visto na tela**, com dev server + uma página de preview temporária
(`src/app/atacado/zzpreview`, com os dados da imagem de referência, **já
removida**; `/atacado/*` é rota pública, então dispensou login):

- Composição desktop (1920px) bate com a referência: cabeçalho, 4 KPIs, grade
  3×2, tabela de campanha.
- **A tabela de 6 colunas cabe**, e "PREMIAÇÃO" e "META & PROGRESSO" estão
  separadas — ver "Divergências", porque isso toca a pendência nº 1 do handoff
  anterior.
- Selos de situação, Total por painel, Top 3, Participação e Ticket médio todos
  renderizando com os valores certos para os dados de teste.

**NÃO visto na tela — e isto importa:**

1. **Mobile.** A janela do Chrome **não aceitou redimensionar** abaixo de ~520px
   (`innerWidth` continuou 1920 depois de três tentativas). O empilhamento em
   celular foi **deduzido das classes**, não observado. A guarda do item 4 foi
   posta justamente por isso.
2. **Tema claro.** Tentei remover a classe `dark` por JS e o tema não virou — ela
   vive no `<html>`, posta pelo `ThemeProvider`, não no wrapper da preview.

## 6. Risco conhecido, publicado assim de propósito

**Os selos de situação herdam a paleta `tierText`, que reprova em contraste AA no
tema claro.** Medindo sobre o card off-white (`220 30% 98.5%`):

| Cor | Contraste no claro | AA (4,5:1) |
|---|---|---|
| `text-amber-500` | ~2,1:1 | reprova |
| `text-emerald-500` | ~2,5:1 | reprova |
| `text-blue-500` | ~3,7:1 | reprova |
| `text-red-500` | ~3,8:1 | reprova |

E o selo é **fundo tingido** (`bg-amber-500/15`), o que no tema claro clareia
ainda mais o fundo e piora.

**Isto já era verdade antes da sessão** — os selos "Histórico", "M" e
"N ajuste(s) manual(is)" usam exatamente esse padrão, e as barras usam essas
cores. **O que eu fiz foi multiplicar a ocorrência:** agora é um selo por linha
da tabela de campanha.

O telão é escuro, onde passa. Mas o tema claro existe e é alcançável. Consertar
de verdade exige mexer na régua de cor do **sistema inteiro** — fora do escopo
acordado, e uma decisão que muda o significado das cores em todas as telas.
**O usuário foi avisado antes do commit e antes do push.**

## Pendente / decisões em aberto

### Novas desta sessão

1. **Os 4 campos da referência que exigem banco** (tabela do item 1): `Canal`,
   `+% vs média semanal`, `Faturado em`, etiqueta `E-comm`. Mexem em
   `src/lib/rank-data.ts`.
2. **Mobile nunca foi visto.** Conferir o empilhamento abaixo de 640px e, em
   especial, se a tabela de campanha com 5 colunas cabe sem cortar —
   `globals.css` tem `html, body { overflow-x: hidden }`, então o que não cabe é
   **cortado, não rolável**. Primeiro item para quem pegar isto.
3. **Tema claro nunca foi visto**, e é onde mora o risco do item 6.
4. **Contraste dos selos no tema claro** (item 6). Decisão em aberto: viver com
   isso, ou criar uma variante dos tokens de tier para o tema claro — o mesmo
   tratamento que `--vendas-text` e os outros `*-text` já recebem em
   `globals.css`, e que `scripts/checks/cor-de-setor.ts` recalcula. **Esse é o
   caminho que o projeto já usa para exatamente este problema.**
5. **O selo "Campanha Ativa" que removi** (item 3b) — se fizer falta, é uma
   linha em `CampanhaKpi`.
6. **O `shortcut:` do pacing** (dias corridos × dias úteis) entra na dívida do
   `/ponytail-debt`. É a **única nova** desta sessão.
7. **ESLint não existe no projeto.** `npm run lint` abre um wizard. Candidato a
   configurar, ou a remover o script do `package.json` para não prometer o que
   não entrega.

### Herdadas — **NÃO reverificadas nesta sessão**

As 13 pendências do handoff de 22/10 **não foram tocadas nem conferidas**.
Trate-as como estavam lá, não como confirmadas hoje. As que roçam este trabalho:

- **nº 6 — `table-plain` é armadilha silenciosa.** Continua valendo: as duas
  tabelas do Rank seguem com a classe, e eu a mantive. Qualquer `<table>` nova
  que não seja grade de dados precisa dela.
- **nº 3 — tabelas mais largas.** Não medi; a tabela de campanha ganhou uma
  coluna (acima de 1280px).
- **nº 7 — `--popover` não mapeado no Tailwind.** Não toquei.

## Divergências encontradas no estado do projeto

- **Pendência nº 1 do handoff anterior pode ser dada como resolvida, com ressalva.**
  Ela pedia confirmar na tela que "PREMIAÇÃO" e "META%" voltaram a ficar
  separadas no bloco Performance. **Vi separadas**, nos screenshots desta sessão
  — mas na **minha versão redesenhada**, que mexeu nas classes de padding dessas
  células (`pr-2` → `px-2` na coluna da barra). Ou seja: confirma o estado
  **atual**, não prova retroativamente o conserto do `:where()` na versão que
  estava pendente. Na prática, o que está no ar está certo.
- **`PRODUCT.md` diz "Next.js 14"; o instalado é `15.5.28`.** O dev server
  também alerta que `experimental.serverComponentsExternalPackages` virou
  `serverExternalPackages` no `next.config.mjs`. Nada disso quebrou nada nesta
  sessão, mas o PRODUCT.md está desatualizado e o aviso aparece a cada `npm run dev`.
- **`docs/resumo-2026-09-10.md`, citado em `PRODUCT.md` na seção "Evidence on
  Hand", não existe em disco.** Mesmo destino do `Resumo 19_10 - sessao 7.md`
  registrado no handoff anterior.

## Estado da máquina ao fim da sessão

- **Porta 3001: parada.** Era o dev server desta sessão; processo morto
  explicitamente (`Stop-Process`).
- **Porta 3000: ALGO AINDA ESTÁ RODANDO** e responde `307`. Estava ocupada já no
  começo da sessão (PID 17780) — quase certamente o dev server da sessão de
  22/10, que o handoff anterior registrou como deixado no ar. **Não foi morto por
  mim.** Lembrete que vem de lá: *pare o dev server antes de rodar
  `prisma generate`, ou volta o `EPERM`.*
- Banco local acessível (`prisma db execute` respondeu).
- A página de preview temporária foi **removida**; não entrou no commit.

## Arquivos desta sessão

**Modificado e commitado:**

- `src/app/(dashboard)/dashboard/rank-board.tsx` — todo o redesign.

**Criado:**

- `docs/handoff-2026-10-26-redesign-rank-de-vendas.md` — este arquivo.

**Criado e apagado (andaime, fora do commit):**

- `src/app/atacado/zzpreview/page.tsx` — preview com dados fixos para a
  conferência visual. Se precisar repetir a inspeção, o caminho é esse: uma
  página sob `/atacado/` (rota pública, dispensa login) montando `<RankBoard>`
  com um `RankData` de mentira. **Atenção:** pasta começando com `_` o Next trata
  como privada e não vira rota — por isso `zzpreview`, não `__preview`.
