-- ===========================================================================
-- Build.Flow — "N° de Peças no Pedido" + Controle de Peças
-- ===========================================================================
-- Idempotente e NAO destrutiva: apenas adiciona coluna/tipo/tabela.
-- Pedidos existentes ficam com pieceCount = 0 e pieceStatus = NULL.
-- ===========================================================================

-- 1) Quantidade de pecas do pedido (campo declarado no formulario de Vendas).
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "pieceCount" INTEGER NOT NULL DEFAULT 0;

-- 2) Estado da peca no Controle de Pecas (tipo "10 - Peças p/ Blogueira").
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PieceStatus') THEN
    CREATE TYPE "PieceStatus" AS ENUM ('EM_USO', 'DEVOLVIDO', 'EM_MANUTENCAO');
  END IF;
END
$$;

ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "pieceStatus" "PieceStatus";

CREATE INDEX IF NOT EXISTS "Order_pieceStatus_idx" ON "Order"("pieceStatus");

-- 3) Trilha de auditoria das movimentacoes do quadro de Controle de Pecas.
CREATE TABLE IF NOT EXISTS "PieceMovement" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "fromStatus" "PieceStatus",
    "toStatus" "PieceStatus" NOT NULL,
    "note" TEXT,
    "changedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PieceMovement_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PieceMovement_orderId_idx" ON "PieceMovement"("orderId");
CREATE INDEX IF NOT EXISTS "PieceMovement_createdAt_idx" ON "PieceMovement"("createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PieceMovement_orderId_fkey'
  ) THEN
    ALTER TABLE "PieceMovement"
      ADD CONSTRAINT "PieceMovement_orderId_fkey"
      FOREIGN KEY ("orderId") REFERENCES "Order"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;
