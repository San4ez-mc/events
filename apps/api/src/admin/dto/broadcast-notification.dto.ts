import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";

/** §40 (UX) — a manual/system announcement sent to every active user. Ukrainian text is required; English is used for `en`-locale users when given. */
export class BroadcastNotificationDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  title!: string;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(500)
  body!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  titleEn?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(500)
  bodyEn?: string;
}
