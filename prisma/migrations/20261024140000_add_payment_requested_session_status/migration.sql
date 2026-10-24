-- AlterEnum
ALTER TYPE "DiningSessionStatus" ADD VALUE 'PAYMENT_REQUESTED';

-- AlterTable
ALTER TABLE "DiningSession" ADD COLUMN "billRequestedAt" TIMESTAMP(3);
