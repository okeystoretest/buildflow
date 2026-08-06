-- CreateTable
CREATE TABLE "Excursao" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "cutoffTime" TEXT,
    "operatingDays" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Excursao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Excursao_name_idx" ON "Excursao"("name");

-- AlterTable
ALTER TABLE "Order" ADD COLUMN "excursaoId" TEXT;

-- CreateIndex
CREATE INDEX "Order_excursaoId_idx" ON "Order"("excursaoId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_excursaoId_fkey" FOREIGN KEY ("excursaoId") REFERENCES "Excursao"("id") ON DELETE SET NULL ON UPDATE CASCADE;
