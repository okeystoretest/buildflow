-- Banco da transação no pedido (selecionado no formulário de vendas).
ALTER TABLE "Order" ADD COLUMN "bankId" TEXT;

-- CreateIndex
CREATE INDEX "Order_bankId_idx" ON "Order"("bankId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_bankId_fkey" FOREIGN KEY ("bankId") REFERENCES "Bank"("id") ON DELETE SET NULL ON UPDATE CASCADE;
