-- Retirada na loja (fluxo simplificado).
--
-- Quarta opcao do modal de saida de Embalando, ao lado de rastreio, motorista
-- e em aberto. O pedido marcado vai a Pronto sem motorista e sem rastreio,
-- fica fora do quadro do Motorista e pula Em Rota (Pronto -> Entregue).
--
-- Idempotente e NAO destrutiva: coluna nova com default; todo o legado nasce
-- false, que e o comportamento que ja tinha.

ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "pickupAtStore" BOOLEAN NOT NULL DEFAULT false;
