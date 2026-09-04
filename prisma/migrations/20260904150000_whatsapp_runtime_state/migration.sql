-- Estado observavel da conexao do WhatsApp publicado na linha da concessao.
--
-- Correcao do "QR nao aparece": o Next compila o modulo da conexao em mais de
-- um bundle (a instrumentacao carrega uma copia, a Server Action do painel
-- carrega outra) e cada bundle tem seu proprio registro de modulos. O estado em
-- memoria do processo que conecta nunca chegava ao painel. Com varias replicas
-- o problema se repete entre processos.
--
-- Mesma razao pela qual o bus de tempo real ja vive no banco (ver
-- src/lib/realtime/bus.ts).
--
-- Idempotente e NAO destrutiva: apenas adiciona colunas.

ALTER TABLE "WhatsappLock" ADD COLUMN IF NOT EXISTS "state" TEXT NOT NULL DEFAULT 'DESCONECTADO';
ALTER TABLE "WhatsappLock" ADD COLUMN IF NOT EXISTS "qr" TEXT;
ALTER TABLE "WhatsappLock" ADD COLUMN IF NOT EXISTS "connectedNumber" TEXT;
