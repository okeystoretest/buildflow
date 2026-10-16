-- SELECT: venda de servico (adesao a plano) + acompanhamento no Financeiro.
--
-- Cinco tabelas novas e UMA coluna nova em "Order". Nada existente e alterado
-- ou apagado. Idempotente: pode rodar duas vezes sem erro.
--
-- A coluna "Order"."financeApprovedAt" recebe backfill a partir do
-- OrderStatusHistory, para que o minimo de compras do Select enxergue tambem
-- os pedidos aprovados antes desta migration.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE "SelectContractStatus" AS ENUM ('ATIVO', 'CANCELADO', 'ENCERRADO');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "SelectInstallmentStatus" AS ENUM ('PENDENTE', 'PAGA', 'CANCELADA');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- SelectPlan / SelectPlanBenefit
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "SelectPlan" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "validityMonths" INTEGER NOT NULL DEFAULT 12,
    "monthlyAmount" DECIMAL(10,2),
    "minMonthlyPurchase" DECIMAL(10,2),
    "editableValues" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SelectPlan_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "SelectPlan_active_sortOrder_idx" ON "SelectPlan"("active", "sortOrder");

CREATE TABLE IF NOT EXISTS "SelectPlanBenefit" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "text" TEXT NOT NULL,

    CONSTRAINT "SelectPlanBenefit_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "SelectPlanBenefit_planId_sortOrder_idx" ON "SelectPlanBenefit"("planId", "sortOrder");

ALTER TABLE "SelectPlanBenefit" DROP CONSTRAINT IF EXISTS "SelectPlanBenefit_planId_fkey";
ALTER TABLE "SelectPlanBenefit"
  ADD CONSTRAINT "SelectPlanBenefit_planId_fkey"
  FOREIGN KEY ("planId") REFERENCES "SelectPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- SelectContract
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "SelectContract" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "responsibleId" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "closedAt" DATE,
    "replacedById" TEXT,
    "validityMonths" INTEGER NOT NULL,
    "monthlyAmount" DECIMAL(10,2) NOT NULL,
    "totalAmount" DECIMAL(10,2) NOT NULL,
    "minMonthlyPurchase" DECIMAL(10,2) NOT NULL,
    "planNameSnapshot" TEXT NOT NULL,
    "status" "SelectContractStatus" NOT NULL DEFAULT 'ATIVO',
    "canceledAt" TIMESTAMP(3),
    "canceledById" TEXT,
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedById" TEXT,

    CONSTRAINT "SelectContract_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SelectContract_replacedById_key" ON "SelectContract"("replacedById");
CREATE INDEX IF NOT EXISTS "SelectContract_customerId_idx" ON "SelectContract"("customerId");
CREATE INDEX IF NOT EXISTS "SelectContract_status_idx" ON "SelectContract"("status");
CREATE INDEX IF NOT EXISTS "SelectContract_startDate_idx" ON "SelectContract"("startDate");
CREATE INDEX IF NOT EXISTS "SelectContract_responsibleId_idx" ON "SelectContract"("responsibleId");

ALTER TABLE "SelectContract" DROP CONSTRAINT IF EXISTS "SelectContract_customerId_fkey";
ALTER TABLE "SelectContract"
  ADD CONSTRAINT "SelectContract_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SelectContract" DROP CONSTRAINT IF EXISTS "SelectContract_planId_fkey";
ALTER TABLE "SelectContract"
  ADD CONSTRAINT "SelectContract_planId_fkey"
  FOREIGN KEY ("planId") REFERENCES "SelectPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SelectContract" DROP CONSTRAINT IF EXISTS "SelectContract_responsibleId_fkey";
ALTER TABLE "SelectContract"
  ADD CONSTRAINT "SelectContract_responsibleId_fkey"
  FOREIGN KEY ("responsibleId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SelectContract" DROP CONSTRAINT IF EXISTS "SelectContract_replacedById_fkey";
ALTER TABLE "SelectContract"
  ADD CONSTRAINT "SelectContract_replacedById_fkey"
  FOREIGN KEY ("replacedById") REFERENCES "SelectContract"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- SelectInstallment
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "SelectInstallment" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "dueDate" DATE NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "paidAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "status" "SelectInstallmentStatus" NOT NULL DEFAULT 'PENDENTE',
    "settledAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedById" TEXT,

    CONSTRAINT "SelectInstallment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SelectInstallment_contractId_number_key" ON "SelectInstallment"("contractId", "number");
CREATE INDEX IF NOT EXISTS "SelectInstallment_status_dueDate_idx" ON "SelectInstallment"("status", "dueDate");
CREATE INDEX IF NOT EXISTS "SelectInstallment_dueDate_idx" ON "SelectInstallment"("dueDate");

ALTER TABLE "SelectInstallment" DROP CONSTRAINT IF EXISTS "SelectInstallment_contractId_fkey";
ALTER TABLE "SelectInstallment"
  ADD CONSTRAINT "SelectInstallment_contractId_fkey"
  FOREIGN KEY ("contractId") REFERENCES "SelectContract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- SelectPayment
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "SelectPayment" (
    "id" TEXT NOT NULL,
    "installmentId" TEXT NOT NULL,
    "paidAt" DATE NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "paymentMethodId" TEXT,
    "bankId" TEXT,
    "cnpjId" TEXT,
    "proofPath" TEXT,
    "note" TEXT,
    "reversedAt" TIMESTAMP(3),
    "reversedById" TEXT,
    "reversalReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "SelectPayment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SelectPayment_installmentId_idx" ON "SelectPayment"("installmentId");
CREATE INDEX IF NOT EXISTS "SelectPayment_paidAt_idx" ON "SelectPayment"("paidAt");

ALTER TABLE "SelectPayment" DROP CONSTRAINT IF EXISTS "SelectPayment_installmentId_fkey";
ALTER TABLE "SelectPayment"
  ADD CONSTRAINT "SelectPayment_installmentId_fkey"
  FOREIGN KEY ("installmentId") REFERENCES "SelectInstallment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SelectPayment" DROP CONSTRAINT IF EXISTS "SelectPayment_paymentMethodId_fkey";
ALTER TABLE "SelectPayment"
  ADD CONSTRAINT "SelectPayment_paymentMethodId_fkey"
  FOREIGN KEY ("paymentMethodId") REFERENCES "PaymentMethod"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SelectPayment" DROP CONSTRAINT IF EXISTS "SelectPayment_bankId_fkey";
ALTER TABLE "SelectPayment"
  ADD CONSTRAINT "SelectPayment_bankId_fkey"
  FOREIGN KEY ("bankId") REFERENCES "Bank"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SelectPayment" DROP CONSTRAINT IF EXISTS "SelectPayment_cnpjId_fkey";
ALTER TABLE "SelectPayment"
  ADD CONSTRAINT "SelectPayment_cnpjId_fkey"
  FOREIGN KEY ("cnpjId") REFERENCES "Cnpj"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Order.financeApprovedAt + backfill
-- ---------------------------------------------------------------------------
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "financeApprovedAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "Order_financeApprovedAt_idx" ON "Order"("financeApprovedAt");

-- Backfill: a PRIMEIRA saida de EM_ANALISE para um status de aprovacao.
-- AGUARDANDO_IMPRESSAO = fluxo padrao; PAGO = fluxo simplificado.
-- Pedidos sem essa entrada no historico (nunca aprovados) ficam NULL.
UPDATE "Order" o
SET "financeApprovedAt" = h."firstApproval"
FROM (
  SELECT "orderId", MIN("createdAt") AS "firstApproval"
  FROM "OrderStatusHistory"
  WHERE "status" IN ('AGUARDANDO_IMPRESSAO', 'PAGO')
  GROUP BY "orderId"
) h
WHERE o."id" = h."orderId" AND o."financeApprovedAt" IS NULL;
