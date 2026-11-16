-- ACOMPANHAMENTO GERENCIAL: loja principal, meta de loja e os formularios de
-- acompanhamento (pedido de 13/11/2026).
--
-- Tres mudancas independentes, nesta ordem porque a segunda referencia a
-- primeira so por "OriginStore", que ja existia.

-- ---------------------------------------------------------------------------
-- 1. LOJA DE ORIGEM PRINCIPAL
--
-- `User.originStores` e uma relacao N-N: diz QUAIS lojas a pessoa opera, nunca
-- em que ordem. A apuracao da meta por loja precisa de UMA loja por vendedora
-- ("apenas a primeira loja de origem"), e ate aqui as consultas ordenavam por
-- nome — "primeira" significava "primeira no alfabeto", que atribuiria o
-- faturamento a loja errada sem nada quebrar para avisar.
--
-- Nasce ANULAVEL: quem nao vende (Financeiro, Motorista) nao tem loja, e o
-- backfill abaixo so consegue decidir por quem tem exatamente UMA.
ALTER TABLE "User" ADD COLUMN "primaryOriginStoreId" TEXT;

ALTER TABLE "User"
  ADD CONSTRAINT "User_primaryOriginStoreId_fkey"
  FOREIGN KEY ("primaryOriginStoreId") REFERENCES "OriginStore"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "User_primaryOriginStoreId_idx" ON "User"("primaryOriginStoreId");

-- BACKFILL: quem tem UMA loja de origem ja tem a principal decidida — e ela.
-- Quem tem DUAS fica nulo de proposito: escolher por essa pessoa seria um
-- palpite que manda o faturamento dela para a loja errada em silencio. A tela
-- de Metas conta quantas estao assim e manda para Usuarios.
--
-- Em "_UserOriginStores", "A" e OriginStore.id e "B" e User.id (ver a migracao
-- 20260728030000_origin_stores).
UPDATE "User" u
SET "primaryOriginStoreId" = j."A"
FROM "_UserOriginStores" j
WHERE j."B" = u."id"
  AND (SELECT count(*) FROM "_UserOriginStores" k WHERE k."B" = u."id") = 1;

-- ---------------------------------------------------------------------------
-- 2. META DE FATURAMENTO DA LOJA
--
-- Independente das metas individuais (decisao do dono): a Gestao digita as
-- duas, e o painel mostra a diferenca. A unicidade por (loja, mes, ano) e o que
-- permite REGRAVAR o valor quando ele foi digitado errado, em vez de empilhar
-- duas metas da mesma loja no mesmo mes e dobrar o alvo.
CREATE TABLE "StoreGoal" (
    "id"            TEXT NOT NULL,
    "originStoreId" TEXT NOT NULL,
    "amount"        DECIMAL(12,2) NOT NULL,
    "month"         INTEGER NOT NULL,
    "year"          INTEGER NOT NULL,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreGoal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StoreGoal_originStoreId_month_year_key" ON "StoreGoal"("originStoreId", "month", "year");
CREATE INDEX "StoreGoal_month_year_idx" ON "StoreGoal"("month", "year");

ALTER TABLE "StoreGoal"
  ADD CONSTRAINT "StoreGoal_originStoreId_fkey"
  FOREIGN KEY ("originStoreId") REFERENCES "OriginStore"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 3. FORMULARIOS DE ACOMPANHAMENTO (One-on-One e Quinzenal)
--
-- Uma tabela para os dois: cinco dos dez campos de cada formulario sao o mesmo
-- campo com outro nome. Os exclusivos de um tipo sao anulaveis, e a action
-- exige os do tipo gravado.
CREATE TYPE "FollowUpKind" AS ENUM ('ONE_ON_ONE', 'QUINZENAL');
CREATE TYPE "FollowUpStatus" AS ENUM ('NAO_INICIADO', 'EM_ANDAMENTO', 'PRECISA_REVISAO', 'EM_ESPERA', 'ENTREGUE');

CREATE TABLE "FollowUp" (
    "id"               TEXT NOT NULL,
    "kind"             "FollowUpKind" NOT NULL,
    "collaboratorId"   TEXT NOT NULL,
    "managerId"        TEXT NOT NULL,
    "heldOn"           TIMESTAMP(3) NOT NULL,
    "strengths"        TEXT NOT NULL,
    "improvement"      TEXT NOT NULL,
    "collaboratorView" TEXT NOT NULL,
    "actionPlan"       TEXT NOT NULL,
    "notes"            TEXT,
    "performance"      TEXT,
    "status"           "FollowUpStatus",
    "topic"            TEXT,
    "support"          TEXT,
    "reviewOn"         TIMESTAMP(3),
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FollowUp_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FollowUp_collaboratorId_heldOn_idx" ON "FollowUp"("collaboratorId", "heldOn");
CREATE INDEX "FollowUp_kind_heldOn_idx" ON "FollowUp"("kind", "heldOn");

ALTER TABLE "FollowUp"
  ADD CONSTRAINT "FollowUp_collaboratorId_fkey"
  FOREIGN KEY ("collaboratorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RESTRICT no gestor: apagar quem conduziu a conversa nao pode apagar o
-- historico do colaborador acompanhado.
ALTER TABLE "FollowUp"
  ADD CONSTRAINT "FollowUp_managerId_fkey"
  FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
