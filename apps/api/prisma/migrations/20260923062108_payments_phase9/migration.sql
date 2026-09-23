-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('WAYFORPAY', 'MONO', 'MANUAL_IBAN');

-- CreateEnum
CREATE TYPE "PlatformPaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'CANCELLED', 'REFUNDED');

-- CreateTable
CREATE TABLE "platform_payment_orders" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "packageId" UUID NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'UAH',
    "status" "PlatformPaymentStatus" NOT NULL DEFAULT 'PENDING',
    "providerReference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),

    CONSTRAINT "platform_payment_orders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "platform_payment_orders_userId_idx" ON "platform_payment_orders"("userId");

-- CreateIndex
CREATE INDEX "platform_payment_orders_provider_providerReference_idx" ON "platform_payment_orders"("provider", "providerReference");

-- AddForeignKey
ALTER TABLE "platform_payment_orders" ADD CONSTRAINT "platform_payment_orders_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_payment_orders" ADD CONSTRAINT "platform_payment_orders_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "credit_packages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
