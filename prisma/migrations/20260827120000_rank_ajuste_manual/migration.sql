-- Ranking de Vendas: ajuste manual do valor realizado por vendedor.
--
-- Idempotente e NÃO destrutiva: apenas cria uma tabela nova. Nenhuma tabela
-- existente é alterada e nenhum dado do ranking é tocado — sem ajustes
-- cadastrados, o dashboard continua exibindo exatamente os mesmos números.

CREATE TABLE IF NOT EXISTS "RankAdjustment" (
  "id"           TEXT NOT NULL,
  "userId"       TEXT NOT NULL,
  "month"        INTEGER NOT NULL,
  "year"         INTEGER NOT NULL,
  "amount"       DECIMAL(12,2) NOT NULL,
  "systemAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "note"         TEXT,
  "changedBy"    TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RankAdjustment_pkey" PRIMARY KEY ("id")
);

-- Um ajuste por vendedor em cada mês/ano (a action faz upsert sobre esta chave).
CREATE UNIQUE INDEX IF NOT EXISTS "RankAdjustment_userId_month_year_key"
  ON "RankAdjustment"("userId", "month", "year");

CREATE INDEX IF NOT EXISTS "RankAdjustment_month_year_idx"
  ON "RankAdjustment"("month", "year");

-- FK protegida por checagem: permite reexecutar a migration sem erro.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'RankAdjustment_userId_fkey'
  ) THEN
    ALTER TABLE "RankAdjustment"
      ADD CONSTRAINT "RankAdjustment_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
