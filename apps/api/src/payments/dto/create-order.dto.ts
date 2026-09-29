import { IsIn, IsOptional, IsUUID } from "class-validator";
import type { PaymentProvider, SubscriptionTier } from "@kiro/types";

const PROVIDERS = ["WAYFORPAY", "MONO", "MANUAL_IBAN"] as const;
const SUBSCRIPTION_TIER_VALUES = ["STARTER", "PRO"] as const;

/**
 * §51 — start a purchase through one provider: either a credit package
 * (`packageId`) or one month of a subscription tier (`subscriptionTier`).
 * Exactly one must be given — enforced in PaymentsService, since it also
 * needs to reject subscriptionTier + MANUAL_IBAN there.
 */
export class CreateOrderDto {
  @IsOptional()
  @IsUUID()
  packageId?: string;

  @IsOptional()
  @IsIn(SUBSCRIPTION_TIER_VALUES)
  subscriptionTier?: SubscriptionTier;

  @IsIn(PROVIDERS)
  provider!: PaymentProvider;
}
