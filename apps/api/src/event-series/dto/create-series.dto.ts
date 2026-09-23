import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsIn, IsInt, IsISO8601, IsOptional, Max, Min } from "class-validator";
import type { RecurrenceType } from "@kiro/types";

const RECURRENCE_TYPES = [
  "DAILY",
  "EVERY_N_DAYS",
  "WEEKLY",
  "EVERY_N_WEEKS",
  "SPECIFIC_WEEKDAY",
  "SPECIFIC_DAY_OF_MONTH",
  "EVERY_N_MONTHS",
] as const;

/** §29 — turns an existing draft event into a recurring series template + generates its occurrences. */
export class CreateSeriesDto {
  @IsIn(RECURRENCE_TYPES)
  recurrenceType!: RecurrenceType;

  @ApiPropertyOptional({ description: "N for EVERY_N_DAYS/EVERY_N_WEEKS/EVERY_N_MONTHS. Defaults to 1." })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  interval?: number;

  @ApiPropertyOptional({ description: "Only ends the series after this many total occurrences." })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(52)
  count?: number;

  @ApiPropertyOptional({ description: "Only ends the series once occurrences would start after this date." })
  @IsOptional()
  @IsISO8601()
  until?: string;
}
