import { ApiPropertyOptional } from "@nestjs/swagger";
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsNumber, IsOptional, IsUUID, Min } from "class-validator";
import { Type } from "class-transformer";

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

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsUUID()
  preferredCityId?: string | null;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID("4", { each: true })
  preferredCategoryIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID("4", { each: true })
  preferredDistrictIds?: string[];

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxBudget?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  freeOnly?: boolean;

  @ApiPropertyOptional({ enum: ["OFFLINE", "ONLINE"], nullable: true })
  @IsOptional()
  @IsIn(["OFFLINE", "ONLINE"])
  preferredFormat?: "OFFLINE" | "ONLINE" | null;
}
