import type { Currency, PaymentProvider, PlatformPaymentStatus, SubscriptionTier } from "@kiro/types";

/** Phase 9 — §50's prices live in the DB, never hardcoded in the frontend. */
export interface CreditPackage {
  id: string;
  name: string;
  credits: number;
  price: string;
  currency: Currency;
  active: boolean;
  sortOrder: number;
}

/** One purchase of either a CreditPackage or one month of a subscription tier, through one PaymentProviderAdapter — exactly one of package/subscriptionTier is set. */
export interface PlatformPaymentOrder {
  id: string;
  userId: string;
  packageId: string | null;
  subscriptionTier: SubscriptionTier | null;
  provider: PaymentProvider;
  amount: string;
  currency: Currency;
  status: PlatformPaymentStatus;
  providerReference: string | null;
  createdAt: string;
  paidAt: string | null;
  package: CreditPackage | null;
}

export interface CheckoutInstructions {
  redirectUrl?: string;
  instructions?: string;
  providerReference?: string;
}

export interface CreateOrderResult {
  order: PlatformPaymentOrder;
  checkout: CheckoutInstructions;
}
