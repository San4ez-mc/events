import { ApiProperty } from "@nestjs/swagger";
import { IsString, MaxLength, MinLength } from "class-validator";

export class MessageParticipantsDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(1000)
  message!: string;
}
