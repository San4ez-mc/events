import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from "class-validator";
import type { ApprovalMode, EventPriceType } from "@kiro/types";

/**
 * §29 — "edit the whole series": only details that don't shift an occurrence's date or place, so no per-occurrence
 * participant notification is needed. Dates/address are edited on a single occurrence.
 */
export class UpdateSeriesDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  capacity?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  minParticipants?: number;

  @ApiPropertyOptional({ enum: ["FREE", "PAID"] })
  @IsOptional()
  @IsIn(["FREE", "PAID"])
  priceType?: EventPriceType;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price?: number;

  @ApiPropertyOptional({ enum: ["AUTO", "ORGANIZER_APPROVAL"] })
  @IsOptional()
  @IsIn(["AUTO", "ORGANIZER_APPROVAL"])
  approvalMode?: ApprovalMode;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(99)
  ageRestriction?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  rules?: string;
}
