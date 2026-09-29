import { Module } from "@nestjs/common";
import { PlatformSubscriptionsModule } from "../platform-subscriptions/platform-subscriptions.module";
import { EventSeriesController } from "./event-series.controller";
import { EventSeriesService } from "./event-series.service";

@Module({
  imports: [PlatformSubscriptionsModule],
  controllers: [EventSeriesController],
  providers: [EventSeriesService],
})
export class EventSeriesModule {}
