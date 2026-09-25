import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from "class-validator";

/** §37 — a user proposes a missing district; it stays PENDING until an admin approves it. */
export class SuggestDistrictDto {
  @IsUUID()
  cityId!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  nameUk!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  nameEn?: string;
}
