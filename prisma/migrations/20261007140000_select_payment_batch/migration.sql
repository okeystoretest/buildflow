-- Adiantamento em cascata: um pagamento real pode cobrir varias parcelas.
--
-- R$ 700,00 numa mensalidade de R$ 500,00 quita a parcela e adianta R$ 200,00
-- da seguinte. Isso grava uma linha por parcela, e o batchId liga as linhas de
-- volta ao lancamento unico que as originou — a reversao desfaz o conjunto,
-- nao um pedaco.
--
-- Aditiva e idempotente. Pagamentos existentes ficam com batchId NULL, que e
-- exatamente o que significam: couberam numa parcela so.

ALTER TABLE "SelectPayment" ADD COLUMN IF NOT EXISTS "batchId" TEXT;
CREATE INDEX IF NOT EXISTS "SelectPayment_batchId_idx" ON "SelectPayment"("batchId");
