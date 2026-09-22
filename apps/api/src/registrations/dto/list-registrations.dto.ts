import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from "class-validator";
import { Type } from "class-transformer";
import type { RegistrationStatus } from "@kiro/types";

const REGISTRATION_STATUSES = [
  "PENDING",
  "REGISTERED",
  "PAYMENT_PENDING",
  "CONFIRMED",
  "REJECTED",
  "CANCELLED",
  "ATTENDED",
  "NO_SHOW",
  "WAITLISTED",
] as const;

export class ListRegistrationsDto {
  @ApiPropertyOptional({ enum: REGISTRATION_STATUSES })
  @IsOptional()
  @IsIn(REGISTRATION_STATUSES)
  status?: RegistrationStatus;

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
