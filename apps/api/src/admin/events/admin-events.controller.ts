import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
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
  update(@Param("id") id: string, @Body() dto: UpdateEventDto) {
    return this.eventsService.adminUpdate(id, dto);
  }

  @Post(":id/cancel")
  cancel(@Param("id") id: string, @Body() dto: AdminCancelEventDto) {
    return this.eventsService.adminCancel(id, dto.reason);
  }
}
