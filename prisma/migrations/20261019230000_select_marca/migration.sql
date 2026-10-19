-- MARCA NA VENDA DO SELECT, E A CAMPANHA DE SELECT POR MARCA.
--
-- A venda de um Select passa a dizer de qual marca ela e (OKEY ou LOV_CLUB), e
-- a campanha de Select passa a declarar a marca que acompanha. E assim que a
-- venda encontra a campanha.
--
-- Substitui o reconhecimento por NOME que estava em rank-data.ts: renomear a
-- campanha "Select" no cadastro deixava de atribuir as vendas, sem erro nenhum.
--
-- Aditiva e idempotente. Nada existente e alterado ou apagado.

ALTER TABLE "SelectContract"
  ADD COLUMN IF NOT EXISTS "brand" "WholesaleBrand";

ALTER TABLE "Campaign"
  ADD COLUMN IF NOT EXISTS "selectBrand" "WholesaleBrand";

-- UNIQUE parcial por natureza: o Postgres permite varios NULL num indice
-- unico, entao campanha comum (selectBrand NULL) nao e limitada, e existe no
-- maximo UMA campanha de Select por marca. Duas dividiriam a atribuicao sem
-- criterio — a venda cairia na primeira que a consulta devolvesse.
CREATE UNIQUE INDEX IF NOT EXISTS "Campaign_selectBrand_key"
  ON "Campaign" ("selectBrand");
