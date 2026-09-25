import { Body, Controller, Get, Param, Patch, Post, Put, Req, UploadedFile, UseInterceptors } from "@nestjs/common";
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
import { UpdateUserPreferencesDto } from "./dto/update-user-preferences.dto";
import { RateLimit } from "../common/throttle";

@ApiTags("users")
@Controller("users")
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly tokenService: TokenService,
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

  private tryExtractUserId(req: Request): string | undefined {
    const auth = req.headers.authorization;
    if (!auth?.startsWith("Bearer ")) return undefined;
    return this.tokenService.tryVerifyAccessToken(auth.slice(7))?.sub;
  }
}
