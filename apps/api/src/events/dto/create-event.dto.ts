import { ApiProperty } from "@nestjs/swagger";
import { IsString, MaxLength, MinLength } from "class-validator";

/**
 * Creates a minimal draft — only `title` is required (UX §31 step 1). Every
 * other field is filled in via subsequent PATCH calls as the wizard
 * progresses, with autosave (§68).
 */
export class CreateEventDto {
  @ApiProperty({ minLength: 1, maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;
}
