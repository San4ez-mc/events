import { Controller, Delete, HttpCode, HttpStatus, Param, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { SubscriptionsService } from "./subscriptions.service";

@ApiTags("subscriptions")
@Controller("events/:eventId/subscribe")
export class EventSubscriptionController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Post()
  subscribe(@CurrentUser() user: AuthenticatedUser, @Param("eventId") eventId: string) {
    return this.subscriptionsService.subscribeToEvent(user.id, eventId);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete()
  unsubscribe(@CurrentUser() user: AuthenticatedUser, @Param("eventId") eventId: string) {
    return this.subscriptionsService.unsubscribeFromEvent(user.id, eventId);
  }
}
