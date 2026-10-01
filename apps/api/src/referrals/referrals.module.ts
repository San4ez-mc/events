import { Module } from "@nestjs/common";
import { CreditsModule } from "../credits/credits.module";
import { ReferralsController } from "./referrals.controller";
import { ReferralsService } from "./referrals.service";

@Module({
  imports: [CreditsModule],
  controllers: [ReferralsController],
  providers: [ReferralsService],
  exports: [ReferralsService],
})
export class ReferralsModule {}
