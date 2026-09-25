import { Type } from "class-transformer";
import { ArrayMaxSize, IsArray, IsNotEmpty, IsString, MaxLength, ValidateNested } from "class-validator";

export class FaqItemDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  question!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  answer!: string;
}

/** §20 — the whole FAQ of an event, replaced in one call (order = array order). */
export class SetFaqDto {
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => FaqItemDto)
  items!: FaqItemDto[];
}
