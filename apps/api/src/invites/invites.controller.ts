import { Controller, Get, HttpCode, Param, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Public } from "../common/decorators/public.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { RateLimit } from "../common/throttle";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { InvitesService } from "./invites.service";

@ApiTags("invites")
@Controller()
export class InvitesController {
  constructor(private readonly invites: InvitesService) {}

  /** My personal link, and who joined through it (and who of them became an organizer). */
  @Get("users/me/invites")
  mine(@CurrentUser() user: AuthenticatedUser) {
    return this.invites.mine(user.id);
  }

  /** Called by the website's /r/<code> redirect each time an invitation link is opened. */
  @Public()
  @RateLimit(60)
  @Post("invites/click/:code")
  @HttpCode(204)
  async click(@Param("code") code: string): Promise<void> {
    await this.invites.registerClick(code);
  }

  /** Admin: who invited whom. */
  @Roles("ADMIN", "SUPER_ADMIN")
  @Get("admin/invites")
  overview() {
    return this.invites.overview();
  }
}
