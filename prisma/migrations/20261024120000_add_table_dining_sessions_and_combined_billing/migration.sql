-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "DiningSessionStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'CANCELLED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "OrderPaymentStatus" AS ENUM ('PENDING', 'PAID', 'CANCELLED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- AlterTable Order
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "diningSessionId" TEXT;

-- CreateTable DiningSession
CREATE TABLE IF NOT EXISTS "DiningSession" (
    "id" TEXT NOT NULL,
    "sessionCode" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "tableId" TEXT,
    "status" "DiningSessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "paymentStatus" "OrderPaymentStatus" NOT NULL DEFAULT 'PENDING',
    "paymentMethod" TEXT,
    "paidAt" TIMESTAMP(3),
    "confirmedById" TEXT,
    "receiptNumber" TEXT,
    "subtotal" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "discountAmount" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "taxAmount" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "totalAmount" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiningSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "DiningSession_sessionCode_key" ON "DiningSession"("sessionCode");
CREATE UNIQUE INDEX IF NOT EXISTS "DiningSession_receiptNumber_key" ON "DiningSession"("receiptNumber");
CREATE INDEX IF NOT EXISTS "DiningSession_restaurantId_tableId_status_idx" ON "DiningSession"("restaurantId", "tableId", "status");
CREATE INDEX IF NOT EXISTS "DiningSession_tableId_status_idx" ON "DiningSession"("tableId", "status");
CREATE INDEX IF NOT EXISTS "DiningSession_paymentStatus_idx" ON "DiningSession"("paymentStatus");
CREATE INDEX IF NOT EXISTS "Order_diningSessionId_idx" ON "Order"("diningSessionId");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "Order" ADD CONSTRAINT "Order_diningSessionId_fkey" FOREIGN KEY ("diningSessionId") REFERENCES "DiningSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "DiningSession" ADD CONSTRAINT "DiningSession_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "DiningSession" ADD CONSTRAINT "DiningSession_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "Table"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
