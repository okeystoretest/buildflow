-- Comentario do Financeiro nos cards da coluna "Pagamento pendente".
--
-- Campo proprio, separado de "paymentNotes" (Observacoes de Pagamento gravadas
-- na aprovacao): sao dois donos e dois momentos diferentes: reaproveitar a
-- mesma coluna faria a edicao do comentario apagar o texto da auditoria.
--
-- Idempotente e NAO destrutiva: apenas adiciona uma coluna opcional.

ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "paymentPendingNote" TEXT;
