import { Body, Controller, Get, Param, Patch, Post, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../../auth/types/authenticated-user";
import { AuditLogService } from "../../audit/audit-log.service";
import { ApiTags } from "@nestjs/swagger";
import { Roles } from "../../common/decorators/roles.decorator";
import { EventsService } from "../../events/events.service";
import { UpdateEventDto } from "../../events/dto/update-event.dto";
import { AdminEventsService } from "./admin-events.service";
import { AdminListEventsDto } from "../dto/admin-list-events.dto";
import { AdminCancelEventDto } from "../dto/cancel-event.dto";

/** §72/§74 — admin can view/edit/cancel any event, any owner. */
@ApiTags("admin")
@Roles("ADMIN", "SUPER_ADMIN")
@Controller("admin/events")
export class AdminEventsController {
  constructor(
    private readonly adminEventsService: AdminEventsService,
    private readonly eventsService: EventsService,
    private readonly auditLog: AuditLogService,
  ) {}

  @Get()
  list(@Query() query: AdminListEventsDto) {
    return this.adminEventsService.list(query);
  }

  @Get(":id")
  getOne(@Param("id") id: string) {
    return this.adminEventsService.getOne(id);
  }

  @Patch(":id")
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
    @Param("id") id: string,
    @Body() dto: UpdateEventDto,
  ) {
    const updated = await this.eventsService.adminUpdate(id, dto);
    await this.auditLog.record({ actorUserId: user.id, action: "EVENT_ADMIN_UPDATE", entityType: "Event", entityId: id, after: dto, ip: req.ip });
    return updated;
  }

  @Post(":id/cancel")
  async cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
    @Param("id") id: string,
    @Body() dto: AdminCancelEventDto,
  ) {
    const cancelled = await this.eventsService.adminCancel(id, dto.reason);
    await this.auditLog.record({ actorUserId: user.id, action: "EVENT_ADMIN_CANCEL", entityType: "Event", entityId: id, after: { reason: dto.reason }, ip: req.ip });
    return cancelled;
  }
}
