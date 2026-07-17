-- CreateTable: prazos por etapa do Fluxo de Pedidos (Gestao > Etapas)
CREATE TABLE "StageTimeLimit" (
    "id" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL,
    "limitMinutes" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StageTimeLimit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StageTimeLimit_status_key" ON "StageTimeLimit"("status");
