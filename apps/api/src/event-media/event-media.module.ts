import { Module } from "@nestjs/common";
import { EventMediaController } from "./event-media.controller";
import { EventMediaService } from "./event-media.service";

@Module({
  controllers: [EventMediaController],
  providers: [EventMediaService],
  exports: [EventMediaService],
})
export class EventMediaModule {}
