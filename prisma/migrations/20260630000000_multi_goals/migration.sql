-- Build.Flow | Migration: metas multiplas por vendedora
-- Remove a regra antiga que permitia UMA so meta por (user, mes, ano, escopo)
-- e cria duas regras parciais para Geral e Campanha conviverem.

-- 1) Derruba o indice unico antigo (gerado pelo @@unique([userId, month, year, scope])).
--    O nome padrao do Prisma e "SalesGoal_userId_month_year_scope_key".
DROP INDEX IF EXISTS "SalesGoal_userId_month_year_scope_key";

-- 2) Meta GERAL: uma unica por vendedora / mes / ano / escopo (quando NAO ha campanha).
CREATE UNIQUE INDEX IF NOT EXISTS "salesgoal_geral_unique"
  ON "SalesGoal" ("userId", "month", "year", "scope")
  WHERE "campaignId" IS NULL;

-- 3) Meta de CAMPANHA: uma unica por vendedora / mes / ano / escopo / campanha.
--    Varias campanhas diferentes convivem; nenhuma pisa na Geral.
CREATE UNIQUE INDEX IF NOT EXISTS "salesgoal_campanha_unique"
  ON "SalesGoal" ("userId", "month", "year", "scope", "campaignId")
  WHERE "campaignId" IS NOT NULL;

-- 4) Indice de apoio para consultas por vendedora/periodo (substitui parte do antigo).
CREATE INDEX IF NOT EXISTS "SalesGoal_userId_month_year_idx"
  ON "SalesGoal" ("userId", "month", "year");
