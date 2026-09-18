import { ApiProperty } from "@nestjs/swagger";
import { IsUUID } from "class-validator";

export class ListDistrictsDto {
  @ApiProperty()
  @IsUUID()
  cityId!: string;
}
