-- CreateEnum
CREATE TYPE "TableStatus" AS ENUM ('AVAILABLE', 'OCCUPIED', 'RESERVED', 'INACTIVE');

-- AlterTable
ALTER TABLE "Table" ADD COLUMN     "name" TEXT,
ADD COLUMN     "qrToken" TEXT,
ADD COLUMN     "status" "TableStatus" NOT NULL DEFAULT 'AVAILABLE';

-- CreateIndex
CREATE INDEX "Table_qrToken_idx" ON "Table"("qrToken");
