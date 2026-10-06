-- CreateEnum
CREATE TYPE "SubscriptionPlan" AS ENUM ('SMALL', 'MEDIUM', 'LARGE');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'SUSPENDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('UPI', 'BANK_TRANSFER');

-- CreateEnum
CREATE TYPE "PaymentRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "plan" "SubscriptionPlan" NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "tableLimit" INTEGER NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endDate" TIMESTAMP(3) NOT NULL,
    "lastPaymentRequestId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionPaymentRequest" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "plan" "SubscriptionPlan" NOT NULL,
    "tableCount" INTEGER NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "utrReference" TEXT NOT NULL,
    "proofUrl" TEXT,
    "notes" TEXT,
    "status" "PaymentRequestStatus" NOT NULL DEFAULT 'PENDING',
    "adminNotes" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionPaymentRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemPaymentConfig" (
    "id" TEXT NOT NULL,
    "upiId" TEXT NOT NULL DEFAULT 'qrserve@upi',
    "payeeName" TEXT NOT NULL DEFAULT 'QRServe Platform',
    "bankName" TEXT NOT NULL DEFAULT 'HDFC Bank',
    "accountNumber" TEXT NOT NULL DEFAULT '50200012345678',
    "ifscCode" TEXT NOT NULL DEFAULT 'HDFC0001234',
    "accountType" TEXT NOT NULL DEFAULT 'Current Account',
    "instructions" TEXT DEFAULT 'Please mention your Restaurant Name or Slug in the payment remarks/notes. Enter the 12-digit UTR/Transaction Reference number after completing payment.',
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SystemPaymentConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_restaurantId_key" ON "Subscription"("restaurantId");

-- CreateIndex
CREATE INDEX "Subscription_restaurantId_idx" ON "Subscription"("restaurantId");

-- CreateIndex
CREATE INDEX "Subscription_status_endDate_idx" ON "Subscription"("status", "endDate");

-- CreateIndex
CREATE INDEX "SubscriptionPaymentRequest_restaurantId_idx" ON "SubscriptionPaymentRequest"("restaurantId");

-- CreateIndex
CREATE INDEX "SubscriptionPaymentRequest_status_idx" ON "SubscriptionPaymentRequest"("status");

-- CreateIndex
CREATE INDEX "SubscriptionPaymentRequest_utrReference_idx" ON "SubscriptionPaymentRequest"("utrReference");

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionPaymentRequest" ADD CONSTRAINT "SubscriptionPaymentRequest_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionPaymentRequest" ADD CONSTRAINT "SubscriptionPaymentRequest_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionPaymentRequest" ADD CONSTRAINT "SubscriptionPaymentRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
