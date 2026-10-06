-- Migration: 20261005140000_add_custom_subscription_pricing
-- Adds tenant-specific custom subscription pricing, billing periods, next billing dates, and payment statuses

-- 1. Create BillingPeriod enum
DO $$ BEGIN
  CREATE TYPE "BillingPeriod" AS ENUM ('MONTHLY', 'YEARLY');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 2. Create SubscriptionPaymentStatus enum
DO $$ BEGIN
  CREATE TYPE "SubscriptionPaymentStatus" AS ENUM ('PENDING', 'PAID', 'OVERDUE');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 3. Extend Subscription table with custom pricing fields
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "billingPeriod" "BillingPeriod" NOT NULL DEFAULT 'MONTHLY';
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "currency" TEXT NOT NULL DEFAULT 'INR';
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "customMonthlyPrice" DECIMAL(10,2) NOT NULL DEFAULT 499.00;
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "customYearlyPrice" DECIMAL(10,2) NOT NULL DEFAULT 4990.00;
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "nextBillingDate" TIMESTAMP(3);
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "paymentStatus" "SubscriptionPaymentStatus" NOT NULL DEFAULT 'PAID';
ALTER TABLE "Subscription" ALTER COLUMN "plan" SET DEFAULT 'SMALL';
ALTER TABLE "Subscription" ALTER COLUMN "tableLimit" SET DEFAULT 10;

-- 4. Create index on paymentStatus
CREATE INDEX IF NOT EXISTS "Subscription_paymentStatus_idx" ON "Subscription"("paymentStatus");

-- 5. Extend SubscriptionPaymentRequest table with billingPeriod
ALTER TABLE "SubscriptionPaymentRequest" ADD COLUMN IF NOT EXISTS "billingPeriod" "BillingPeriod" NOT NULL DEFAULT 'MONTHLY';
