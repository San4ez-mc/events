import { ArrayMaxSize, IsArray, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";

export class SubmitEventReportDto {
  /** Registrations of the people who actually came; every other active registration of the event is marked as a no-show. */
  @IsArray() @ArrayMaxSize(5000) @IsUUID("all", { each: true }) attendedIds!: string[];

  /** Optional: what was missing in the app, wishes, problems. Goes to the Kiro team, not to attendees. */
  @IsOptional() @IsString() @MaxLength(3000) comment?: string;
}
