-- Telefone do usuario (hoje preenchido apenas para o perfil MOTORISTA).
--
-- Guardado como digitos com DDD e sem codigo de pais (ex.: "11988887777"):
-- a normalizacao acontece na gravacao (ver src/lib/phone.ts) para o numero ja
-- nascer pronto para um envio automatico, em vez de precisar de limpeza depois.
--
-- Idempotente e NAO destrutiva: apenas adiciona uma coluna opcional. Usuarios
-- ja cadastrados ficam com NULL ate alguem editar o cadastro.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "phone" TEXT;
