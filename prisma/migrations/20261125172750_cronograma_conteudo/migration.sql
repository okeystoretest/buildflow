-- CreateEnum
CREATE TYPE "ContentFunnel" AS ENUM ('TOFU', 'MOFU', 'BOFU');

-- CreateEnum
CREATE TYPE "ContentFormat" AS ENUM ('REEL', 'STORY', 'FEED', 'CARROSSEL', 'LIVE', 'LANCAMENTO', 'OUTRO');

-- CreateEnum
CREATE TYPE "ContentStatus" AS ENUM ('IDEIA', 'EM_PRODUCAO', 'AGENDADO', 'PUBLICADO');

-- CreateEnum
CREATE TYPE "ContentPlatform" AS ENUM ('INSTAGRAM', 'TIKTOK', 'YOUTUBE');

-- CreateEnum
CREATE TYPE "ContentBrand" AS ENUM ('OKEY', 'LOV_CLUB');

-- CreateTable
CREATE TABLE "ContentPost" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "funnel" "ContentFunnel" NOT NULL,
    "formats" "ContentFormat"[] DEFAULT ARRAY[]::"ContentFormat"[],
    "status" "ContentStatus" NOT NULL DEFAULT 'IDEIA',
    "brand" "ContentBrand",
    "platforms" "ContentPlatform"[] DEFAULT ARRAY[]::"ContentPlatform"[],
    "formatOther" TEXT,
    "lineUp" INTEGER,
    "notes" TEXT,
    "ownerId" TEXT,
    "createdById" TEXT,
    "script" TEXT,
    "scriptUpdatedAt" TIMESTAMP(3),
    "scriptById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentPost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContentPost_scheduledAt_idx" ON "ContentPost"("scheduledAt");

-- CreateIndex
CREATE INDEX "ContentPost_ownerId_idx" ON "ContentPost"("ownerId");

-- CreateIndex
CREATE INDEX "ContentPost_createdById_idx" ON "ContentPost"("createdById");

-- CreateIndex
CREATE INDEX "ContentPost_scriptById_idx" ON "ContentPost"("scriptById");

-- AddForeignKey
ALTER TABLE "ContentPost" ADD CONSTRAINT "ContentPost_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentPost" ADD CONSTRAINT "ContentPost_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentPost" ADD CONSTRAINT "ContentPost_scriptById_fkey" FOREIGN KEY ("scriptById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
