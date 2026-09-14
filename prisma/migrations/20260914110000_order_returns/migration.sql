-- Devolucoes de pecas registradas em Vendas (e no Historico de Vendas).
--
-- Cada devolucao e uma lista de (referencia, quantidade, valor). Ao gravar, a
-- action abate a soma de Order.orderValue e recalcula total; o pedido nao muda
-- de status. O bruto original se reconstroi somando as devolucoes.
--
-- "registeredById" nao tem FK de proposito: apagar um usuario nao pode apagar
-- (nem impedir de apagar) o registro de uma devolucao.
--
-- Idempotente e NAO destrutiva: duas tabelas novas, nada existente e tocado.
-- O ON DELETE CASCADE acompanha a exclusao do pedido (Vendas > Excluir).

CREATE TABLE IF NOT EXISTS "OrderReturn" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "registeredById" TEXT,
    "note" TEXT,
    "totalValue" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderReturn_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "OrderReturn_orderId_idx" ON "OrderReturn"("orderId");

ALTER TABLE "OrderReturn"
  DROP CONSTRAINT IF EXISTS "OrderReturn_orderId_fkey";

ALTER TABLE "OrderReturn"
  ADD CONSTRAINT "OrderReturn_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "OrderReturnItem" (
    "id" TEXT NOT NULL,
    "returnId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "value" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "OrderReturnItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "OrderReturnItem_returnId_idx" ON "OrderReturnItem"("returnId");

ALTER TABLE "OrderReturnItem"
  DROP CONSTRAINT IF EXISTS "OrderReturnItem_returnId_fkey";

ALTER TABLE "OrderReturnItem"
  ADD CONSTRAINT "OrderReturnItem_returnId_fkey"
  FOREIGN KEY ("returnId") REFERENCES "OrderReturn"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
