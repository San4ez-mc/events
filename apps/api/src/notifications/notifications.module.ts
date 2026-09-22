import { Module } from "@nestjs/common";
import { NotificationsController } from "./notifications.controller";
import { NotificationsService } from "./notifications.service";
import { ExpoPushService } from "./expo-push.service";
import { EventLifecycleScheduler } from "./event-lifecycle.scheduler";

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, ExpoPushService, EventLifecycleScheduler],
  exports: [NotificationsService],
})
export class NotificationsModule {}
