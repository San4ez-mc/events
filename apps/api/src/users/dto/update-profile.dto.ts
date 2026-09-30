import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsDateString, IsIn, IsOptional, IsString, IsUrl, Matches, MaxLength } from "class-validator";

export class UpdateProfileDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ description: "Also the public profile URL handle (/users/:nickname) — letters, digits, underscore, hyphen only." })
  @IsOptional()
  @IsString()
  @Matches(/^[a-zA-Z0-9_-]{2,30}$/, { message: "Use only letters, digits, underscore or hyphen" })
  nickname?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  bio?: string;

  @ApiPropertyOptional({ description: "Optional, never shown publicly (spec §82)" })
  @IsOptional()
  @IsString()
  @Matches(/^\+?[0-9 ()-]{7,20}$/, { message: "Invalid phone number" })
  phone?: string;

  @ApiPropertyOptional({ description: "YYYY-MM-DD. Only used to hide 18+ events from minors; never public." })
  @IsOptional()
  @IsDateString({ strict: true })
  birthDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl()
  avatarUrl?: string;

  @ApiPropertyOptional({ enum: ["uk", "en"] })
  @IsOptional()
  @IsIn(["uk", "en"])
  locale?: "uk" | "en";
}
