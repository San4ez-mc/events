import { Module } from "@nestjs/common";
import { NotificationsModule } from "../notifications/notifications.module";
import { EventRegistrationsController } from "./event-registrations.controller";
import { RegistrationsController } from "./registrations.controller";
import { RegistrationsService } from "./registrations.service";

@Module({
  imports: [NotificationsModule],
  controllers: [EventRegistrationsController, RegistrationsController],
  providers: [RegistrationsService],
  exports: [RegistrationsService],
})
export class RegistrationsModule {}
