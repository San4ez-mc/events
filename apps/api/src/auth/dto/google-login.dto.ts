import { ApiProperty } from "@nestjs/swagger";
import { IsString, MaxLength, MinLength } from "class-validator";

export class GoogleLoginDto {
  @ApiProperty({ description: "Google ID token (JWT) obtained by the client from Google Sign-In" })
  @IsString()
  @MinLength(20)
  @MaxLength(4096)
  idToken!: string;
}
