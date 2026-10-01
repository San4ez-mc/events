import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, IsUUID, MaxLength } from "class-validator";

/** Marketing §referral — a user claiming they shared an event/the app and tagged @kiro.ukraine. */
export class CreateReferralSubmissionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  eventId?: string;

  /** A link to the post/story, or an @handle — whatever points the admin at it to verify. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
