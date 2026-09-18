import { ApiPropertyOptional, ApiProperty } from "@nestjs/swagger";
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from "class-validator";

export class RegisterDto {
  @ApiProperty({ example: "user@example.com" })
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: 8, example: "Str0ngPass" })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(/[a-zA-Z]/, { message: "Password must contain at least one letter" })
  @Matches(/[0-9]/, { message: "Password must contain at least one digit" })
  password!: string;

  @ApiPropertyOptional()
  @ValidateIf((o: RegisterDto) => !o.nickname)
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional()
  @ValidateIf((o: RegisterDto) => !o.name)
  @IsString()
  @MinLength(2)
  @MaxLength(30)
  nickname?: string;

  @ApiPropertyOptional({ enum: ["uk", "en"], default: "uk" })
  @IsOptional()
  @IsIn(["uk", "en"])
  locale?: "uk" | "en";
}
