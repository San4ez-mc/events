import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request, Response } from "express";
import { ConfigService } from "@nestjs/config";
import type { EnvConfig } from "../config/env.validation";
import { Public } from "../common/decorators/public.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ApiException } from "../common/exceptions/api.exception";
import { AuthService, type AuthTokens } from "./auth.service";
import { RegisterDto } from "./dto/register.dto";
import { LoginDto } from "./dto/login.dto";
import { GoogleLoginDto } from "./dto/google-login.dto";
import { ForgotPasswordDto } from "./dto/forgot-password.dto";
import { ResetPasswordDto } from "./dto/reset-password.dto";
import { VerifyEmailDto } from "./dto/verify-email.dto";
import type { AuthenticatedUser } from "./types/authenticated-user";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";

const REFRESH_COOKIE_NAME = "kiro_refresh_token";
/** Web clients identify themselves so we know to use the httpOnly cookie flow (§9). */
const CLIENT_PLATFORM_HEADER = "x-client-platform";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService<EnvConfig, true>,
  ) {}

  @Public()
  @Post("register")
  async register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { user, tokens } = await this.authService.register(dto);
    return this.respondWithTokens(req, res, user, tokens);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post("google")
  async google(
    @Body() dto: GoogleLoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { user, tokens } = await this.authService.loginWithGoogle(dto.idToken);
    return this.respondWithTokens(req, res, user, tokens);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post("login")
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { user, tokens } = await this.authService.login(dto);
    return this.respondWithTokens(req, res, user, tokens);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post("refresh")
  async refresh(
    @Body("refreshToken") bodyToken: string | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const rawToken = this.extractRefreshToken(req, bodyToken);
    const tokens = await this.authService.refresh(rawToken, {
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });
    return this.respondWithTokenPairOnly(req, res, tokens);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Post("logout")
  async logout(
    @Body("refreshToken") bodyToken: string | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const rawToken = this.extractRefreshToken(req, bodyToken, { optional: true });
    if (rawToken) {
      await this.authService.logout(rawToken);
    }
    res.clearCookie(REFRESH_COOKIE_NAME, { path: "/api/v1/auth" });
  }

  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post("verify-email")
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    await this.authService.verifyEmail(dto.token);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Post("resend-verification")
  async resendVerification(@CurrentUser() user: AuthenticatedUser) {
    await this.authService.resendVerificationEmail(user.id);
  }

  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post("forgot-password")
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.authService.forgotPassword(dto.email);
  }

  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post("reset-password")
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.authService.resetPassword(dto.token, dto.password);
  }

  @UseGuards(JwtAuthGuard)
  @Get("me")
  me(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }

  private isWebClient(req: Request): boolean {
    return req.headers[CLIENT_PLATFORM_HEADER] === "web";
  }

  private extractRefreshToken(
    req: Request,
    bodyToken: string | undefined,
    opts: { optional?: boolean } = {},
  ): string {
    const cookieToken = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE_NAME];
    const token = cookieToken ?? bodyToken;
    if (!token) {
      if (opts.optional) return "";
      throw new ApiException("AUTH_REQUIRED", "Refresh token is missing", 401);
    }
    return token;
  }

  private respondWithTokens(req: Request, res: Response, user: unknown, tokens: AuthTokens) {
    const refreshToken = this.attachTokens(req, res, tokens);
    return { user, accessToken: tokens.accessToken, ...refreshToken };
  }

  private respondWithTokenPairOnly(req: Request, res: Response, tokens: AuthTokens) {
    const refreshToken = this.attachTokens(req, res, tokens);
    return { accessToken: tokens.accessToken, ...refreshToken };
  }

  /**
   * Web: refresh token goes ONLY in an httpOnly Secure cookie (never in the
   * JSON body, so page JS can't read it). Mobile: refresh token goes ONLY in
   * the JSON body, for the client to store in SecureStore — mobile has no
   * cookie jar concept worth relying on across app/webview boundaries.
   */
  private attachTokens(
    req: Request,
    res: Response,
    tokens: AuthTokens,
  ): { refreshToken: string } | Record<string, never> {
    if (this.isWebClient(req)) {
      const isProd = this.configService.get("NODE_ENV", { infer: true }) === "production";
      res.cookie(REFRESH_COOKIE_NAME, tokens.refreshToken, {
        httpOnly: true,
        secure: isProd,
        sameSite: "lax",
        path: "/api/v1/auth",
        expires: tokens.refreshTokenExpiresAt,
      });
      return {};
    }
    return { refreshToken: tokens.refreshToken };
  }
}
