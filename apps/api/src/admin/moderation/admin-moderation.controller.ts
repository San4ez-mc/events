import { Controller, Get, Param, Patch } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../../auth/types/authenticated-user";
import { AdminModerationService } from "./admin-moderation.service";

/** §72/§73 — MODERATOR and above (moderation queue is explicitly in MODERATOR's scope). */
@ApiTags("admin")
@Roles("MODERATOR", "ADMIN", "SUPER_ADMIN")
@Controller("admin/moderation")
export class AdminModerationController {
  constructor(private readonly adminModerationService: AdminModerationService) {}

  @Get()
  listPending() {
    return this.adminModerationService.listPending();
  }

  @Patch(":id/approve")
  approve(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.adminModerationService.approve(id, user.id);
  }

  @Patch(":id/reject")
  reject(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.adminModerationService.reject(id, user.id);
  }
}
