-- Reestruturacao do fluxo: EMBALADO e PROCESSADO saem de circulacao.
--
-- OS VALORES CONTINUAM NO ENUM. Nao ha DROP nem ALTER TYPE aqui, de proposito:
-- o OrderStatusHistory de todo pedido antigo aponta para esses valores, e
-- remove-los do enum exigiria reescrever historico — a auditoria pararia de
-- bater com o que aconteceu de fato. "Sair do fluxo" e uma regra da aplicacao
-- (ORDER_FLOW, colunas e transicoes validas), nao do banco.
--
-- O que esta migration faz e mover os pedidos VIVOS para fora deles, para que
-- ninguem fique parado num status que a interface nao mostra mais:
--
--   EMBALADO   -> PROCESSANDO  (o passo seguinte real)
--   PROCESSADO -> ENVIADO      ("Pronto"; vale tambem para o envio externo,
--                               que antes estacionava em PROCESSADO)
--
-- Idempotente: rodar duas vezes nao encontra mais nada para mover.

-- 1) Registra a mudanca no historico ANTES de mover. Sem isto o pedido pularia
--    um status sem explicacao, e quem olhasse o historico depois nao saberia
--    por que. changedBy fica NULL: nao foi uma pessoa, foi a migracao.
INSERT INTO "OrderStatusHistory" ("id", "orderId", "status", "changedBy", "note", "createdAt")
SELECT
  md5(random()::text || clock_timestamp()::text || "id"),
  "id",
  'PROCESSANDO'::"OrderStatus",
  NULL,
  'Reestruturacao do fluxo: Embalado saiu de circulacao.',
  NOW()
FROM "Order"
WHERE "status" = 'EMBALADO';

INSERT INTO "OrderStatusHistory" ("id", "orderId", "status", "changedBy", "note", "createdAt")
SELECT
  md5(random()::text || clock_timestamp()::text || "id"),
  "id",
  'ENVIADO'::"OrderStatus",
  NULL,
  'Reestruturacao do fluxo: Processado saiu de circulacao.',
  NOW()
FROM "Order"
WHERE "status" = 'PROCESSADO';

-- 2) Move os pedidos.
UPDATE "Order" SET "status" = 'PROCESSANDO' WHERE "status" = 'EMBALADO';
UPDATE "Order" SET "status" = 'ENVIADO'     WHERE "status" = 'PROCESSADO';

-- 3) Garante a linha de Delivery dos pedidos que foram parar em "Pronto".
--
-- O Kanban do motorista filtra por `delivery.driverId IS NULL`, e essa condicao
-- exige que a Delivery EXISTA. Um pedido migrado para Pronto sem essa linha
-- ficaria invisivel para todos os motoristas — presente no banco e ausente da
-- operacao. Pedido com rastreio tambem ganha a linha: ele nao aparece no quadro
-- dos motoristas (o filtro de rastreio o exclui), mas o resto do sistema conta
-- com a Delivery existindo.
INSERT INTO "Delivery" ("id", "status", "orderId", "createdAt", "updatedAt")
SELECT
  md5(random()::text || clock_timestamp()::text || o."id"),
  'AGUARDANDO'::"DeliveryStatus",
  o."id",
  NOW(),
  NOW()
FROM "Order" o
WHERE o."status" = 'ENVIADO'
  AND NOT EXISTS (SELECT 1 FROM "Delivery" d WHERE d."orderId" = o."id");
