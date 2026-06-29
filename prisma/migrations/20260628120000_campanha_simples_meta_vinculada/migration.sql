-- Campanha vira cadastro simples (so nome) e Meta passa a poder vincular a uma Campanha.

-- DropForeignKey (CampaignMember sera removida)
ALTER TABLE "CampaignMember" DROP CONSTRAINT IF EXISTS "CampaignMember_campaignId_fkey";
ALTER TABLE "CampaignMember" DROP CONSTRAINT IF EXISTS "CampaignMember_userId_fkey";

-- DropTable
DROP TABLE IF EXISTS "CampaignMember";

-- Campaign: remove a meta por volume de itens
ALTER TABLE "Campaign" DROP COLUMN IF EXISTS "goalVolume";

-- SalesGoal: vinculo opcional a campanha
ALTER TABLE "SalesGoal" ADD COLUMN "campaignId" TEXT;

-- CreateIndex
CREATE INDEX "SalesGoal_campaignId_idx" ON "SalesGoal"("campaignId");

-- AddForeignKey
ALTER TABLE "SalesGoal" ADD CONSTRAINT "SalesGoal_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
