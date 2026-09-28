import { Body, Controller, Delete, Get, Header, HttpCode, HttpStatus, Param, Patch, Post, Put, Req, StreamableFile, UploadedFile, UseInterceptors } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import QRCode from "qrcode";
import type { EnvConfig } from "../config/env.validation";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiConsumes, ApiTags } from "@nestjs/swagger";
import { ApiException } from "../common/exceptions/api.exception";
import type { Request } from "express";
import { Public } from "../common/decorators/public.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { TokenService } from "../auth/token.service";
import { UsersService } from "./users.service";
import { UpdateProfileDto } from "./dto/update-profile.dto";
import { SetSocialLinksDto } from "./dto/set-social-links.dto";
import { DeleteAccountDto } from "./dto/delete-account.dto";
import { ChangePasswordDto } from "./dto/change-password.dto";
import { ChangeEmailDto } from "./dto/change-email.dto";
import { UpdateUserPreferencesDto } from "./dto/update-user-preferences.dto";
import { RateLimit } from "../common/throttle";

@ApiTags("users")
@Controller("users")
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly tokenService: TokenService,
    private readonly configService: ConfigService<EnvConfig, true>,
  ) {}

  @Get("me")
  getMe(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.getFullProfile(user.id);
  }

  @Patch("me")
  updateMe(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateProfile(user.id, dto);
  }

  @RateLimit(10)
  @Post("me/avatar")
  @ApiConsumes("multipart/form-data")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 5 * 1024 * 1024 } }))
  uploadAvatar(@CurrentUser() user: AuthenticatedUser, @UploadedFile() file: Express.Multer.File | undefined) {
    if (!file) throw new ApiException("VALIDATION_ERROR", "No file uploaded", 400, { file: ["Required"] });
    return this.usersService.uploadAvatar(user.id, file);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @RateLimit(5)
  @Post("me/password")
  async changePassword(@CurrentUser() user: AuthenticatedUser, @Body() dto: ChangePasswordDto) {
    await this.usersService.changePassword(user.id, dto);
  }

  /** New address goes back to unverified; a verification email is sent to it, same as at registration. */
  @HttpCode(HttpStatus.NO_CONTENT)
  @RateLimit(5)
  @Post("me/email")
  async changeEmail(@CurrentUser() user: AuthenticatedUser, @Body() dto: ChangeEmailDto) {
    await this.usersService.changeEmail(user.id, dto);
  }

  /** Account deletion required by Google Play / GDPR: erases personal data (see UsersService.deleteAccount). */
  @HttpCode(HttpStatus.NO_CONTENT)
  @RateLimit(3)
  @Delete("me")
  async deleteMe(@CurrentUser() user: AuthenticatedUser, @Body() _dto: DeleteAccountDto) {
    await this.usersService.deleteAccount(user.id);
  }

  @Put("me/social-links")
  setSocialLinks(@CurrentUser() user: AuthenticatedUser, @Body() dto: SetSocialLinksDto) {
    return this.usersService.setSocialLinks(user.id, dto);
  }

  @Patch("me/preferences")
  updateMyPreferences(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateUserPreferencesDto) {
    return this.usersService.updatePreferences(user.id, dto);
  }

  /**
   * UX §22 — public profile, shareable without auth (§63), but personalizes
   * with the viewer's relationship status when a token is present (same
   * optional-auth pattern as the event-slug preview / discovery feed).
   */
  @Public()
  @Get(":id/profile")
  getPublicProfile(@Param("id") id: string, @Req() req: Request) {
    return this.usersService.getPublicProfile(this.tryExtractUserId(req), id);
  }

  /**
   * §24 (UX) — QR for a public profile link. It encodes the same https URL the app already deep-links
   * (/users/:id), so scanning it with any phone camera opens the app if installed, the website otherwise.
   * Public like the profile itself; the profile lookup throws 404 for an unknown user and 400 for a malformed
   * id, so this can't be used to mint QR codes for arbitrary strings.
   */
  @Public()
  @Get(":id/qr")
  @Header("Content-Type", "image/png")
  @Header("Cache-Control", "public, max-age=86400")
  async profileQr(@Param("id") id: string) {
    await this.usersService.getPublicProfile(undefined, id);
    const url = `${this.configService.get("APP_URL", { infer: true })}/users/${id}`;
    return new StreamableFile(await QRCode.toBuffer(url, { type: "png", width: 512, margin: 2 }));
  }

  private tryExtractUserId(req: Request): string | undefined {
    const auth = req.headers.authorization;
    if (!auth?.startsWith("Bearer ")) return undefined;
    return this.tokenService.tryVerifyAccessToken(auth.slice(7))?.sub;
  }
}
