-- "Voce possui disponibilidade para uma apresentacao?" na LP de atacado.
--
-- As duas colunas nascem ANULAVEIS, e nao com DEFAULT false/now(): toda
-- candidatura ja gravada chegou antes da pergunta existir. `false` leria como
-- "a lojista disse que nao tem disponibilidade", que e afirmar a analista algo
-- que ninguem respondeu -- o mesmo raciocinio que tornou `wantsVisit` anulavel
-- na migracao 20261021120000_wholesale_lead_import.
--
-- Aditiva e sem reescrita de linha: o Postgres adiciona coluna anulavel sem
-- default apenas no catalogo, entao nao ha travamento de tabela a temer.
ALTER TABLE "WholesaleLead" ADD COLUMN "wantsPresentation" BOOLEAN;
ALTER TABLE "WholesaleLead" ADD COLUMN "presentationAt"    TIMESTAMP(3);
