import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsEmail, IsOptional, IsString, MinLength } from "class-validator";

export class LoginDto {
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  password!: string;

  @ApiPropertyOptional({ description: "\"Remember me\": true (default) = long-lived session, false = short session that ends with the browser." })
  @IsOptional()
  @IsBoolean()
  rememberMe?: boolean;
}
