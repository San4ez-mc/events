import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { NotificationsService } from "./notifications.service";
import { ListNotificationsDto } from "./dto/list-notifications.dto";
import { RegisterDeviceDto } from "./dto/register-device.dto";

@ApiTags("notifications")
@Controller("notifications")
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  listMine(@CurrentUser() user: AuthenticatedUser, @Query() query: ListNotificationsDto) {
    return this.notificationsService.listMine(user.id, query);
  }

  @Get("unread-count")
  async getUnreadCount(@CurrentUser() user: AuthenticatedUser) {
    return { count: await this.notificationsService.getUnreadCount(user.id) };
  }

  @HttpCode(HttpStatus.OK)
  @Patch(":id/read")
  markRead(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.notificationsService.markRead(id, user.id);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Patch("read-all")
  markAllRead(@CurrentUser() user: AuthenticatedUser) {
    return this.notificationsService.markAllRead(user.id);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Post("devices")
  registerDevice(@CurrentUser() user: AuthenticatedUser, @Body() dto: RegisterDeviceDto) {
    return this.notificationsService.registerDevice(user.id, dto.pushToken, dto.platform);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete("devices/:pushToken")
  unregisterDevice(@CurrentUser() user: AuthenticatedUser, @Param("pushToken") pushToken: string) {
    return this.notificationsService.unregisterDevice(user.id, pushToken);
  }
}
