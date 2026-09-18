import { ApiPropertyOptional, ApiProperty } from "@nestjs/swagger";
import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from "class-validator";

export class CreateCategoryDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  nameUk!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  nameEn?: string;

  @ApiPropertyOptional({ description: "Parent category id — max tree depth is 2 (§16)." })
  @IsOptional()
  @IsUUID()
  parentId?: string;
}
