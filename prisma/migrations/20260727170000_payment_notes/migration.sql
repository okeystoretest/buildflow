-- Observacoes de Pagamento (exclusivo do Financeiro na aprovacao).
ALTER TABLE "Order" ADD COLUMN "paymentNotes" TEXT;
