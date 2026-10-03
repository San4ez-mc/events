import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from "class-validator";

const RESOLUTIONS = ["RESOLVED", "DISMISSED"] as const;

export class ResolveReportDto {
  @IsIn(RESOLUTIONS)
  status!: (typeof RESOLUTIONS)[number];

  /** Hides what was reported: a review becomes HIDDEN, a published event is pulled from the public site. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  hideTarget?: boolean;

  /** Suspends the person behind the reported thing (the event's organizer, the reported user, the review's author). */
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  suspendOwner?: boolean;

  /** A message sent to that person (a warning / explanation) as a notification. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  warnMessage?: string;

  /** An answer for the person who filed the report; replaces the standard "we reviewed your report" text. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
