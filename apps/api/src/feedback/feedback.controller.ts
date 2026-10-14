import { Body, Controller, HttpCode, HttpStatus, Post, Req, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiConsumes, ApiTags } from "@nestjs/swagger";
import { IsIn, IsInt, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { Type } from "class-transformer";
import type { Request } from "express";
import { DEFAULT_MEDIA_LIMITS } from "@kiro/config";
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

/** Multipart form: the text and device info are string fields, the optional screenshot is the `file` part. */
export class SendFeedbackReportDto {
  @IsString()
  @MinLength(3)
  @MaxLength(4000)
  text!: string;

  /** Where in the app it was sent from, e.g. "event:<slug>". */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  context?: string;

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
    await this.feedback.send(dto, this.optionalUserId(req));
  }

  /** "Повідомити про проблему розробнику": stored for the admin panel, with an optional screenshot. */
  @Public()
  @RateLimit(5)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post("report")
  @ApiConsumes("multipart/form-data")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: DEFAULT_MEDIA_LIMITS.imageMaxBytes } }))
  async report(@Body() dto: SendFeedbackReportDto, @UploadedFile() file: Express.Multer.File | undefined, @Req() req: Request) {
    await this.feedback.submitReport(dto, file, this.optionalUserId(req));
  }

  private optionalUserId(req: Request): string | undefined {
    const auth = req.headers.authorization;
    return auth?.startsWith("Bearer ") ? this.tokens.tryVerifyAccessToken(auth.slice(7))?.sub : undefined;
  }
}
