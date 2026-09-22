import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { SubscriptionsService } from "./subscriptions.service";
import { SubscribeToOrganizerDto } from "./dto/subscribe-to-organizer.dto";

@ApiTags("subscriptions")
@Controller("subscriptions")
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Get("mine")
  listMine(@CurrentUser() user: AuthenticatedUser) {
    return this.subscriptionsService.listMine(user.id);
  }

  @Post("organizers/:organizerId")
  subscribeToOrganizer(
    @CurrentUser() user: AuthenticatedUser,
    @Param("organizerId") organizerId: string,
    @Body() dto: SubscribeToOrganizerDto,
  ) {
    return this.subscriptionsService.subscribeToOrganizer(user.id, organizerId, dto);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(":id")
  unsubscribe(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.subscriptionsService.unsubscribe(id, user.id);
  }
}
