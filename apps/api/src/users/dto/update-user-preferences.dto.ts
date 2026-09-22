import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsOptional } from "class-validator";

/** Notification opt-outs + §23's profile-privacy toggles. */
export class UpdateUserPreferencesDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  allowPush?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  allowEmail?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  allowFriendActivityNotifications?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  allowSubscriptionNotifications?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  allowEventReminderNotifications?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  hideSocialLinks?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  hideUpcomingEvents?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  hideAttendanceHistory?: boolean;
}
