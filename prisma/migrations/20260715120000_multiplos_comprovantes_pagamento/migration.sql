-- Build.Flow | Migration: multiplos comprovantes de pagamento (ate 5 por pedido)
--
-- CONTEXTO:
--  - A Vendedora passa a poder anexar ate 5 comprovantes no Novo Pedido.
--  - Criamos a tabela OrderPaymentProof (1 pedido -> N comprovantes).
--  - O campo antigo "paymentProofPath" e MANTIDO: pedidos ja existentes
--    continuam funcionando; os novos passam a usar a tabela.
--  - "paymentProof2Path" (comprovante do Financeiro) NAO muda.
--
-- SEGURANCA: nenhum dado e apagado.

CREATE TABLE IF NOT EXISTS "OrderPaymentProof" (
  "id"        TEXT NOT NULL,
  "orderId"   TEXT NOT NULL,
  "filePath"  TEXT NOT NULL,
  "width"     INTEGER,
  "height"    INTEGER,
  "sizeBytes" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrderPaymentProof_pkey" PRIMARY KEY ("id")
);

-- Apaga os comprovantes junto com o pedido (mesma regra dos OrderItem).
ALTER TABLE "OrderPaymentProof"
  ADD CONSTRAINT "OrderPaymentProof_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "OrderPaymentProof_orderId_idx"
  ON "OrderPaymentProof" ("orderId");
