-- Motivo de atraso por ETAPA do pedido.
--
-- Quando um card passa de 5 minutos alem do prazo da etapa (Gestao > Etapas), o
-- quadro pede ao setor dono daquele status que justifique o atraso. O vinculo e
-- com o par (pedido, status), e nao so com o pedido: um mesmo pedido pode
-- atrasar em varias etapas, cada uma com a sua causa. Um campo unico no Order
-- perderia a justificativa anterior a cada novo atraso.
--
-- "minutesLate" e o atraso NO MOMENTO da justificativa (snapshot). O limite da
-- etapa pode mudar depois em Gestao > Etapas; o que foi justificado nao muda.
--
-- Idempotente e NAO destrutiva: cria uma tabela nova, nao toca em nada
-- existente. O ON DELETE CASCADE acompanha a exclusao do pedido.

CREATE TABLE IF NOT EXISTS "OrderDelayReason" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL,
    "reason" TEXT NOT NULL,
    "minutesLate" INTEGER NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderDelayReason_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "OrderDelayReason_orderId_status_key"
  ON "OrderDelayReason"("orderId", "status");

CREATE INDEX IF NOT EXISTS "OrderDelayReason_orderId_idx"
  ON "OrderDelayReason"("orderId");

ALTER TABLE "OrderDelayReason"
  DROP CONSTRAINT IF EXISTS "OrderDelayReason_orderId_fkey";

ALTER TABLE "OrderDelayReason"
  ADD CONSTRAINT "OrderDelayReason_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
