-- A COMPRA SAI DO STATUS E VIRA EIXO PROPRIO.
--
-- Em 28/10/2026 "COMPROU" entrou como quinto status. Estava errado, e o erro e
-- estrutural: status e um so por candidatura, entao quem comprava DEIXAVA de
-- estar em APROVADO. Tres consequencias:
--
--  - "aprovada e nao comprou" nao era expressavel;
--  - a taxa de aprovacao CAIA a cada venda fechada, e so nao caiu porque
--    `APROVADAS` somava os dois status a mao — um remendo que qualquer pessoa
--    podia esquecer, com o numero errado ainda parecendo plausivel na tela;
--  - marcar "nao comprou" apagaria o registro de que ela foi aprovada.
--
-- Agora sao dois eixos: `status` responde "foi aprovada?", `purchaseState`
-- responde "comprou?".
--
-- POR QUE 'COMPROU' NAO SAI DO ENUM DE STATUS. Postgres nao remove valor de
-- enum: seria preciso recriar o tipo e reescrever `WholesaleLead.status` e
-- `WholesaleLeadEvent.fromStatus/toStatus`. E o diario tem linhas REAIS
-- `APROVADO -> COMPROU`, de decisoes que aconteceram de verdade sob o modelo
-- antigo. Apagar o valor falsificaria o diario de auditoria. O valor fica,
-- documentado como legado no schema, e nenhum caminho de codigo o escreve —
-- quem lista status usa `STATUS_VIVOS`, nao `Object.values` do enum.

-- 1. O eixo novo.
CREATE TYPE "WholesalePurchaseState" AS ENUM ('CADENCIA', 'COMPROU', 'NAO_COMPROU');

-- 2. A coluna. NOT NULL com default: toda candidatura tem um valor, inclusive a
-- que nem foi analisada. E o que mantem correto o `total` do painel, que agora
-- agrupa por este campo — linha com NULL sairia da contagem em silencio.
ALTER TABLE "WholesaleLead"
  ADD COLUMN "purchaseState" "WholesalePurchaseState" NOT NULL DEFAULT 'CADENCIA';

-- 3. BACKFILL, antes de qualquer outra coisa tocar o status.
--
-- Quem estava em COMPROU foi aprovada e comprou: as duas coisas, que o modelo
-- antigo nao conseguia guardar juntas. Volta para APROVADO no eixo do status e
-- ganha COMPROU no eixo da compra. Nenhuma informacao se perde, e nenhuma
-- linha fica com o valor legado.
UPDATE "WholesaleLead"
  SET "status" = 'APROVADO', "purchaseState" = 'COMPROU'
  WHERE "status" = 'COMPROU';

-- 4. O diario passa a registrar DOIS eixos na mesma linha do tempo.
--
-- Os quatro campos anulaveis, e o par preenchido diz qual eixo mudou. As linhas
-- que ja existem tem fromStatus/toStatus preenchidos e seguem validas: o
-- DROP NOT NULL so permite o NULL, nao o introduz.
ALTER TABLE "WholesaleLeadEvent"
  ALTER COLUMN "fromStatus" DROP NOT NULL,
  ALTER COLUMN "toStatus" DROP NOT NULL,
  ADD COLUMN "fromPurchase" "WholesalePurchaseState",
  ADD COLUMN "toPurchase" "WholesalePurchaseState";

-- 5. A invariante do diario, NO BANCO e nao so no codigo.
--
-- Um evento e de status OU de compra: nunca dos dois, nunca de nenhum. Deixar
-- isso apenas na action nao basta porque diario de auditoria com linha
-- malformada e pior que nao ter diario — ninguem desconfia dele, e o defeito so
-- aparece quando alguem precisa do historico.
ALTER TABLE "WholesaleLeadEvent" ADD CONSTRAINT "evento_e_status_ou_compra" CHECK (
  ("fromStatus" IS NOT NULL AND "toStatus" IS NOT NULL
     AND "fromPurchase" IS NULL AND "toPurchase" IS NULL)
  OR
  ("fromPurchase" IS NOT NULL AND "toPurchase" IS NOT NULL
     AND "fromStatus" IS NULL AND "toStatus" IS NULL)
);

-- 6. O indice da reconciliacao acompanha o `where` que ela usa.
--
-- `reconciliarCompras` varre (status, purchaseState, customerId) a cada leitura
-- da tela. `purchaseState` no meio porque e a clausula que esvazia a varredura
-- em regime: passada a virada, a candidatura sai de CADENCIA e nao volta.
DROP INDEX "WholesaleLead_status_customerId_idx";
CREATE INDEX "WholesaleLead_status_purchaseState_customerId_idx"
  ON "WholesaleLead" ("status", "purchaseState", "customerId");
