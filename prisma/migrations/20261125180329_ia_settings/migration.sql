-- CreateTable
CREATE TABLE "AiSettings" (
    "id" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "instruction" TEXT NOT NULL,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiSettings_updatedById_idx" ON "AiSettings"("updatedById");

-- AddForeignKey
ALTER TABLE "AiSettings" ADD CONSTRAINT "AiSettings_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
