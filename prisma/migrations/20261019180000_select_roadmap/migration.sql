-- ROADMAP DE ENTREGA DOS BENEFICIOS DO SELECT.
--
-- Duas coisas: a classificacao do beneficio no cadastro do plano (executavel
-- ou casual/continuo) e a regua de etapas de CADA contrato.
--
-- Aditiva e idempotente. Nada existente e alterado ou apagado.
--
-- SEM BACKFILL de propósito: em 19/10/2026 nao ha nenhum contrato Select em
-- producao. Contrato criado a partir daqui gera as etapas na propria adesao
-- (createSelectContract), na mesma transacao.

-- Default true: o beneficio comum e um entregavel com marco de conclusao, e
-- quem cadastra o plano desmarca a excecao ("suporte sob demanda"). Falso por
-- padrao faria todo plano nascer com roadmap so de etapas previas, parecendo
-- defeito.
ALTER TABLE "SelectPlanBenefit"
  ADD COLUMN IF NOT EXISTS "executable" BOOLEAN NOT NULL DEFAULT true;

-- `label` e COPIA do texto do beneficio, nao referencia a ele. updateSelectPlan
-- apaga e recria todos os SelectPlanBenefit do plano a cada salvamento, entao
-- um id de beneficio nao sobrevive a uma edicao: uma FK aqui deixaria o roadmap
-- de todo cliente daquele plano orfao na primeira correcao de virgula. E o
-- mesmo motivo de planNameSnapshot existir no contrato.
CREATE TABLE IF NOT EXISTS "SelectContractStep" (
  "id"         TEXT NOT NULL,
  "contractId" TEXT NOT NULL,
  "sortOrder"  INTEGER NOT NULL,
  "label"      TEXT NOT NULL,
  "doneAt"     TIMESTAMP(3),
  "doneById"   TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SelectContractStep_pkey" PRIMARY KEY ("id")
);

-- ON DELETE CASCADE: etapa so existe presa a um contrato, e contrato apagado
-- nao pode deixar regua orfa.
DO $$
BEGIN
  ALTER TABLE "SelectContractStep"
    ADD CONSTRAINT "SelectContractStep_contractId_fkey"
    FOREIGN KEY ("contractId") REFERENCES "SelectContract"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- UNIQUE, nao so indice: duas etapas na mesma posicao do mesmo contrato
-- tornariam ambigua a regra de "so conclui se a anterior esta concluida".
CREATE UNIQUE INDEX IF NOT EXISTS "SelectContractStep_contractId_sortOrder_key"
  ON "SelectContractStep" ("contractId", "sortOrder");

CREATE INDEX IF NOT EXISTS "SelectContractStep_contractId_sortOrder_idx"
  ON "SelectContractStep" ("contractId", "sortOrder");
