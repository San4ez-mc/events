import { ApiProperty } from "@nestjs/swagger";
import { IsString, Matches, MaxLength, MinLength } from "class-validator";

export class ResetPasswordDto {
  @ApiProperty()
  @IsString()
  token!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(/[a-zA-Z]/, { message: "Password must contain at least one letter" })
  @Matches(/[0-9]/, { message: "Password must contain at least one digit" })
  password!: string;
}
