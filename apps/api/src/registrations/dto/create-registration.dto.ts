import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsArray, IsBoolean, IsOptional, IsUUID, ValidateNested } from "class-validator";

export class RegistrationAnswerDto {
  @IsUUID()
  fieldId!: string;

  /**
   * Shape depends on the field's type — string, number, boolean, or string[]
   * for MULTISELECT — so it can't be pinned to one class-validator type
   * decorator. `@IsOptional()` is still required despite that: the global
   * ValidationPipe runs with `forbidNonWhitelisted: true`, which rejects any
   * property with zero validation decorators outright (not just strips it),
   * so an undecorated `value` field would 400 on every submission.
   */
  @IsOptional()
  value: unknown;
}

export class CreateRegistrationDto {
  @ApiPropertyOptional({ type: [RegistrationAnswerDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RegistrationAnswerDto)
  answers?: RegistrationAnswerDto[];

  @ApiPropertyOptional({ description: "If capacity is full, join the waitlist instead of erroring (UX §16)." })
  @IsOptional()
  @IsBoolean()
  joinWaitlist?: boolean;

  @ApiPropertyOptional({ description: "Opt-in to appear in the event's public attendee preview (UX §83)." })
  @IsOptional()
  @IsBoolean()
  showAsParticipant?: boolean;
}
