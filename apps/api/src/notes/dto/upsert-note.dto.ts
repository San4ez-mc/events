import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from "class-validator";

export class UpsertNoteDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  note!: string;

  @ApiPropertyOptional({ description: "Scopes the note to one event (e.g. an organizer's note about a specific attendee)." })
  @IsOptional()
  @IsUUID()
  eventId?: string;
}
