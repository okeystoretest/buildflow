-- Notificacao de motoristas por WhatsApp (Baileys).
--
-- Quatro tabelas novas e um enum. NAO altera nenhuma tabela existente.
-- Escrita a mao e idempotente, no mesmo estilo das demais migrations do
-- projeto: o CMD do Dockerfile roda `migrate deploy` a cada subida.

DO $$ BEGIN
  CREATE TYPE "WhatsappSendStatus" AS ENUM ('ENVIADO', 'FALHOU', 'IGNORADO');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "WhatsappSession" (
  "id"        TEXT NOT NULL,
  "data"      TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WhatsappSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "WhatsappConfig" (
  "id"        TEXT NOT NULL DEFAULT 'singleton',
  "enabled"   BOOLEAN NOT NULL DEFAULT false,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WhatsappConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "WhatsappLock" (
  "id"          TEXT NOT NULL DEFAULT 'singleton',
  "instanceId"  TEXT NOT NULL,
  "heartbeatAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WhatsappLock_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "WhatsappSendLog" (
  "id"          TEXT NOT NULL,
  "orderId"     TEXT,
  "userId"      TEXT NOT NULL,
  "phoneSuffix" TEXT,
  "status"      "WhatsappSendStatus" NOT NULL,
  "error"       TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WhatsappSendLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "WhatsappSendLog_orderId_idx"   ON "WhatsappSendLog"("orderId");
CREATE INDEX IF NOT EXISTS "WhatsappSendLog_userId_idx"    ON "WhatsappSendLog"("userId");
CREATE INDEX IF NOT EXISTS "WhatsappSendLog_createdAt_idx" ON "WhatsappSendLog"("createdAt");
