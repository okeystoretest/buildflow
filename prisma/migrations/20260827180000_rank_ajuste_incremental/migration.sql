-- Ranking de Vendas: o ajuste manual passa a ser INCREMENTAL.
--
-- Antes, o valor digitado SUBSTITUIA o consolidado do vendedor no mes inteiro —
-- e todo pedido registrado depois do ajuste era ignorado no ranking. Agora o
-- ajuste responde apenas pelo periodo ATE o instante em que foi salvo
-- (`baselineAt`); os pedidos criados a partir dai SOMAM sobre ele.
--
-- Idempotente e NAO destrutiva: apenas adiciona uma coluna opcional. Ajustes
-- ja gravados ficam com baselineAt NULL e a aplicacao usa, para eles, o corte
-- padrao de 27/08/2026 as 10:00 (regra combinada com o negocio).

ALTER TABLE "RankAdjustment" ADD COLUMN IF NOT EXISTS "baselineAt" TIMESTAMP(3);
