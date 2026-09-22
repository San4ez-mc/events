import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsArray, IsBoolean, IsIn, IsNumber, IsOptional, IsUUID, Min } from "class-validator";
import type { EventFormat } from "@kiro/types";

const EVENT_FORMATS = ["OFFLINE", "ONLINE"] as const;

/** UX §7 — filters persist in the profile but can be changed anytime. */
export class UpdateDiscoveryPreferencesDto {
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsUUID()
  preferredCityId?: string | null;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID("4", { each: true })
  preferredDistrictIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID("4", { each: true })
  preferredCategoryIds?: string[];

  @ApiPropertyOptional({ enum: EVENT_FORMATS, nullable: true })
  @IsOptional()
  @IsIn(EVENT_FORMATS)
  preferredFormat?: EventFormat | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  freeOnly?: boolean;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxBudget?: number | null;
}
