import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";
import type { ReportTargetType } from "@kiro/types";

const TARGET_TYPES = ["EVENT", "USER", "REVIEW"] as const;

/** §39 — a user flagging content for admin attention. */
export class CreateReportDto {
  @IsIn(TARGET_TYPES)
  targetType!: ReportTargetType;

  @IsUUID()
  targetId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  reason!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}
