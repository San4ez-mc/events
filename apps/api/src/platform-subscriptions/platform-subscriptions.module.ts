import { Module } from "@nestjs/common";
import { PlatformSubscriptionsController } from "./platform-subscriptions.controller";
import { PlatformSubscriptionsService } from "./platform-subscriptions.service";
import { GooglePlayVerifier } from "./google-play.verifier";
import { SubscriptionRecheckScheduler } from "./subscription-recheck.scheduler";

@Module({
  controllers: [PlatformSubscriptionsController],
  providers: [PlatformSubscriptionsService, GooglePlayVerifier, SubscriptionRecheckScheduler],
  exports: [PlatformSubscriptionsService],
})
export class PlatformSubscriptionsModule {}
