import { Module } from "@nestjs/common";
import { EventSeriesController } from "./event-series.controller";
import { EventSeriesService } from "./event-series.service";

@Module({
  controllers: [EventSeriesController],
  providers: [EventSeriesService],
})
export class EventSeriesModule {}
