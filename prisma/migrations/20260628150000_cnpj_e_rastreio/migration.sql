-- CreateTable: Cnpj (cadastro do Financeiro)
CREATE TABLE "Cnpj" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "document" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cnpj_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Cnpj_document_key" ON "Cnpj"("document");

-- CreateIndex
CREATE INDEX "Cnpj_active_idx" ON "Cnpj"("active");

-- AlterTable: vinculo de CNPJ e codigo de rastreio no pedido
ALTER TABLE "Order" ADD COLUMN "cnpjId" TEXT;
ALTER TABLE "Order" ADD COLUMN "trackingCode" TEXT;

-- CreateIndex
CREATE INDEX "Order_cnpjId_idx" ON "Order"("cnpjId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_cnpjId_fkey" FOREIGN KEY ("cnpjId") REFERENCES "Cnpj"("id") ON DELETE SET NULL ON UPDATE CASCADE;
