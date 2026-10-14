-- CreateEnum
CREATE TYPE "WholesaleBrand" AS ENUM ('OKEY', 'LOV_CLUB');

-- CreateEnum
CREATE TYPE "WholesaleLeadStatus" AS ENUM ('EM_ANALISE', 'APROVADO', 'REPROVADO', 'CUIDADO');

-- CreateEnum
CREATE TYPE "WholesaleServiceModel" AS ENUM ('LOJA_FISICA', 'LOJA_ONLINE', 'FISICA_E_ONLINE', 'OUTRO');

-- CreateEnum
CREATE TYPE "WholesaleFoundUs" AS ENUM ('INSTAGRAM', 'SITE', 'INDICACAO', 'OUTRO');

-- CreateEnum
CREATE TYPE "WholesaleInvestmentBand" AS ENUM ('ATE_3K', 'DE_3_A_5K', 'DE_5_A_10K', 'ACIMA_10K');

-- CreateEnum
CREATE TYPE "WholesaleStoreImageKind" AS ENUM ('ESPACO_FISICO', 'LOJA_ONLINE');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "referralCode" TEXT;

-- CreateTable
CREATE TABLE "WholesaleLead" (
    "id" TEXT NOT NULL,
    "brand" "WholesaleBrand" NOT NULL,
    "status" "WholesaleLeadStatus" NOT NULL DEFAULT 'EM_ANALISE',
    "sellerId" TEXT,
    "contactName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "story" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "serviceModel" "WholesaleServiceModel" NOT NULL,
    "serviceModelOther" TEXT,
    "instagram" TEXT NOT NULL,
    "instagramImagePath" TEXT NOT NULL,
    "storeImagePath" TEXT NOT NULL,
    "storeImageKind" "WholesaleStoreImageKind" NOT NULL,
    "marketTime" TEXT NOT NULL,
    "teamSize" TEXT NOT NULL,
    "brandsCarried" TEXT NOT NULL,
    "foundUs" "WholesaleFoundUs" NOT NULL,
    "foundUsOther" TEXT,
    "followTime" TEXT NOT NULL,
    "investmentBand" "WholesaleInvestmentBand" NOT NULL,
    "wantsVisit" BOOLEAN NOT NULL,
    "cnpj" TEXT NOT NULL,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "rejectionCode" TEXT,
    "cautionReason" TEXT,
    "assistantName" TEXT,
    "submittedIp" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WholesaleLead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WholesaleLeadEvent" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "fromStatus" "WholesaleLeadStatus" NOT NULL,
    "toStatus" "WholesaleLeadStatus" NOT NULL,
    "rejectionCode" TEXT,
    "note" TEXT,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WholesaleLeadEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WholesaleLead_brand_status_idx" ON "WholesaleLead"("brand", "status");

-- CreateIndex
CREATE INDEX "WholesaleLead_sellerId_status_idx" ON "WholesaleLead"("sellerId", "status");

-- CreateIndex
CREATE INDEX "WholesaleLead_cnpj_idx" ON "WholesaleLead"("cnpj");

-- CreateIndex
CREATE INDEX "WholesaleLead_phone_idx" ON "WholesaleLead"("phone");

-- CreateIndex
CREATE INDEX "WholesaleLeadEvent_leadId_createdAt_idx" ON "WholesaleLeadEvent"("leadId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "User_referralCode_key" ON "User"("referralCode");

-- AddForeignKey
ALTER TABLE "WholesaleLead" ADD CONSTRAINT "WholesaleLead_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WholesaleLead" ADD CONSTRAINT "WholesaleLead_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WholesaleLeadEvent" ADD CONSTRAINT "WholesaleLeadEvent_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "WholesaleLead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WholesaleLeadEvent" ADD CONSTRAINT "WholesaleLeadEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

