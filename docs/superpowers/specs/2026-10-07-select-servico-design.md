# Select: venda de serviço (formulário) e acompanhamento no Financeiro

Data: 2026-10-07 · Status: aprovado para execução

## 1. O que é

O **Select** é a adesão de uma cliente a um plano de serviço da marca. Não é
um pedido: é contrato próprio, com validade, mensalidade e um mínimo de
compras mensal esperado da cliente.

Três entregas:

1. **Novo Select** — formulário em Vendas, com troca, renovação e cancelamento.
2. **Select no Financeiro** — parcelas, pagamentos (inclusive parciais) e indicadores.
3. **Mínimo de compras e cobrança** — contabiliza pedidos aprovados e avisa vencimentos.

## 2. Decisões

Cada linha é uma pendência, com a decisão tomada e o motivo. As 22 primeiras
saíram da análise da spec v5; as seguintes foram levantadas depois dela. São elas que governam o código; divergência entre código e
esta tabela é defeito.

| # | Pendência | Decisão | Motivo |
|---|---|---|---|
| 1 | Numeração das parcelas de contrato retroativo | Preserva a numeração do contrato: um Select de 12 meses iniciado há 9 gera as parcelas **10, 11 e 12 de 12** | "Parcela 10 de 12" é a leitura do contrato; renumerar faria 3 parcelas parecerem o contrato inteiro |
| 2 | "Total contratado" no painel | Duas linhas distintas: **Valor do contrato** (mensalidade × validade) e **Valor a cobrar** (soma das parcelas geradas) | Com início retroativo os dois divergem; uma linha só mentiria em um dos dois sentidos |
| 3 | Troca no meio do mês com a parcela já paga | Nada é estornado. O detalhe do Select encerrado exibe o aviso **"R$ X pagos referentes a período posterior ao encerramento"** | Estorno automático inventa movimento financeiro; o aviso dá ao Financeiro a informação para decidir por fora |
| 4 | Select de renovação futura quando chega uma troca | **Bloqueia** a troca e orienta a cancelar a renovação antes | Cancelar em cascata destrói um contrato que alguém cadastrou de propósito, silenciosamente |
| 5 | `updatedAt`/`updatedById` em contrato | Registram só cancelamento e encerramento — não há edição de contrato | A regra 4.6 (contrato não se sobrescreve) permanece |
| 6 | Pagamento parcial | **1 parcela : N pagamentos**. `paidAmount` denormalizado na parcela, status `PARCIAL` derivado de `0 < paidAmount < amount` | O modelo de `valor_pago` único não comporta a resposta 5 |
| 7 | Campos do pagamento | Data, valor, **Forma de Pagamento, Banco e CNPJ** (os cadastros que o Financeiro já mantém), comprovante anexado, observação, autor e data do registro | Cadastro paralelo divergiria do que o Financeiro já administra |
| 8 | Janela do mínimo de compras | **Ciclo da mensalidade**: Select que começa dia 15 conta de 15 a 14 | O mínimo é contratual, e o contrato começa no dia do início, não no dia 1º |
| 9 | Mês em que o pedido entra | Data da **aprovação do Financeiro** (`Order.financeApprovedAt`, campo novo) | É o evento que a resposta 8 nomeia; a criação não garante que a venda se concretizou |
| 10 | Doação conta no mínimo | **Não** | É aprovada sem pagamento, sem CNPJ e sem comprovante — não é compra |
| 11 | Estorno / cancelamento / devolução | `ESTORNO`, `ESTORNO_PARCIAL` e `CANCELADO` saem da soma. Devoluções (`OrderReturn`) abatem o valor devolvido do ciclo em que o pedido foi aprovado | Contar venda desfeita como compra inflaria o mínimo |
| 12 | Não bater o mínimo | Só indicador, com destaque visual. Sem bloqueio nem cobrança | A resposta 8 pede acompanhar, não penalizar |
| 13 | Quando notificar | Aviso **3 dias antes** do vencimento e no **dia do vencimento**; depois, um **resumo diário** do que está vencido. Uma notificação por usuário por dia | Repetir por parcela transformaria o sino num despejo diário |
| 14 | Quem recebe | Todos os usuários **FINANCEIRO e GESTÃO** ativos | A resposta 2 deu acesso à Gestão |
| 15 | Onde se cria um Select | Botão em **Vendas** e atalho na ferramenta **Select do Financeiro**. A rota `/vendas/novo-select` aceita VENDAS, GESTÃO e FINANCEIRO | Resposta 1, sem duplicar formulário |
| 16 | Vendas e a troca | O Select ativo é detectado **na busca pelo código**, antes do preenchimento. VENDAS vê o aviso e o botão de salvar fica bloqueado com a orientação de acionar Gestão/Financeiro | Descobrir o bloqueio só no submit desperdiça o preenchimento inteiro |
| 17 | Nomenclatura | `SelectPlan`, `SelectPlanBenefit`, `SelectContract`, `SelectInstallment`, `SelectPayment` | Schema do projeto é em inglês; `prisma.select` seria ilegível |
| 18 | Build.Sales (R$ 67,00/mês) | **Entra na cobrança** (revisto em 08/10/2026): é somado à mensalidade de **todos** os planos pelo servidor, em `resolveValues`. `SelectPlan.monthlyAmount` guarda a mensalidade BASE (597/997/1297); a cliente paga 664/1064/1364 e o contrato de 12 meses vale R$ 7.968/12.768/16.368. No plano negociado o acréscimo incide sobre o valor digitado. O **valor nominal não aparece** na lista de benefícios | Reverte a decisão original ("não entra na cobrança"). A soma na mensalidade, e não uma cobrança única, preserva a invariante da decisão 2 (`totalAmount` = mensalidade × validade) e faz as parcelas já nascerem corretas. Constante única (`BUILD_SALES_MONTHLY`) porque é o mesmo serviço pelo mesmo preço nos quatro planos |
| 19 | Fretes grátis / crédito de R$ 200 | Texto do benefício nesta versão | Efeito em pedidos é escopo do módulo de Pedidos |
| 20 | Pg 30 | Texto do benefício. Sem vínculo com `Campaign` | Nenhuma regra de pontuação foi definida |
| 21 | Validade do plano 4 | **Editável**, junto com mensalidade e mínimo (`editableValues` cobre os três) | Plano negociado tem prazo negociado |
| 22 | Cliente criada automaticamente | Código e nome apenas. Se o nome digitado já existir sob outro código, **aviso de possível duplicata** (não bloqueia) | Campos opcionais atrasariam a adesão; o aviso evita a duplicata silenciosa |
| 23 | Pagamento **acima** da parcela (levantado em 07/10, depois da v5) | **Adiantamento em cascata**: o excedente desce para as parcelas em aberto seguintes, só para a frente, a partir da escolhida. Um lançamento vira uma linha por parcela, ligadas por `batchId`; reverter desfaz o lote inteiro. Valor acima do que há para cobrar recusa o lançamento inteiro | A spec v5 só previa pagar a menos. Rateio para trás tiraria do Financeiro o controle da parcela que ele acabou de escolher; gravar só o pedaço que coube deixaria meio pagamento registrado |
| 24 | Responsável pela venda (revisto em 09/10/2026) | **Escolhido**, não mais herdado da sessão: Gestão e Financeiro selecionam num dropdown que lista apenas usuários de perfil **VENDAS ativos**, e a escolha é **obrigatória**. Quem é de VENDAS não escolhe — é responsável de si mesmo, e um id enviado no payload é ignorado. Só no cadastro: contrato gravado não troca de responsável pela tela | Todo Select passa a pertencer a um vendedor, inclusive quando quem digita é Gestão — que, não sendo VENDAS, não pode ficar como responsável. Reverte a parte de "o responsável sai da sessão": é o único campo que o navegador passa a decidir, e por isso a regra inteira vive numa função pura (`resolveResponsibleId`) conferida no servidor dentro da transação da gravação, com 11 checagens |
| 25 | Busca e cadastro de cliente (revisto em 09/10/2026) | A cliente é **escolhida numa busca** com sugestões do servidor por nome ou código (o mesmo `CustomerCombobox` do Novo Pedido, teto de 20 e debounce de 300 ms). Busca sem resultado oferece **"+ Novo cliente"**, que abre o cadastro completo em modal (os 8 campos da tela de clientes, pela `createCustomer` que já existia) e deixa a cliente nova já selecionada. A adesão passa a **recusar** código desconhecido | Substitui a decisão 22 ("cliente criada automaticamente"). A criação dentro da transação cadastrava a cliente com código e nome e mais nada, sem endereço nem contato, e o aviso de duplicata era o único freio contra dois cadastros da mesma loja. Com o cadastro acontecendo antes, o Select se liga a cliente de verdade, e o `name` enviado pelo navegador deixa de existir no contrato de entrada. O "+ Novo cliente" é **opt-in** no combobox (prop `onCreateNew`): o Novo Pedido não a passa e segue sem o botão |
| 26 | Cadastro de planos (acrescentado em 09/10/2026) | Aba **Planos** em Gestão (só `GESTAO`), com nome, validade, mensalidade **base**, mínimo de compras, a marca **"valores negociados a cada adesão"** e benefícios ilimitados por "+ Adicionar benefício" (teto de 30, 200 caracteres cada). Nome duplicado é **recusado**; plano com contrato **não pode ser excluído**, só desativado; editar plano **não** reescreve contrato vendido. A tela mostra, embaixo do campo, quanto a cliente pagará (base + Build.Sales) | Até aqui os quatro planos só existiam por seed. O par (negociado × valores) é validado como um só em `resolvePlanForm` — puro, com os MESMOS limites de `resolveValues` — porque um plano gravado sem valores aparece na lista da adesão e só falha em "O plano não tem valores cadastrados" depois do formulário preenchido. Nome duplicado quebraria o seed, que é idempotente por nome. A conta exibida existe porque cadastrar 664 em vez de 597 é o erro mais natural desta tela, e cobraria o Build.Sales duas vezes |
| 27 | Leitura de valor digitado (defeito corrigido em 09/10/2026) | `parseMoney` passou a desempatar o ponto pelo número de casas: 1 ou 2 é decimal (`1297.50` → 1297,50), 3 é milhar (`1.297` → 1297). Vive em `select-contract.ts`, usado por adesão, pagamento e cadastro de plano | A versão anterior apagava TODO ponto, então `1297.50` virava **129750** — quem digitasse `797.50` registrava R$ 79.750 em vez de R$ 797,50, calado, num campo de dinheiro. Havia três cópias da função; a correção numa só deixaria o erro de 100× vivo nas outras |

## 3. Modelo de dados

Cinco tabelas novas e **um** campo novo em `Order`.

- **`SelectPlan`** — nome, `validityMonths`, `monthlyAmount`, `minMonthlyPurchase`,
  `editableValues`, `active`, `sortOrder`. Valores nulos quando `editableValues`.
- **`SelectPlanBenefit`** — texto e ordem, por plano.
- **`SelectContract`** — cliente, plano, responsável, `startDate`, `endDate`,
  `closedAt`, `replacedById`, o snapshot (`validityMonths`, `monthlyAmount`,
  `totalAmount`, `minMonthlyPurchase`, `planNameSnapshot`), status e auditoria.
- **`SelectInstallment`** — número, `dueDate`, `amount`, `paidAmount`, status,
  `settledAt`, observação, auditoria. Único por (contrato, número).
- **`SelectPayment`** — data, valor, forma de pagamento, banco, CNPJ,
  comprovante, observação, autor. Reversão marca `reversedAt` em vez de apagar.
  `batchId` liga as linhas de um mesmo pagamento que cobriu várias parcelas.
- **`Order.financeApprovedAt`** — carimbo da aprovação do Financeiro, com
  backfill a partir de `OrderStatusHistory`.

**Estados derivados, nunca gravados:** parcela `VENCIDA` (`PENDENTE` e
`dueDate < hoje`), parcela `PARCIAL` (`0 < paidAmount < amount`), contrato
`ENCERRADO` por data (fim efetivo alcançado). Derivar em vez de gravar elimina
a dependência de um agendador para a verdade dos dados — o agendador fica
responsável só por **notificar**.

## 4. Regras

**Fim do contrato.** `endDate = startDate + validityMonths` em meses de
calendário, com recuo para o último dia em meses mais curtos (31/01 + 1 mês =
28/02). Fim efetivo = `closedAt ?? endDate`, e é exclusivo: um Select pode
começar exatamente no fim do anterior.

**Parcelas.** Uma por mês de validade, vencendo no dia do início. Só são
geradas as de vencimento **a partir de hoje** (decisão 1): a soma das parcelas
é `mensalidade × meses restantes`, e não o valor do contrato.

**Troca.** Início do novo anterior ao fim efetivo do ativo. Exige confirmação e
perfil GESTÃO ou FINANCEIRO, validado no servidor. Numa transação: `closedAt`
do antigo recebe o início do novo, `replacedById` é preenchido, as parcelas
pendentes do antigo com vencimento a partir de `closedAt` são canceladas, e o
novo é gravado com as suas parcelas. Início do novo precisa ser posterior ao
início do antigo.

**Mínimo de compras.** Por ciclo mensal do contrato: soma de `Order.orderValue`
dos pedidos da cliente com `financeApprovedAt` dentro do ciclo, excluídos os de
status `ESTORNO`, `ESTORNO_PARCIAL`, `CANCELADO` e os do tipo Doação, menos as
devoluções desses pedidos.

**Segurança.** Todo valor é recalculado no servidor a partir de `SelectPlan`;
o que o navegador envia serve só para exibir. Responsável e autores vêm da
sessão. Troca, cancelamento e ações financeiras verificam o perfil no servidor.

## 5. Permissões

| Ação | Perfis |
|---|---|
| Criar Select (sem troca) | VENDAS, GESTÃO, FINANCEIRO |
| Confirmar troca | GESTÃO, FINANCEIRO |
| Cancelar Select | GESTÃO, FINANCEIRO |
| Ferramenta Select no Financeiro | FINANCEIRO, GESTÃO |
| Registrar / reverter pagamento, cancelar parcela | FINANCEIRO, GESTÃO |
