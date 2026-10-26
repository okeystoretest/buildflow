-- HISTORICO DE INTERACAO DAS ETAPAS DO ROADMAP DO SELECT.
--
-- Por que uma tabela: `SelectContractStep.doneAt/doneById` sao o ESTADO
-- ATUAL. Desmarcar os zera, e com eles vai embora quem tinha marcado. Com o
-- roadmap virando checkbox (desmarcar deixa de ser um botao separado e passa a
-- ser um clique como o outro), perder esse rastro deixaria de ser detalhe.
--
-- Aditiva e idempotente. Nada existente e alterado ou apagado.

CREATE TABLE IF NOT EXISTS "SelectContractStepEvent" (
  "id"        TEXT NOT NULL,
  "stepId"    TEXT NOT NULL,
  "done"      BOOLEAN NOT NULL,
  "actorId"   TEXT NOT NULL,
  -- Copia do nome no momento do clique: o historico tem de continuar legivel
  -- depois que a pessoa sai da empresa. Mesmo motivo de planNameSnapshot.
  "actorName" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SelectContractStepEvent_pkey" PRIMARY KEY ("id")
);

-- ON DELETE CASCADE: o evento so existe preso a uma etapa, e etapa apagada
-- (via contrato apagado) nao pode deixar historico orfao.
DO $$
BEGIN
  ALTER TABLE "SelectContractStepEvent"
    ADD CONSTRAINT "SelectContractStepEvent_stepId_fkey"
    FOREIGN KEY ("stepId") REFERENCES "SelectContractStep"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- A leitura e sempre "os eventos desta etapa, do mais novo ao mais velho".
CREATE INDEX IF NOT EXISTS "SelectContractStepEvent_stepId_createdAt_idx"
  ON "SelectContractStepEvent" ("stepId", "createdAt");

-- BACKFILL das etapas JA concluidas antes desta tabela existir.
--
-- Sem ele, uma etapa marcada ontem apareceria como "Concluida em 25/10" com o
-- historico vazio logo abaixo — que se le como defeito, nao como "o registro
-- comecou hoje". O evento reconstruido usa o proprio `doneAt` como instante,
-- que e exatamente quando o clique aconteceu.
--
-- So da para reconstruir o que marcou (`done = true`): desfazeres anteriores a
-- esta migration nao deixaram rastro nenhum e estao perdidos — nao ha de onde
-- inventa-los.
--
-- Id DERIVADO do id da etapa, nao sorteado: ha no maximo um evento de backfill
-- por etapa, entao a chave primaria sozinha ja impede a duplicata. Tambem
-- dispensa `gen_random_uuid()`, que depende da versao do Postgres.
-- Idempotente pelo NOT EXISTS: rodar duas vezes nao duplica.
INSERT INTO "SelectContractStepEvent" ("id", "stepId", "done", "actorId", "actorName", "createdAt")
SELECT
  'backfill-' || s."id",
  s."id",
  true,
  s."doneById",
  -- `doneById` nao tem FK: o usuario pode ja nao existir. O historico diz o
  -- que sabe em vez de sumir com a linha.
  COALESCE(u."name", 'Usuário removido'),
  s."doneAt"
FROM "SelectContractStep" s
LEFT JOIN "User" u ON u."id" = s."doneById"
WHERE s."doneAt" IS NOT NULL
  AND s."doneById" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "SelectContractStepEvent" e WHERE e."stepId" = s."id"
  );
