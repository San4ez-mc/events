import { Type } from "class-transformer";
import { ArrayMaxSize, IsArray, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateNested } from "class-validator";

export class PriceOptionInputDto {
  /** Present for an existing tier — keeps registrations attached to it. */
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000)
  price!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  capacity?: number;
}

/** §24 — all ticket types of an event, replaced in one call (order = array order). */
export class SetPriceOptionsDto {
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => PriceOptionInputDto)
  items!: PriceOptionInputDto[];
}
