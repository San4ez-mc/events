import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from "class-validator";
import { Type } from "class-transformer";
import type { EventStatus } from "@kiro/types";

const EVENT_STATUSES = [
  "DRAFT",
  "PENDING_MODERATION",
  "PUBLISHED",
  "REJECTED",
  "CANCELLED",
  "COMPLETED",
  "ARCHIVED",
] as const;

export class ListMyEventsDto {
  @ApiPropertyOptional({ enum: EVENT_STATUSES })
  @IsOptional()
  @IsIn(EVENT_STATUSES)
  status?: EventStatus;

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
