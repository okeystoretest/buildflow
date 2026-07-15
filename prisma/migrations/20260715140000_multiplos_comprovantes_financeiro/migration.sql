-- Build.Flow | Migration: multiplos comprovantes do Financeiro (ate 5 por pedido)
--
-- CONTEXTO:
--  - O Financeiro passa a poder anexar ate 5 comprovantes na Analise de Pedidos.
--  - Tabela OrderFinanceProof (1 pedido -> N comprovantes).
--  - "paymentProof2Path" e MANTIDO: continua sendo a trava de aprovacao
--    (o primeiro comprovante e espelhado nele).
--
-- SEGURANCA: nenhum dado e apagado.

CREATE TABLE IF NOT EXISTS "OrderFinanceProof" (
  "id"        TEXT NOT NULL,
  "orderId"   TEXT NOT NULL,
  "filePath"  TEXT NOT NULL,
  "width"     INTEGER,
  "height"    INTEGER,
  "sizeBytes" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrderFinanceProof_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "OrderFinanceProof"
  ADD CONSTRAINT "OrderFinanceProof_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "OrderFinanceProof_orderId_idx"
  ON "OrderFinanceProof" ("orderId");
