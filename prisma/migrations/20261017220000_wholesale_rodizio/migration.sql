-- RODIZIO DAS CANDIDATURAS QUE CHEGAM PELO LINK GERAL.
--
-- Quem chega por /atacado/okey?r=<codigo> tem dona fixa: a vendedora que
-- mandou o link. Quem chega SEM o codigo entra num rodizio sequencial, e passa
-- para a vendedora seguinte a cada dia em que ninguem avalia.
--
-- Aditiva e idempotente. Nada existente e alterado ou apagado.

-- A SEQUENCE e o que elimina a corrida. O caminho ingenuo — ler "qual foi a
-- ultima", somar um, gravar — perde quando duas lojistas enviam no mesmo
-- segundo: as duas leem o mesmo numero e caem na mesma vendedora. Com formulario
-- publico isso nao e hipotese remota, e o que acontece quando a vendedora joga o
-- link num grupo de WhatsApp. `nextval()` e atomico por natureza: nao existe
-- ler-depois-escrever, nao precisa de tabela de contador, e nao segura linha
-- nenhuma. E o mesmo erro que assignLeadSeller ja teve e que virou updateMany
-- condicionado em 16/10.
CREATE SEQUENCE IF NOT EXISTS "wholesale_rodizio_seq";

-- UMA coluna que carrega DUAS informacoes: se a candidatura roda, e de onde ela
-- parte. NULL = veio pelo link de uma vendedora e tem dona fixa. Numero = veio
-- pelo link geral, e e a posicao dela na fila.
ALTER TABLE "WholesaleLead" ADD COLUMN IF NOT EXISTS "rodizioIndice" INTEGER;

-- Indice PARCIAL: a reconciliacao na leitura so procura quem esta no rodizio,
-- e com o tempo a maioria das candidaturas tera NULL aqui. Indexar so o que e
-- consultado mantem o indice pequeno enquanto a base cresce.
CREATE INDEX IF NOT EXISTS "WholesaleLead_rodizio_idx"
  ON "WholesaleLead" ("rodizioIndice")
  WHERE "rodizioIndice" IS NOT NULL;

-- BACKFILL. As candidaturas sem dona que ja existem vinham da fila da Gestao,
-- que era distribuida a mao — e a atribuicao manual sai nesta mesma entrega.
-- Sem este backfill elas ficariam sem nenhum caminho de atribuicao: nem rodizio,
-- nem Gestao. Decidida nao entra, porque candidatura avaliada nao roda mais.
UPDATE "WholesaleLead"
   SET "rodizioIndice" = nextval('wholesale_rodizio_seq')
 WHERE "sellerId" IS NULL
   AND "decidedAt" IS NULL
   AND "rodizioIndice" IS NULL;
