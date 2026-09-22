import { Body, Controller, Get, Param, Patch, Req } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { Public } from "../common/decorators/public.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { TokenService } from "../auth/token.service";
import { UsersService } from "./users.service";
import { UpdateProfileDto } from "./dto/update-profile.dto";
import { UpdateUserPreferencesDto } from "./dto/update-user-preferences.dto";

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
