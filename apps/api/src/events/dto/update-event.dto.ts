import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";
import type {
  ApprovalMode,
  EventFormat,
  EventPriceType,
  EventVisibility,
} from "@kiro/types";

/**
 * All fields optional — this is a draft being filled in incrementally by
 * the create-event wizard (§68, §69). Cross-field business rules ("address
 * required if offline", "capacity >= minParticipants", etc.) are enforced
 * by the publish-time validator (Phase 2), not here — a draft is allowed to
 * be incomplete or momentarily inconsistent while the organizer is mid-edit.
 */
export class UpdateEventDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ enum: ["uk", "en"] })
  @IsOptional()
  @IsIn(["uk", "en"])
  language?: "uk" | "en";

  @ApiPropertyOptional({ enum: ["PUBLIC", "PRIVATE"] })
  @IsOptional()
  @IsIn(["PUBLIC", "PRIVATE"])
  visibility?: EventVisibility;

  @ApiPropertyOptional({ enum: ["OFFLINE", "ONLINE"] })
  @IsOptional()
  @IsIn(["OFFLINE", "ONLINE"])
  format?: EventFormat;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  startsAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  endsAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  cityId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  districtId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  addressText?: string;

  @ApiPropertyOptional({ description: "Structured address components from Google Places (§60)." })
  @IsOptional()
  @IsObject()
  addressDetails?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  googlePlaceId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ require_tld: false })
  onlineUrl?: string;

  @ApiPropertyOptional({ description: "Optional YouTube link, shown alongside the event's own photos/video." })
  @IsOptional()
  @IsUrl({ require_tld: false })
  youtubeUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  capacity?: number;

  @ApiPropertyOptional({ description: "Participants the organizer already has outside Kiro; counted toward capacity." })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  presetParticipants?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  minParticipants?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  registrationDeadline?: string;

  @ApiPropertyOptional({ enum: ["AUTO", "ORGANIZER_APPROVAL"] })
  @IsOptional()
  @IsIn(["AUTO", "ORGANIZER_APPROVAL"])
  approvalMode?: ApprovalMode;

  @ApiPropertyOptional({ enum: ["INTERNAL", "EXTERNAL"], description: "EXTERNAL = people register/buy on the organizer's own site." })
  @IsOptional()
  @IsIn(["INTERNAL", "EXTERNAL"])
  registrationMode?: "INTERNAL" | "EXTERNAL";

  @ApiPropertyOptional({ description: "Where the register/buy button leads when registrationMode is EXTERNAL." })
  @IsOptional()
  @IsUrl({ require_protocol: true, protocols: ["http", "https"] })
  @MaxLength(2000)
  externalRegistrationUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(99)
  ageRestriction?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  rules?: string;

  @ApiPropertyOptional({ enum: ["FREE", "PAID", "DONATION"] })
  @IsOptional()
  @IsIn(["FREE", "PAID", "DONATION"])
  priceType?: EventPriceType;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price?: number;

  @ApiPropertyOptional({ description: "Upper end of a price range (price is the lowest)." })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  priceMax?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl()
  paymentUrl?: string;

  @ApiPropertyOptional({
    description:
      "Confirms the organizer wants participants notified of a significant change (§78). Required to be true when changing startsAt/address/onlineUrl on an already-published event.",
  })
  @IsOptional()
  @IsBoolean()
  notifyParticipants?: boolean;
}
