import { Body, Controller, Param, Put } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../../auth/types/authenticated-user";
import { PlatformSubscriptionsService } from "../../platform-subscriptions/platform-subscriptions.service";
import { AdminSetSubscriptionDto } from "../dto/admin-set-subscription.dto";

/** §72 — support/testing tool: set or revoke a user's subscription plan by hand, bypassing Google Play. */
@ApiTags("admin")
@Roles("ADMIN", "SUPER_ADMIN")
@Controller("admin/users/:userId/subscription")
export class AdminSubscriptionsController {
  constructor(private readonly subscriptionsService: PlatformSubscriptionsService) {}

  @Put()
  set(@CurrentUser() admin: AuthenticatedUser, @Param("userId") userId: string, @Body() dto: AdminSetSubscriptionDto) {
    return this.subscriptionsService.adminSet(admin.id, userId, dto);
  }
}
