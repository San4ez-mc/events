import { IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

const STATUSES = ["ACTIVE", "PENDING", "ARCHIVED"] as const;

export class UpdateDistrictDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  nameUk?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  nameEn?: string;

  @IsOptional()
  @IsIn(STATUSES)
  status?: (typeof STATUSES)[number];
}
