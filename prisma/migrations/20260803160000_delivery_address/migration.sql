-- Endereço de entrega (usado pela forma de envio "Excursão") + flag na
-- ShippingMethod que dispara a exigência do endereço e a etiqueta térmica.

ALTER TABLE "ShippingMethod" ADD COLUMN "requiresAddress" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Order" ADD COLUMN "shipCep"      TEXT;
ALTER TABLE "Order" ADD COLUMN "shipStreet"   TEXT;
ALTER TABLE "Order" ADD COLUMN "shipNumber"   TEXT;
ALTER TABLE "Order" ADD COLUMN "shipDistrict" TEXT;
ALTER TABLE "Order" ADD COLUMN "shipCity"     TEXT;
ALTER TABLE "Order" ADD COLUMN "shipState"    TEXT;

-- Marca automaticamente qualquer forma de envio cujo nome contenha "Excurs"
-- (cobre "1 - Excursão", "Excursao", etc.) como exigindo endereço. Idempotente.
-- Sem depender da extensão unaccent: cobrimos as grafias com/sem acento.
UPDATE "ShippingMethod"
SET "requiresAddress" = true
WHERE lower("name") LIKE '%excurs%';
