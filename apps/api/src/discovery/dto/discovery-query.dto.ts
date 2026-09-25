import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import { IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, Min } from "class-validator";
import type { EventFormat } from "@kiro/types";

const EVENT_FORMATS = ["OFFLINE", "ONLINE"] as const;

/** `?cityIds=a,b,c` — comma-separated, not repeated query keys (simpler for the mobile/web filter UI to build). */
const splitCsv = ({ value }: { value: unknown }): unknown =>
  typeof value === "string" ? value.split(",").filter(Boolean) : value;

/** §57 — GET /discovery query parameters. */
export class DiscoveryQueryDto {
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @Transform(splitCsv)
  @IsArray()
  @IsUUID("4", { each: true })
  cityIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @Transform(splitCsv)
  @IsArray()
  @IsUUID("4", { each: true })
  districtIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @Transform(splitCsv)
  @IsArray()
  @IsUUID("4", { each: true })
  categoryIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minBudget?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxBudget?: number;

  @ApiPropertyOptional({ description: "Only 18+ events" })
  @IsOptional()
  @Transform(({ value }) => value === "true" || value === true)
  @IsBoolean()
  adultsOnly?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  capacityMin?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  capacityMax?: number;

  @ApiPropertyOptional({ description: "Start-hour window in Europe/Kyiv, 0-23. hourFrom > hourTo wraps past midnight (night)." })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(23)
  hourFrom?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(24)
  hourTo?: number;

  @ApiPropertyOptional({ enum: EVENT_FORMATS })
  @IsOptional()
  @IsIn(EVENT_FORMATS)
  format?: EventFormat;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === "true" || value === true)
  @IsBoolean()
  freeOnly?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
