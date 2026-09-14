-- Valor do servico de entrega informado pelo motorista ao concluir.
--
-- O campo nasce nulo: entregas concluidas antes desta migration nao tem valor
-- informado, e a tela do Financeiro exibe "—" para elas. Nao ha backfill
-- possivel — o valor so o motorista sabe.
--
-- Idempotente e NAO destrutiva: so adiciona uma coluna opcional.

ALTER TABLE "Delivery" ADD COLUMN IF NOT EXISTS "driverFee" DECIMAL(10,2);
