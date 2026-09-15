-- CreateEnum
CREATE TYPE "TransportStatus" AS ENUM ('ABERTO', 'ATRIBUIDO', 'EM_ROTA', 'CONCLUIDO', 'CANCELADO');

-- DropForeignKey
ALTER TABLE "Order" DROP CONSTRAINT "Order_paymentMethodId_fkey";

-- DropIndex
DROP INDEX "Order_bankId_idx";

-- CreateTable
CREATE TABLE "TransportRequest" (
    "id" TEXT NOT NULL,
    "connectId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" "TransportStatus" NOT NULL DEFAULT 'ABERTO',
    "requesterConnectId" TEXT NOT NULL,
    "requesterName" TEXT NOT NULL,
    "requesterSector" TEXT,
    "contact" TEXT,
    "serviceType" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "originUnit" TEXT,
    "originStreet" TEXT,
    "originNumber" TEXT,
    "originDistrict" TEXT,
    "destStreet" TEXT NOT NULL,
    "destNumber" TEXT,
    "destDistrict" TEXT,
    "originLat" DOUBLE PRECISION,
    "originLng" DOUBLE PRECISION,
    "destLat" DOUBLE PRECISION,
    "destLng" DOUBLE PRECISION,
    "driverId" TEXT,
    "assignedById" TEXT,
    "assignedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "distanceKm" DOUBLE PRECISION,
    "proofPath" TEXT,
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransportRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportImage" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TransportImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportPosition" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "heading" DOUBLE PRECISION,
    "speed" DOUBLE PRECISION,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransportPosition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportHistory" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "actorName" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransportHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TransportRequest_connectId_key" ON "TransportRequest"("connectId");

-- CreateIndex
CREATE INDEX "TransportRequest_status_idx" ON "TransportRequest"("status");

-- CreateIndex
CREATE INDEX "TransportRequest_driverId_idx" ON "TransportRequest"("driverId");

-- CreateIndex
CREATE INDEX "TransportRequest_createdAt_idx" ON "TransportRequest"("createdAt");

-- CreateIndex
CREATE INDEX "TransportImage_requestId_order_idx" ON "TransportImage"("requestId", "order");

-- CreateIndex
CREATE INDEX "TransportPosition_requestId_recordedAt_idx" ON "TransportPosition"("requestId", "recordedAt");

-- CreateIndex
CREATE INDEX "TransportHistory_requestId_createdAt_idx" ON "TransportHistory"("requestId", "createdAt");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_paymentMethodId_fkey" FOREIGN KEY ("paymentMethodId") REFERENCES "PaymentMethod"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportRequest" ADD CONSTRAINT "TransportRequest_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportImage" ADD CONSTRAINT "TransportImage_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "TransportRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportPosition" ADD CONSTRAINT "TransportPosition_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "TransportRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportHistory" ADD CONSTRAINT "TransportHistory_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "TransportRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
