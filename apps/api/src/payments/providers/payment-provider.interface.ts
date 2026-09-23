/** Just enough of a `PlatformPaymentOrder` (+ its package) for an adapter to build a checkout. */
export interface PayableOrder {
  id: string;
  amount: string; // Prisma Decimal, stringified
  currency: string;
  package: { name: string; credits: number };
}

export interface CheckoutInstructions {
  /** Where to send the browser for a redirect-based provider (WayForPay/Mono). Absent for manual IBAN. */
  redirectUrl?: string;
  /** Human-readable payment instructions for a provider with no redirect (manual IBAN). */
  instructions?: string;
  /** The provider's own reference for this order, if it's assigned up front (e.g. Mono's invoiceId). */
  providerReference?: string;
}

export type WebhookOutcome =
  | { orderId: string; status: "PAID"; providerReference: string }
  | { orderId: string; status: "FAILED"; providerReference: string };

/**
 * §51 — one adapter per payment provider. `verifyWebhook` must be checked
 * before `parseWebhook` is ever trusted — a webhook body is attacker-
 * controlled input until its signature is verified.
 */
export interface PaymentProviderAdapter {
  createCheckout(order: PayableOrder): Promise<CheckoutInstructions>;
  verifyWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): Promise<boolean>;
  parseWebhook(rawBody: Buffer): WebhookOutcome;
}
