-- Remocao do canal de WhatsApp (Baileys). As notificacoes internas (Web Push)
-- assumiram o papel. Destrutivo de proposito: o pareamento e o log de envios
-- deixam de existir junto com o codigo que os lia.
DROP TABLE IF EXISTS "WhatsappSendLog";
DROP TABLE IF EXISTS "WhatsappLock";
DROP TABLE IF EXISTS "WhatsappConfig";
DROP TABLE IF EXISTS "WhatsappSession";
DROP TYPE IF EXISTS "WhatsappSendStatus";
