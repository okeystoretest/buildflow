-- Controle de Peças: novo estado terminal "Finalizado".
--
-- Idempotente e NÃO destrutiva: apenas acrescenta um valor ao enum existente.
-- Nenhum pedido é alterado — os que já estão em EM_USO / DEVOLVIDO /
-- EM_MANUTENCAO permanecem exatamente onde estão.
--
-- Observação sobre PostgreSQL: `ALTER TYPE ... ADD VALUE` dentro de uma
-- transação é permitido a partir do PG 12, desde que o novo valor não seja
-- USADO na mesma transação. Esta migration só adiciona o rótulo; a primeira
-- gravação de 'FINALIZADO' acontece depois, em runtime. Por isso ela roda sem
-- problema pelo `prisma migrate deploy` (que envolve tudo numa transação).
--
-- A coluna "Em Manutenção" passou a se chamar "Reprocessamento" APENAS no
-- rótulo da interface. O valor gravado continua sendo EM_MANUTENCAO — renomear
-- exigiria reescrever histórico (PieceMovement.fromStatus/toStatus) sem ganho
-- funcional. Mesmo critério já usado em ENVIADO -> "Pronto".

ALTER TYPE "PieceStatus" ADD VALUE IF NOT EXISTS 'FINALIZADO';
