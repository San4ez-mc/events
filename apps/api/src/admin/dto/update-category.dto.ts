import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

const ASSIGNABLE_STATUSES = ["ACTIVE", "PENDING", "HIDDEN", "ARCHIVED"] as const;

/** §76 — admin edits a category: rename, approve a user-created one (PENDING -> ACTIVE), hide or archive. */
export class UpdateCategoryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  nameUk?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  nameEn?: string;

  @ApiPropertyOptional({ enum: ASSIGNABLE_STATUSES })
  @IsOptional()
  @IsIn(ASSIGNABLE_STATUSES)
  status?: (typeof ASSIGNABLE_STATUSES)[number];
}
