-- CreateEnum
CREATE TYPE "WeeklyHealth" AS ENUM ('NO_RITMO', 'ATENCAO', 'TRAVADO');

-- CreateEnum
CREATE TYPE "MarketingTaskStatus" AS ENUM ('BACKLOG', 'A_FAZER', 'EM_ANDAMENTO', 'REVISAO', 'PUBLICADO');

-- CreateEnum
CREATE TYPE "MarketingTaskCategory" AS ENUM ('CONTEUDO', 'PUBLICACAO', 'COMUNIDADE', 'RELATORIO', 'PROCESSO');

-- CreateEnum
CREATE TYPE "MarketingTaskPriority" AS ENUM ('ALTA', 'MEDIA', 'BAIXA');

-- DropForeignKey
ALTER TABLE "WholesaleLeadEvent" DROP CONSTRAINT "WholesaleLeadEvent_actorId_fkey";

-- AlterTable
ALTER TABLE "RateLimitHit" ALTER COLUMN "at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "SelectContract" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "SelectInstallment" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "SelectPlan" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "WeeklyReport" (
    "id" TEXT NOT NULL,
    "weekNumber" INTEGER NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "highlight" TEXT,
    "learning" TEXT,
    "nextPriority" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeeklyReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklyReportDelivery" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "day" TEXT NOT NULL,
    "block" TEXT NOT NULL,
    "expected" TEXT NOT NULL,
    "health" "WeeklyHealth",
    "evidence" TEXT,
    "note" TEXT,

    CONSTRAINT "WeeklyReportDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklyReportMetric" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "channel" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "previous" DOUBLE PRECISION,
    "current" DOUBLE PRECISION,
    "target" TEXT,
    "health" "WeeklyHealth",
    "reading" TEXT,

    CONSTRAINT "WeeklyReportMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklyReportOkr" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "objective" TEXT NOT NULL,
    "keyResult" TEXT NOT NULL,
    "measure" TEXT NOT NULL,
    "goalLabel" TEXT NOT NULL,
    "goalValue" DOUBLE PRECISION,
    "achieved" DOUBLE PRECISION,
    "monthlyRead" BOOLEAN NOT NULL DEFAULT false,
    "health" "WeeklyHealth",
    "nextStep" TEXT,

    CONSTRAINT "WeeklyReportOkr_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklyReportBlocker" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "impact" TEXT,
    "needs" TEXT,
    "dueDate" DATE,
    "health" "WeeklyHealth",
    "resolution" TEXT,

    CONSTRAINT "WeeklyReportBlocker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklyReportAgendaItem" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "block" TEXT NOT NULL,
    "minutes" INTEGER NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT,

    CONSTRAINT "WeeklyReportAgendaItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingTask" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" "MarketingTaskCategory" NOT NULL,
    "priority" "MarketingTaskPriority" NOT NULL DEFAULT 'MEDIA',
    "assigneeId" TEXT,
    "enteredAt" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" DATE,
    "status" "MarketingTaskStatus" NOT NULL DEFAULT 'BACKLOG',
    "evidence" TEXT,
    "note" TEXT,
    "doneAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketingTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WeeklyReport_periodStart_idx" ON "WeeklyReport"("periodStart");

-- CreateIndex
CREATE INDEX "WeeklyReport_createdById_idx" ON "WeeklyReport"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyReport_periodStart_key" ON "WeeklyReport"("periodStart");

-- CreateIndex
CREATE INDEX "WeeklyReportDelivery_reportId_idx" ON "WeeklyReportDelivery"("reportId");

-- CreateIndex
CREATE INDEX "WeeklyReportMetric_reportId_idx" ON "WeeklyReportMetric"("reportId");

-- CreateIndex
CREATE INDEX "WeeklyReportOkr_reportId_idx" ON "WeeklyReportOkr"("reportId");

-- CreateIndex
CREATE INDEX "WeeklyReportBlocker_reportId_idx" ON "WeeklyReportBlocker"("reportId");

-- CreateIndex
CREATE INDEX "WeeklyReportAgendaItem_reportId_idx" ON "WeeklyReportAgendaItem"("reportId");

-- CreateIndex
CREATE UNIQUE INDEX "MarketingTask_code_key" ON "MarketingTask"("code");

-- CreateIndex
CREATE INDEX "MarketingTask_status_idx" ON "MarketingTask"("status");

-- CreateIndex
CREATE INDEX "MarketingTask_assigneeId_idx" ON "MarketingTask"("assigneeId");

-- CreateIndex
CREATE INDEX "WholesaleLead_rodizioIndice_idx" ON "WholesaleLead"("rodizioIndice");

-- AddForeignKey
ALTER TABLE "WholesaleLeadEvent" ADD CONSTRAINT "WholesaleLeadEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyReport" ADD CONSTRAINT "WeeklyReport_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyReportDelivery" ADD CONSTRAINT "WeeklyReportDelivery_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "WeeklyReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyReportMetric" ADD CONSTRAINT "WeeklyReportMetric_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "WeeklyReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyReportOkr" ADD CONSTRAINT "WeeklyReportOkr_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "WeeklyReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyReportBlocker" ADD CONSTRAINT "WeeklyReportBlocker_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "WeeklyReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyReportAgendaItem" ADD CONSTRAINT "WeeklyReportAgendaItem_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "WeeklyReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingTask" ADD CONSTRAINT "MarketingTask_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
