import { Module } from "@nestjs/common";
import { CreditsModule } from "../credits/credits.module";
import { PlatformSubscriptionsModule } from "../platform-subscriptions/platform-subscriptions.module";
import { PaymentsController } from "./payments.controller";
import { PaymentsService } from "./payments.service";
import { WayForPayAdapter } from "./providers/wayforpay.adapter";
import { MonoAdapter } from "./providers/mono.adapter";
import { ManualIbanAdapter } from "./providers/manual-iban.adapter";

@Module({
  imports: [CreditsModule, PlatformSubscriptionsModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, WayForPayAdapter, MonoAdapter, ManualIbanAdapter],
  exports: [PaymentsService],
})
export class PaymentsModule {}
