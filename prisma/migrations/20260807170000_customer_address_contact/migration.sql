-- Novos campos de endereco/contato no cadastro de Clientes (todos opcionais).
ALTER TABLE "Customer" ADD COLUMN "cep" TEXT;
ALTER TABLE "Customer" ADD COLUMN "street" TEXT;
ALTER TABLE "Customer" ADD COLUMN "district" TEXT;
ALTER TABLE "Customer" ADD COLUMN "city" TEXT;
ALTER TABLE "Customer" ADD COLUMN "state" TEXT;
ALTER TABLE "Customer" ADD COLUMN "contact" TEXT;
