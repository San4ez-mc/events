import { IsIn, IsUUID } from "class-validator";
import type { PaymentProvider } from "@kiro/types";

const PROVIDERS = ["WAYFORPAY", "MONO", "MANUAL_IBAN"] as const;

/** §51 — start a purchase of one credit package through one provider. */
export class CreateOrderDto {
  @IsUUID()
  packageId!: string;

  @IsIn(PROVIDERS)
  provider!: PaymentProvider;
}
