import { IsIn, IsString, MinLength } from "class-validator";

const PRODUCT_IDS = ["organizer_starter_monthly", "organizer_pro_monthly"] as const;

/** Sent by the mobile app right after react-native-iap resolves a purchase (or on app start, to re-sync). */
export class VerifyPurchaseDto {
  @IsString()
  @MinLength(10)
  purchaseToken!: string;

  @IsIn(PRODUCT_IDS)
  productId!: (typeof PRODUCT_IDS)[number];
}
