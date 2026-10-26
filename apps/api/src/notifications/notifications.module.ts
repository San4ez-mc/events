import { Module } from "@nestjs/common";
import { NotificationsController } from "./notifications.controller";
import { NotificationsService } from "./notifications.service";
import { ExpoPushService } from "./expo-push.service";
import { WebPushService } from "./web-push.service";
import { EventLifecycleScheduler } from "./event-lifecycle.scheduler";
import { EngagementScheduler } from "./engagement.scheduler";
import { EventRemindersController } from "./event-reminders.controller";
import { EventRemindersService } from "./event-reminders.service";
import { CityAlertsController } from "./city-alerts.controller";
import { CityAlertsService } from "./city-alerts.service";

@Module({
  controllers: [NotificationsController, EventRemindersController, CityAlertsController],
  providers: [NotificationsService, ExpoPushService, WebPushService, EventLifecycleScheduler, EngagementScheduler, EventRemindersService, CityAlertsService],
  exports: [NotificationsService, CityAlertsService],
})
export class NotificationsModule {}
