import { ApiProperty } from "@nestjs/swagger";
import { IsBoolean } from "class-validator";

export class SetEventTestDto {
  @ApiProperty()
  @IsBoolean()
  isTest!: boolean;
}
