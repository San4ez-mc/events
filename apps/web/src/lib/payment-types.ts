import type { Currency, PaymentProvider, PlatformPaymentStatus } from "@kiro/types";

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

/** Phase 9 (§51) — one purchase of a CreditPackage through one PaymentProviderAdapter. */
export interface PlatformPaymentOrder {
  id: string;
  userId: string;
  packageId: string;
  provider: PaymentProvider;
  amount: string;
  currency: Currency;
  status: PlatformPaymentStatus;
  providerReference: string | null;
  createdAt: string;
  paidAt: string | null;
  package: CreditPackage;
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
