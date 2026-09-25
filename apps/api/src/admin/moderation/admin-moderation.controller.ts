import { Controller, Get, Param, Patch, Req } from "@nestjs/common";
import type { Request } from "express";
import { AuditLogService } from "../../audit/audit-log.service";
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
  constructor(
    private readonly adminModerationService: AdminModerationService,
    private readonly auditLog: AuditLogService,
  ) {}

  @Get()
  listPending() {
    return this.adminModerationService.listPending();
  }

  @Patch(":id/approve")
  async approve(@CurrentUser() user: AuthenticatedUser, @Req() req: Request, @Param("id") id: string) {
    const result = await this.adminModerationService.approve(id, user.id);
    await this.auditLog.record({ actorUserId: user.id, action: "MODERATION_APPROVE", entityType: "ModerationCase", entityId: id, ip: req.ip });
    return result;
  }

  @Patch(":id/reject")
  async reject(@CurrentUser() user: AuthenticatedUser, @Req() req: Request, @Param("id") id: string) {
    const result = await this.adminModerationService.reject(id, user.id);
    await this.auditLog.record({ actorUserId: user.id, action: "MODERATION_REJECT", entityType: "ModerationCase", entityId: id, ip: req.ip });
    return result;
  }
}
