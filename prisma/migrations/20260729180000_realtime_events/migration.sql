-- Tempo real via banco: eventos de pedido persistidos para o polling ler.
-- Substitui o buffer em memoria (que nao funciona no container standalone,
-- pois Server Action e route handler nao compartilham o mesmo processo/modulo).

CREATE TABLE "RealtimeEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderNumber" TEXT,
    "customerName" TEXT,
    "status" TEXT,
    "originStoreId" TEXT,
    "notifyRoles" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RealtimeEvent_pkey" PRIMARY KEY ("id")
);

-- O poll consulta "eventos apos o timestamp X", ordenando por createdAt.
CREATE INDEX "RealtimeEvent_createdAt_idx" ON "RealtimeEvent"("createdAt");
