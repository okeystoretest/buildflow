-- "Possui desconto?" no pedido de campanha. Altera a premiacao por item.
-- Default false = valor integral (comportamento dos pedidos existentes).
ALTER TABLE "Order" ADD COLUMN "campaignDiscount" BOOLEAN NOT NULL DEFAULT false;
