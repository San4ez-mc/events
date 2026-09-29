import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsISO8601, IsOptional } from "class-validator";
import type { SubscriptionTier } from "@kiro/types";

const TIERS = ["STARTER", "PRO"] as const;

/** §72 (admin) — support/testing tool to set a user's plan by hand, bypassing Google Play entirely. */
export class AdminSetSubscriptionDto {
  /** Omit (or send null) to revoke — clears the plan regardless of what granted it. */
  @ApiPropertyOptional({ enum: TIERS, nullable: true })
  @IsOptional()
  @IsIn(TIERS)
  tier?: SubscriptionTier | null;

  /** Omit for no expiry (stays active until an admin changes it). Ignored when revoking. */
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsISO8601()
  expiresAt?: string | null;
}
