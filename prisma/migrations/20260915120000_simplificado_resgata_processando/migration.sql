-- Resgate: pedidos de loja com fluxo simplificado que foram parar em
-- PROCESSANDO (ou no legado PROCESSADO) voltam a EMBALANDO.
--
-- O fluxo simplificado e PAGO -> EMBALANDO -> PRONTO -> EM_ROTA -> ENTREGUE.
-- Processando nao faz parte dele e nao tem coluna no quadro da loja: o pedido
-- continuava no banco, mas sumia da operacao. A saida de Embalando passa pela
-- escolha de logistica (rastreio, motorista, em aberto, retirada), e e essa
-- escolha que precisa acontecer — por isso o pedido volta a EMBALANDO, e nao
-- pula para Pronto sem que ninguem tenha decidido como ele sai.
--
-- A aplicacao passa a recusar essa transicao (advanceOrderStatus e
-- setOrderStatus) e a mostrar no quadro qualquer pedido que ainda escape
-- ("Fora do fluxo"). Esta migration cuida do que ja aconteceu.
--
-- Idempotente: rodar duas vezes nao encontra mais nada para mover.

-- 1) Registra a volta no historico ANTES de mover, para quem olhar depois
--    saber por que o pedido saiu de Processando. changedBy NULL: foi a
--    migracao, nao uma pessoa.
INSERT INTO "OrderStatusHistory" ("id", "orderId", "status", "changedBy", "note", "createdAt")
SELECT
  md5(random()::text || clock_timestamp()::text || o."id"),
  o."id",
  'EMBALANDO'::"OrderStatus",
  NULL,
  'Resgate: pedido de loja simplificada estava em ' ||
    CASE o."status" WHEN 'PROCESSANDO' THEN 'Processando' ELSE 'Processado' END ||
    ', fora do fluxo. Voltou a Embalando.',
  NOW()
FROM "Order" o
JOIN "OriginStore" s ON s."id" = o."originStoreId"
WHERE s."simplifiedFlow" = TRUE
  AND o."status" IN ('PROCESSANDO', 'PROCESSADO');

-- 2) Move os pedidos.
UPDATE "Order" o
SET "status" = 'EMBALANDO'
FROM "OriginStore" s
WHERE s."id" = o."originStoreId"
  AND s."simplifiedFlow" = TRUE
  AND o."status" IN ('PROCESSANDO', 'PROCESSADO');
