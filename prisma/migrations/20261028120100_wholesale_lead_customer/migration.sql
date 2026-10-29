-- A CANDIDATURA PASSA A APONTAR PARA O CADASTRO DA LOJISTA — e o diario de
-- decisoes passa a aceitar evento sem autor.
--
-- 1. O VINCULO. `Customer` nao guarda CNPJ, e `WholesaleLead` nao guardava
--    cliente: nao havia nenhum caminho entre uma candidatura e um pedido, e
--    portanto nenhuma forma de dizer que a lojista comprou. Esta coluna e esse
--    caminho, e ela e preenchida na APROVACAO
--    (src/lib/wholesale-customer.ts).
--
--    NULA nas candidaturas nao aprovadas, e tambem nas aprovadas ANTES desta
--    migration: a aprovacao so passa a cadastrar a partir daqui, e criar o
--    cadastro retroativo inventaria cliente que ninguem atendeu. Essas
--    continuam em APROVADO e nunca viram COMPROU sozinhas — a Gestao pode
--    marcar a mao, que e o caminho previsto.
--
-- 2. O AUTOR DO EVENTO PASSA A ACEITAR NULO. A virada para COMPROU acontece
--    sozinha quando um pedido aparece ligado ao cadastro, e nesse momento nao
--    ha pessoa decidindo. Gravar o id de quem por acaso abriu a tela poria no
--    diario de auditoria uma decisao que aquela pessoa nao tomou — e o diario
--    existe exatamente para isso nao acontecer. NULO le-se "Sistema".
--
-- Aditiva. Nenhuma linha existente e alterada: DROP NOT NULL nao toca os
-- eventos ja gravados, que continuam todos com o seu autor.

ALTER TABLE "WholesaleLead" ADD COLUMN IF NOT EXISTS "customerId" TEXT;

-- ON DELETE SET NULL: apagar um cliente nao pode apagar nem travar a
-- candidatura. A candidatura e o registro de uma analise que aconteceu; o
-- cadastro e operacional. Mesmo criterio do resto do projeto, onde o historico
-- sobrevive ao cadastro que o originou.
ALTER TABLE "WholesaleLead"
  DROP CONSTRAINT IF EXISTS "WholesaleLead_customerId_fkey";
ALTER TABLE "WholesaleLead"
  ADD CONSTRAINT "WholesaleLead_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- A reconciliacao do COMPROU varre por (status, customerId) a cada leitura da
-- tela: sem indice, isso e uma varredura da tabela inteira por pageview.
CREATE INDEX IF NOT EXISTS "WholesaleLead_status_customerId_idx"
  ON "WholesaleLead" ("status", "customerId");

ALTER TABLE "WholesaleLeadEvent" ALTER COLUMN "actorId" DROP NOT NULL;
