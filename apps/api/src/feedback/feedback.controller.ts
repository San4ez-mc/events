import { Body, Controller, HttpCode, HttpStatus, Post, Req } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { IsIn, IsInt, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { Type } from "class-transformer";
import type { Request } from "express";
import { Public } from "../common/decorators/public.decorator";
import { RateLimit } from "../common/throttle";
import { TokenService } from "../auth/token.service";
import { FeedbackService } from "./feedback.service";

export class SendFeedbackDto {
  @IsIn(["problem", "idea"])
  kind!: "problem" | "idea";

  @IsString()
  @MinLength(3)
  @MaxLength(4000)
  text!: string;

  @IsOptional()
  @IsIn(["android", "ios", "web"])
  platform?: "android" | "ios" | "web";

  @IsOptional()
  @IsString()
  @MaxLength(30)
  appVersion?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  buildNumber?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  device?: string;
}

/** In-app "Report a problem / idea". Works signed-out too (the user id is attached when a token is present). */
@ApiTags("feedback")
@Controller("feedback")
export class FeedbackController {
  constructor(
    private readonly feedback: FeedbackService,
    private readonly tokens: TokenService,
  ) {}

  @Public()
  @RateLimit(5)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post()
  async send(@Body() dto: SendFeedbackDto, @Req() req: Request) {
    const auth = req.headers.authorization;
    const userId = auth?.startsWith("Bearer ") ? this.tokens.tryVerifyAccessToken(auth.slice(7))?.sub : undefined;
    await this.feedback.send(dto, userId);
  }
}
