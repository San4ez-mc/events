import { Body, Controller, Get, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { RateLimit } from "../common/throttle";
import { PlatformSubscriptionsService } from "./platform-subscriptions.service";
import { VerifyPurchaseDto } from "./dto/verify-purchase.dto";

// Deliberately not "subscriptions" — that path is already owned by SubscriptionsController
// (§33 organizer/category-follow subscriptions), registered earlier in AppModule's imports.
@ApiTags("platform-subscriptions")
@Controller("platform-subscriptions")
export class PlatformSubscriptionsController {
  constructor(private readonly subscriptionsService: PlatformSubscriptionsService) {}

  @Get("mine")
  getMine(@CurrentUser() user: AuthenticatedUser) {
    return this.subscriptionsService.getMine(user.id);
  }

  @RateLimit(10)
  @Post("verify")
  verify(@CurrentUser() user: AuthenticatedUser, @Body() dto: VerifyPurchaseDto) {
    return this.subscriptionsService.verifyPurchase(user.id, dto);
  }
}
