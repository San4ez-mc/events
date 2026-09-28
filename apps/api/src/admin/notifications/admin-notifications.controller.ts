import { randomUUID } from "node:crypto";
import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../../auth/types/authenticated-user";
import { RateLimit } from "../../common/throttle";
import { AuditLogService } from "../../audit/audit-log.service";
import { NotificationsService } from "../../notifications/notifications.service";
import { BroadcastNotificationDto } from "../dto/broadcast-notification.dto";

/** §40 (UX) — manual/system announcements to every active user. Audit-logged like every admin mutation (§74). */
@ApiTags("admin")
@Roles("ADMIN", "SUPER_ADMIN")
@Controller("admin/notifications")
export class AdminNotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly auditLog: AuditLogService,
  ) {}

  @HttpCode(HttpStatus.OK)
  @RateLimit(3)
  @Post("broadcast")
  async broadcast(@CurrentUser() admin: AuthenticatedUser, @Body() dto: BroadcastNotificationDto) {
    const recipients = await this.notificationsService.broadcast(dto);
    await this.auditLog.record({
      actorUserId: admin.id,
      action: "NOTIFICATION_BROADCAST",
      entityType: "NOTIFICATION_BROADCAST",
      entityId: randomUUID(),
      after: { title: dto.title, recipients },
    });
    return { recipients };
  }
}
