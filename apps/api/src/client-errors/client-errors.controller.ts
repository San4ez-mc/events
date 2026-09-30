import { Body, Controller, HttpCode, HttpStatus, Post, Req } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";
import type { Request } from "express";
import { Public } from "../common/decorators/public.decorator";
import { RateLimit } from "../common/throttle";
import { TokenService } from "../auth/token.service";
import { EditsReporterService } from "../edits-reporter/edits-reporter.service";

export class ReportClientErrorDto {
  @IsIn(["mobile", "web"])
  source!: "mobile" | "web";

  @IsString()
  @MaxLength(2000)
  message!: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  stack?: string;

  /** Free-form: screen/route name, app version, OS — whatever the client has handy. */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  context?: string;
}

/**
 * Crash/unhandled-error reporting from the mobile app and web client — "how do we know when
 * something breaks for someone" (no Sentry/Crashlytics in this app; reports go to the FINEKO
 * "Правки" platform instead, same as user feedback). Works signed-out too: a crash can happen
 * before login.
 */
@ApiTags("client-errors")
@Controller("client-errors")
export class ClientErrorsController {
  constructor(
    private readonly editsReporter: EditsReporterService,
    private readonly tokens: TokenService,
  ) {}

  @Public()
  @RateLimit(20)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post()
  async report(@Body() dto: ReportClientErrorDto, @Req() req: Request) {
    const auth = req.headers.authorization;
    const userId = auth?.startsWith("Bearer ") ? this.tokens.tryVerifyAccessToken(auth.slice(7))?.sub : undefined;

    const text = [dto.message, dto.stack, dto.context].filter(Boolean).join("\n\n");
    void this.editsReporter.report(text, `kiro-${dto.source}`, userId);
  }
}
