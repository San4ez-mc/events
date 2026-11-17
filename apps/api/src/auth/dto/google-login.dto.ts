import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class GoogleLoginDto {
  @ApiProperty({ description: "Google ID token (JWT) obtained by the client from Google Sign-In" })
  @IsString()
  @MinLength(20)
  @MaxLength(4096)
  idToken!: string;

  @ApiPropertyOptional({ description: "Personal invitation code, used only when this sign-in creates a new account" })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  referralCode?: string;
}
