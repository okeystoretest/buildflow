-- Sessão revogável: coluna aditiva, não afeta dados existentes.
-- Todo usuário começa em 0; incrementar invalida os JWT já emitidos.
ALTER TABLE "User" ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0;
