-- "PAGO": novo status para o fluxo simplificado por Loja de Origem.
-- Isolado em sua propria migration: no Postgres, ALTER TYPE ADD VALUE nao
-- pode coexistir com o uso do novo valor na mesma transacao.
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'PAGO' BEFORE 'AGUARDANDO_IMPRESSAO';
