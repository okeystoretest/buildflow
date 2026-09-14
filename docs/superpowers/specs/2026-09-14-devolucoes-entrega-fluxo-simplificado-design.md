# Devoluções, valor da entrega, WhatsApp de pagamento e fluxo simplificado com Pronto/Em Rota

Data: 2026-09-14. Sete frentes independentes, pedidas em bloco. Cada uma vira um
commit próprio, na ordem do mais isolado ao mais acoplado: 3 → 4/5 → 6 → 1/2 → 7.

## Premissas assumidas (o pedido não fixou; corrigir aqui se estiverem erradas)

| # | Ponto | Decisão |
|---|---|---|
| 1 | Quem registra devolução | VENDAS nos próprios pedidos; GESTAO e FINANCEIRO em qualquer um |
| 2 | Status que aceitam devolução | Qualquer um, exceto CANCELADO, ESTORNO e ESTORNO_PARCIAL |
| 3 | Devolução maior que o valor atual | Bloqueada. O status do pedido nunca muda por devolução |
| 4 | Pedido de campanha | Se a referência digitada bate com a de um item de campanha do pedido, abate quantidade e valor daquele item (e o `itemCount`); senão, só o valor do pedido |
| 5 | Frete | Intacto. A devolução abate `orderValue`; `total = orderValue + freight` é recalculado |
| 6 | Várias devoluções no mesmo pedido | Permitidas; cada uma é um registro |
| 7 | Onde aparece | Modal de detalhe do pedido e card expandido do Histórico |
| 8 | Acompanhamento do cliente | Não mostra devolução |
| 9 | Financeiro pode alterar o valor ao pagar | Sim: o campo vem pré-preenchido com o valor do motorista e é editável |
| 10 | Excursão com vários pedidos | O valor da entrega é **por pedido** (respondido pelo usuário) |
| 11 | Entregas concluídas antes da mudança | Sem valor; exibe "—" |
| 12 | Destinatário do WhatsApp de pagamento | O **motorista da entrega** (respondido pelo usuário) |
| 13 | O que é "confirmação de pagamento" | O registro do **pagamento da entrega** em Financeiro > Pagamentos de Motoristas (`payDriverDelivery`) (respondido pelo usuário) |
| 14 | Comanda sem número na mensagem | Usa o número do pedido |
| 15 | Retirada na loja | Pronto → a loja avança **direto para Entregue** (respondido pelo usuário) |
| 16 | Motorista/em aberto numa forma de envio que não é da equipe | A escolha explícita no modal prevalece: o pedido aparece no quadro do motorista |
| 17 | Conclusão pelo motorista em pedido simplificado | Vai a CONCLUIDO, como no padrão (sai do quadro, vai ao Histórico) (respondido pelo usuário) |
| 18 | Rastreio no simplificado | A própria loja avança Pronto → Em Rota → Entregue pelo quadro |
| 19 | Aviso WhatsApp ao motorista | Vale para o simplificado, via `notifyOrderReady` |
| 20 | Acompanhamento do cliente na retirada | Em Pronto com retirada, o rótulo é "Pronto para retirada" (mesma etapa da linha do tempo) |
| 21 | Pronto "em aberto" no simplificado | É dos motoristas: a loja não avança para Em Rota (seta some; servidor recusa). Só rastreio e retirada são avançados pela loja |
| 22 | Pedido com devolução integral | Fica com valor zero e continua editável (endereço, observações, envio) |

## 1 e 2 — Devoluções

O pedido não tem itens: `orderValue` é um montante único e só os itens de
campanha têm referência. A referência da devolução é texto livre.

**Banco**: `OrderReturn` (id, orderId, registeredById, note?, createdAt) e
`OrderReturnItem` (id, returnId, reference, quantity, value). O valor bruto
original nunca se perde: `orderValue` passa a ser o líquido e a soma das
devoluções reconstrói o bruto.

**Action** `registerOrderReturn({ orderId, items[], note? })` em
`src/lib/actions/returns.ts`:
1. Permissão (premissa 1) e status (premissa 2).
2. Valida itens: 1–50, referência 1–120 chars, quantidade inteira > 0, valor ≥ 0.
3. Soma dos valores ≤ `orderValue` atual (premissa 3).
4. Transação: cria `OrderReturn` + itens; `orderValue -= soma`; `total = orderValue + freight`;
   para cada item cuja referência case (normalizada) com um `CampaignItem` do
   pedido: `quantity -= min(qtd, quantity)`, `value -= min(valor, value)`; recalcula
   `itemCount`; grava `OrderStatusHistory` com nota "Devolução: N item(ns), R$ X".
5. Revalida `/vendas`, `/vendas/historico`, `/dashboard`, `/fluxo`; emite `emitOrderUpdated`.

A lógica de cálculo (soma, casamento de referência, novos valores) fica pura em
`src/lib/order-returns.ts`, coberta por `scripts/checks/order-returns.ts`.

**UI**: modal `ReturnModal` compartilhado (`src/components/shared/return-modal.tsx`)
com linhas dinâmicas (referência, quantidade, valor) e observação opcional.
Botão "Devoluções" em `vendas/row-actions.tsx` e no card expandido do
`historico-list.tsx`. Detalhe do pedido e histórico ganham a seção "Devoluções".

## 3 — "Comanda" no Pagamento Pendente

`PaidPendingCard` e `PaymentNoteModal` passam a exibir `Comanda X`, com
fallback `Pedido N` quando a comanda não foi emitida (mesmo padrão do card Pendente).

## 4 e 5 — Valor da entrega

**Banco**: `Delivery.driverFee Decimal(10,2)?`.

`CompletePhotoModal` ganha o campo numérico obrigatório "Valor da entrega";
`completeDelivery` exige `driverFee > 0` e grava no `Delivery`.

`EntregaItem` ganha `driverFee`; a ficha mostra "Valor informado pelo motorista"
e o modal "Pagar entrega" pré-preenche o campo com esse valor.

## 6 — WhatsApp na confirmação de pagamento da entrega

Ciclo: o motorista conclui a entrega e informa o valor → o Financeiro registra o
pagamento em Pagamentos de Motoristas → o **motorista** recebe
"Pagamento da comanda X efetuado com sucesso." (comanda ausente → número do pedido).

`sendWhatsappToDrivers` passa a aceitar `text` (default: mensagem de novo
pacote), mantendo resolução de JID, espaçamento, outbox e log. `payDriverDelivery`
dispara o envio para `delivery.driverId` após gravar o pagamento, sem bloquear a
resposta. O outbox continua reconstruindo só a mensagem padrão em último caso; a
de pagamento fica na memória pelo TTL normal.

## 7 — Fluxo simplificado com Pronto e Em Rota

`SIMPLIFIED_FLOW`/`SIMPLIFIED_COLUMNS` = `PAGO, EMBALANDO, ENVIADO, EM_ROTA, ENTREGUE`.
Sai a "dobra" de ENVIADO/EM_ROTA na coluna Embalando.

**Banco**: `Order.pickupAtStore Boolean @default(false)`.

**Kanban** (`simplified`): ao avançar de EMBALANDO abre o modal de logística com
quatro opções: rastreio, motorista, em aberto, retirada na loja. As três
primeiras reaproveitam `shipWithTracking`, `assignDriverToOrder`,
`openOrderForDrivers`, que passam a aceitar origem EMBALANDO quando a loja é
simplificada e a permissão do dono do pedido (VENDAS já move os próprios cards).
Nova action `markPickupAtStore` grava a flag e move para ENVIADO.

**Transições**: `nextSimplifiedStatus(current, { pickupAtStore })` devolve ENTREGUE
a partir de ENVIADO quando retirada (premissa 15). Delivery é sincronizada ao
entrar em EM_ROTA/ENTREGUE como no padrão.

**Quadro do motorista**: a coluna Pronto lista pedidos de loja simplificada que
tenham `Delivery` (motorista ou em aberto) independentemente da forma de envio
(premissa 16). Pedidos com `pickupAtStore` ou rastreio não aparecem.

## Verificação

`npx tsc --noEmit`, `npx next build` e os scripts de `scripts/checks/`
(`order-flow.ts` atualizado; `order-returns.ts` novo). As migrations não rodam
localmente (Postgres local recusa as credenciais do `.env`); são revisadas e
rodam no deploy.
