import { IsEmail, IsString, MaxLength } from "class-validator";

export class ChangeEmailDto {
  @IsEmail()
  @MaxLength(255)
  newEmail!: string;

  @IsString()
  @MaxLength(128)
  currentPassword!: string;
}
