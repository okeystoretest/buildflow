-- Cliente passa a ter apenas: code (unico, obrigatorio) e name.

-- 1) Adiciona "code" permitindo nulo temporariamente (para preencher os existentes).
ALTER TABLE "Customer" ADD COLUMN "code" TEXT;

-- 2) Preenche os clientes ja cadastrados com um codigo provisorio unico.
--    (sequencial CLI-0001, CLI-0002, ... baseado na data de criacao)
WITH numbered AS (
  SELECT "id",
         'CLI-' || LPAD(ROW_NUMBER() OVER (ORDER BY "createdAt", "id")::text, 4, '0') AS gen_code
  FROM "Customer"
)
UPDATE "Customer" c
SET "code" = n.gen_code
FROM numbered n
WHERE c."id" = n."id";

-- 3) Agora torna obrigatorio e unico.
ALTER TABLE "Customer" ALTER COLUMN "code" SET NOT NULL;
CREATE UNIQUE INDEX "Customer_code_key" ON "Customer"("code");

-- 4) Remove o indice unico antigo de document (se existir) e as colunas que sairam.
DROP INDEX IF EXISTS "Customer_document_key";
ALTER TABLE "Customer" DROP COLUMN IF EXISTS "document";
ALTER TABLE "Customer" DROP COLUMN IF EXISTS "phone";
ALTER TABLE "Customer" DROP COLUMN IF EXISTS "email";
ALTER TABLE "Customer" DROP COLUMN IF EXISTS "address";
ALTER TABLE "Customer" DROP COLUMN IF EXISTS "city";
ALTER TABLE "Customer" DROP COLUMN IF EXISTS "notes";
