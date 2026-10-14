# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Ferramenta **interna de uma empresa só** — atacado de moda/confecção. Não é produto
multiempresa: `Store`, `OriginStore` e `Cnpj` múltiplos são frentes da mesma operação,
não inquilinos.

Cinco perfis internos (`enum Role`), cada um dono de uma etapa do pedido:

| Perfil | O que faz |
|---|---|
| `VENDAS` | registra o pedido, cadastra cliente, vende Select, cuida de excursões e campanhas |
| `FINANCEIRO` | confirma pagamento, trata trocas, estornos e devoluções, cobra parcelas do Select |
| `LOGISTICA` | separa, confere, embala, despacha; controla peças e pendências |
| `MOTORISTA` | assume rota, entrega, anexa comprovante com foto |
| `GESTAO` | administra cadastros, planos, metas, limites de etapa; vê tudo |

Vendedor tem **modelo de venda travado** (`SalesModel`: `VAREJO` ou `ATACADO`), que
define o escopo de tudo que ele vende.

**A cliente é lojista.** Compra para revender na própria loja — daí o feminino em todo
o código e na interface ("a cliente", "a vendedora"). Ela não tem login: acessa uma
página pública de acompanhamento (`/acompanhar/<token>`) liberada por **Código de
Cliente**, com cookie próprio restrito àquele path, onde vê o estágio do pedido, a
comanda e o comprovante de entrega.

**Excursão** é um fato do negócio, não um recurso genérico: grupo de lojistas que vem
comprar, com endereço, horário de corte, dias de operação e observações próprias. Quando
o pedido tem excursão, ela substitui a observação genérica no card do motorista.

## Product Purpose

Acompanhar um pedido do registro à conclusão, atravessando quatro setores, com dono e
prazo em cada etapa. O pedido caminha por estágios (`OrderStatus`):

`EM_ANALISE → PAGO → AGUARDANDO_IMPRESSAO → SEPARANDO → PENDENTE → CONFERINDO →
EMBALANDO → PROCESSANDO → ENVIADO → EM_ROTA → ENTREGUE → CONCLUIDO`, mais as saídas
`ESTORNO`, `ESTORNO_PARCIAL` e `CANCELADO`.

Sucesso é a operação enxergar onde cada pedido está **sem perguntar a ninguém**: quadros
kanban por setor, cronômetro por etapa (`StageTimeLimit`), sinal visual aos 50% do prazo
e no estouro, justificativa de atraso registrada por par (pedido, status), e notificação
em tempo real para o setor dono.

Fora do pedido, o sistema também sustenta: o **Select** (adesão a plano de serviço da
marca), o **Ranking de Vendas** com metas e campanhas, chamados de motorista integrados
ao Build.Connect, controle de peças, pagamentos de motorista e tarefas diárias.

## Positioning

Sistema desenhado em cima do vocabulário real desta operação, não um ERP adaptado:
comanda, excursão, loja de origem com fluxo simplificado, modelo de venda travado por
vendedor, Select com mínimo de compras mensal por ciclo de mensalidade. Cada um desses
é regra de negócio concreta, com decisão registrada e motivo — não configuração.

## Operating Context

- **Aba aberta o dia inteiro.** Quem opera (Financeiro, Logística) deixa o sistema aberto
  numa aba durante o expediente. É ferramenta de trabalho, não site que se visita.
- **App instalado no celular do motorista.** PWA (`manifest.webmanifest`, `display:
  standalone`, service worker, push via `web-push`). O motorista trabalha na rua: assume
  a entrega, conclui e anexa comprovante por **Câmera ou Galeria**.
- **Telão.** O Ranking de Vendas e o Fluxo vivem numa TV onde ninguém opera o seletor:
  o rodízio de campanhas avança sozinho a cada 5 minutos e o quadro recarrega a cada 30.
  Escolher no seletor desliga o rodízio; um botão mostra o estado (`2/3`) e religa.
- **Impressão.** Etiqueta por pedido (`/etiqueta/<id>`) e PDF de pendências da Logística.
- **WhatsApp.** Aviso aos motoristas de pedido pronto; destino resolvido por
  `sock.onWhatsApp` antes do envio, com espaçamento sorteado de 1–10s por destinatário.
- **Build.Connect.** Sistema irmão, máquina-a-máquina: o Connect abre e acompanha
  chamados, o Flow gerencia. Autenticação por Bearer de serviço em `/api/integracao/*`
  e webhook assinado por HMAC-SHA256 de volta. Sem as variáveis configuradas a
  integração fica desligada (503), não meio ligada.
- **Agendador externo.** `/api/cron/selects` confere o próprio Bearer; sem o segredo
  configurado responde 401 a tudo.
- **Idioma:** pt-BR, único (`<html lang="pt-BR">`). Valores em real; números em fonte
  monoespaçada com `tnum`.

## Capabilities and Constraints

**Stack incumbente:** Next.js 14 (App Router, Server Actions), React 18, TypeScript,
Prisma + PostgreSQL, Tailwind, Radix UI, `sharp` para imagem, `zod` para contratos.
Deploy em Docker/EasyPanel; o `CMD` faz `migrate deploy && exec node server.js`, então
migration que falha impede o servidor de subir.

**Sessão:** JWT em cookie `bf_session`. O middleware (Edge) confere só assinatura e
validade; a revogação por `tokenVersion` é conferida no `getSession` (runtime Node),
camada autoritativa usada por páginas e Server Actions. Rotas públicas casam por caminho
exato ou segmento abaixo — nunca por prefixo de texto.

**Uploads** não são servidos de `/uploads` estático: passam por rota autenticada
(`/api/uploads/[...path]`). O comprovante visível à cliente tem rota própria sob
`/acompanhar/<token>/`, com dupla autorização (gate do Código de Cliente **e** foto
pertencente a pedido daquela cliente); sem acesso responde **404**, porque a existência
da foto já é informação.

**Select** (contrato de serviço, não pedido): `SelectPlan`, `SelectPlanBenefit`,
`SelectContract`, `SelectInstallment`, `SelectPayment`. Planos de tabela: Estrela Prata
(R$ 597 base, mínimo R$ 6.000), Rubi (R$ 997 / R$ 15.000), Diamante (R$ 1.297 /
R$ 20.000), todos 12 meses, mais Diamante (Wincon) com valores negociados a cada adesão.
O **Build.Sales** (R$ 67/mês) é somado pelo servidor à mensalidade de todos os planos —
`monthlyAmount` guarda a base, a cliente paga 664/1064/1364. Uma parcela aceita N
pagamentos (`PARCIAL` derivado de `0 < paidAmount < amount`); pagamento acima da parcela
adianta em cascata só para a frente, ligado por `batchId`, e reverter desfaz o lote.
O mínimo de compras conta pelo **ciclo da mensalidade** (começa dia 15 → conta 15 a 14)
e pela data de **aprovação do Financeiro** (`Order.financeApprovedAt`).

**Terminologia que não se traduz:** comanda (número que substitui o número do pedido
para a cliente), excursão, loja de origem, fluxo simplificado, chamado, peça, Select,
Build.Sales.

**Histórico é imutável.** `EMBALADO` e `PROCESSADO` saíram de circulação mas
**continuam no enum do Postgres**, porque o histórico de todo pedido antigo aponta para
eles. Migration que move pedidos vivos registra a mudança no histórico **antes** de
mover. `SelectPayment` revertido marca `reversedAt`; não apaga.

**Concorrência real.** Dois motoristas clicam "Iniciar" no mesmo pedido: a reivindicação
é atômica (`updateMany` condicionado a `driverId: null`) e quem perde recebe mensagem
clara, não estado corrompido.

**Em aberto:** o símbolo da marca. `docs/briefing-logo-favicon.md` é briefing aberto para
designer externo — o ícone atual é provisório (traço ~27/512, some em 16 px). Não há
DESIGN.md: o sistema implementado é a autoridade visual incumbente.

## Brand Commitments

- **Nome:** `Build.Flow` — "Build" em peso bold, "**.Flow**" no azul da marca. O logotipo
  textual **não muda**.
- **Tagline oficial:** "Logística e controle de vendas" (tela de login e manifest).
- **Azul da marca:** `#29A0D9` (`theme_color` do app). Token `primary`:
  `hsl(204 68% 50%)` claro, `hsl(204 75% 58%)` escuro.
- **Tipografia:** IBM Plex Sans em todo o sistema; IBM Plex Mono em números
  (`.font-data`, com `font-feature-settings: "tnum"`).
- **Cores de setor**, lidas por setor e nunca decorativas — um botão "motorista" no meio
  de Vendas leria como engano: Vendas `#9B59B6` · Financeiro `#E74C8B` ·
  Distribuição `#F39C12` · Motorista `#27AE60`. **Não entram no logo**: usar uma delas
  sinalizaria favorecimento de setor.
- **Tema escuro é o padrão** (`#11151F` fundo, `#181D29` card, `#0F1621` splash); claro
  é off-white azulado (`#EEF0F4`), nunca branco puro.
- **Ideia central da marca:** algo que avança em etapas até ser concluído.
- **Vetado na identidade:** caminhão, mapa, pino de localização, carrinho — genéricos e
  já usados como ícones de navegação dentro do sistema.

## Evidence on Hand

Real, no repositório:

- `docs/briefing-logo-favicon.md` — briefing de marca completo, com paleta, restrições
  de 16 px, zona de segurança maskable e checklist de aceite.
- `docs/superpowers/specs/` — specs de design por recurso, cada decisão com motivo
  (Select, chamados/Connect, devoluções, WhatsApp motoristas).
- `docs/resumo-2026-09-10.md` — registro de 11 commits com causa-raiz de cada defeito.
- `docs/integracao-connect.md` — contrato da integração com o Build.Connect.
- `prisma/seed.ts` — planos, benefícios e valores reais do Select; idempotente por nome.
- `scripts/checks/` — verificações executáveis (`select-contract.ts`,
  `upload-validation.ts`, `order-flow.ts`, `utils.ts`), rodadas com `npx tsx`.

**Ausências que trabalho futuro não deve preencher por invenção:** não há site público
de marketing, não há depoimentos de clientes, não há benchmarks, não há logo definitivo
entregue. Verificação visual de layout renderizado e de comportamentos com relógio
(rodízio de 5 min, modal após 5 min de atraso) historicamente **não** é feita localmente.

## Product Principles

1. **O pedido é a verdade, e cada etapa tem dono e prazo.** Estado vive no pedido e no
   seu histórico, não na tela de quem olhou por último.
2. **Histórico não se reescreve.** Valor de enum aposentado continua existindo; reversão
   é marca, não exclusão; migration registra antes de mover.
3. **O sistema informa; não inventa movimento financeiro.** Troca com parcela paga avisa
   "R$ X pagos referentes a período posterior ao encerramento" e deixa o Financeiro
   decidir — estorno automático inventaria um fato.
4. **Indicador acompanha, não penaliza.** Mínimo de compras não batido é destaque
   visual, sem bloqueio nem cobrança.
5. **Interromper só onde a pessoa pode resolver.** O modal de justificativa de atraso
   vive na Logística, não no Fluxo geral: pop-up que interrompe sem poder resolver vira
   algo que se fecha no reflexo — e o reflexo contamina o quadro onde importa.
6. **Sem acesso, 404.** Em recurso de cliente, a existência do dado já é informação.

## Accessibility & Inclusion

Requisitos específicos já estabelecidos no produto:

- **Contraste WCAG AA é condição, não preferência**, e governa decisão de cor: card
  atrasado é vermelho preenchido com texto branco; card em atenção (50% do prazo) é
  amarelo com texto **escuro** (`amber-950`), porque branco sobre `amber-300` não passa
  em nenhum critério. Selo de atraso em chip branco com texto vermelho.
- **A mesma informação não tem duas cores:** comprovante e NF anexados ficam verdes em
  qualquer fundo de card.
- **Legibilidade a 16 px** é o teste que aprova ou reprova o ícone (aba de navegador com
  8 abas abertas), e a **zona de segurança maskable** (círculo de 410/512) é obrigatória.
- **Leitura de longe** no telão; **uma mão, na rua, com pressa** no celular do motorista.
- Tema claro existe para reduzir brilho e cansaço em jornada longa — off-white, não
  branco; texto escuro suave, não preto.
- `color-scheme: light dark` declarado; guard de `overflow-x` para o layout ocupar a
  largura real do dispositivo sem o navegador móvel diminuir o zoom.
