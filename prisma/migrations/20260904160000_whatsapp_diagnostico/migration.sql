-- Diagnostico do boot da conexao do WhatsApp.
--
-- Motivo: o painel mostrava "Desconectado" tanto para "a conexao nunca
-- iniciou" quanto para "iniciou e falhou em algum ponto" — problemas
-- completamente diferentes, indistinguiveis sem acesso ao log do container.
--
-- As colunas ficam em WhatsappConfig, e nao em WhatsappLock, porque esta linha
-- e gravada por upsert e NAO depende de lideranca: um processo que falha antes
-- de obter a concessao ainda consegue registrar onde parou.
--
-- Idempotente e NAO destrutiva: apenas adiciona colunas.

ALTER TABLE "WhatsappConfig" ADD COLUMN IF NOT EXISTS "bootAt" TIMESTAMP(3);
ALTER TABLE "WhatsappConfig" ADD COLUMN IF NOT EXISTS "stage" TEXT;
ALTER TABLE "WhatsappConfig" ADD COLUMN IF NOT EXISTS "lastError" TEXT;
ALTER TABLE "WhatsappConfig" ADD COLUMN IF NOT EXISTS "holderInstanceId" TEXT;
