import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsNumber, Max, Min } from "class-validator";

/** Focal point as a 0..1 fraction of the image, used for CSS object-position (§23, §66). */
export class UpdateFocalPointDto {
  @ApiProperty({ minimum: 0, maximum: 1 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  focalX!: number;

  @ApiProperty({ minimum: 0, maximum: 1 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  focalY!: number;
}
