import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Min, MaxLength, ValidateNested } from "class-validator";
import type { RegistrationFieldType } from "@kiro/types";

const FIELD_TYPES = [
  "TEXT",
  "TEXTAREA",
  "NUMBER",
  "PHONE",
  "EMAIL",
  "SELECT",
  "MULTISELECT",
  "CHECKBOX",
  "DATE",
] as const;

export class RegistrationFieldInputDto {
  /** Omitted for a new field; an existing field's id keeps its answers attached across edits. */
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsString()
  @MaxLength(200)
  label!: string;

  @IsIn(FIELD_TYPES)
  type!: RegistrationFieldType;

  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(50)
  options?: string[];

  @IsInt()
  @Min(0)
  sortOrder!: number;
}

/** §25 — organizer replaces the whole custom-question set in one call, same "array replace" shape as media reordering. */
export class SetRegistrationFieldsDto {
  @ApiProperty({ type: [RegistrationFieldInputDto] })
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => RegistrationFieldInputDto)
  fields!: RegistrationFieldInputDto[];
}
