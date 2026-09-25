import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from "class-validator";
import type { Request } from "express";
import { Public } from "../common/decorators/public.decorator";
import { TokenService } from "../auth/token.service";
import { AnalyticsService } from "./analytics.service";
import { FeatureFlagsService } from "../flags/feature-flags.service";

/** Actions a client may report itself; SAVE / REGISTERED / CANCELLED / PAYMENT_LINK_CLICK are recorded server-side. */
const CLIENT_ACTIONS = [
  "IMPRESSION",
  "VIEW",
  "SHARE",
  "REGISTRATION_STARTED",
] as const;
const SOURCES = [
  "SWIPE",
  "SEARCH",
  "DIRECT",
  "PROFILE",
  "THREADS",
  "OTHER",
] as const;

class TrackItemDto {
  @IsUUID("4")
  eventId!: string;

  @IsIn(CLIENT_ACTIONS)
  action!: (typeof CLIENT_ACTIONS)[number];

  @IsOptional()
  @IsIn(SOURCES)
  source?: (typeof SOURCES)[number];
}

class TrackBatchDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => TrackItemDto)
  events!: TrackItemDto[];

  @IsOptional()
  @IsString()
  @MaxLength(64)
  sessionId?: string;
}

/** §45 — public (anonymous visitors are counted too); attributes to the user when a valid token is sent. */
@ApiTags("analytics")
@Controller("analytics")
export class AnalyticsController {
  constructor(
    private readonly analytics: AnalyticsService,
    private readonly tokenService: TokenService,
    private readonly flags: FeatureFlagsService,
  ) {}

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 120 } })
  @HttpCode(HttpStatus.ACCEPTED)
  @Post("events")
  async track(@Body() dto: TrackBatchDto, @Req() req: Request) {
    if (!(await this.flags.isEnabled("ANALYTICS_TRACKING"))) return { accepted: 0 };
    const auth = req.headers.authorization;
    const userId = auth?.startsWith("Bearer ")
      ? this.tokenService.tryVerifyAccessToken(auth.slice(7))?.sub
      : undefined;
    const accepted = await this.analytics.track(
      dto.events.map((e) => ({
        eventId: e.eventId,
        action: e.action,
        source: e.source,
        userId,
        sessionId: dto.sessionId,
      })),
    );
    return { accepted };
  }
}
