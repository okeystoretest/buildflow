-- CreateTable
CREATE TABLE "DriverPayment" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "pixKey" TEXT,
    "confirmedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DriverPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DriverPayment_orderId_key" ON "DriverPayment"("orderId");

-- CreateIndex
CREATE INDEX "DriverPayment_driverId_idx" ON "DriverPayment"("driverId");

-- AddForeignKey
ALTER TABLE "DriverPayment" ADD CONSTRAINT "DriverPayment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverPayment" ADD CONSTRAINT "DriverPayment_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
