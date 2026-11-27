-- AlterTable
ALTER TABLE "FollowUp" ADD COLUMN     "timerStartedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "FollowUpMovement" (
    "id" TEXT NOT NULL,
    "followUpId" TEXT NOT NULL,
    "fromStatus" "FollowUpStatus",
    "toStatus" "FollowUpStatus" NOT NULL,
    "elapsedMs" INTEGER,
    "changedById" TEXT NOT NULL,
    "changedByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FollowUpMovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FollowUpMovement_followUpId_createdAt_idx" ON "FollowUpMovement"("followUpId", "createdAt");

-- CreateIndex
CREATE INDEX "FollowUpMovement_createdAt_idx" ON "FollowUpMovement"("createdAt");

-- AddForeignKey
ALTER TABLE "FollowUpMovement" ADD CONSTRAINT "FollowUpMovement_followUpId_fkey" FOREIGN KEY ("followUpId") REFERENCES "FollowUp"("id") ON DELETE CASCADE ON UPDATE CASCADE;
