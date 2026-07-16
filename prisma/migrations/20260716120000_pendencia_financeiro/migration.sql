-- Build.Flow | Migration: pendencia sinalizada pelo Financeiro
--
-- O Financeiro pode marcar "Atencao" num pedido e descrever o problema.
-- Vendas ve a pendencia (card avermelhado) e clica "Resolvido".
--
--  - financeIssue: texto do problema (null = sem pendencia).
--  - financeIssueAt: quando foi aberta.
--  - financeIssueResolvedAt: quando Vendas resolveu.
--    Pendencia ATIVA  = financeIssue != null E financeIssueResolvedAt IS NULL.
--    Pendencia RESOLVIDA = financeIssue != null E financeIssueResolvedAt != null.
--
-- SEGURANCA: nenhum dado e apagado.

ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "financeIssue" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "financeIssueAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "financeIssueResolvedAt" TIMESTAMP(3);
