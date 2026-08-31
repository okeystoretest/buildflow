-- Link de Acompanhamento do cliente final (/acompanhar/<trackingToken>).
--
-- Idempotente e NAO destrutiva: acrescenta uma coluna nova ao pedido e faz o
-- backfill dos registros existentes, para que TODO pedido ja cadastrado tenha
-- um link valido no primeiro deploy (sem isso, so pedidos novos teriam).
--
-- O token e md5(id + random + clock_timestamp): 128 bits opacos, e a presenca
-- do "id" (unico) na entrada garante que nao ha colisao no backfill.

ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "trackingToken" TEXT;

UPDATE "Order"
   SET "trackingToken" = md5("id" || random()::text || clock_timestamp()::text)
 WHERE "trackingToken" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "Order_trackingToken_key"
  ON "Order"("trackingToken");
