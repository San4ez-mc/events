import { Module } from "@nestjs/common";
import { NotificationsModule } from "../notifications/notifications.module";
import { GeographyController } from "./geography.controller";
import { GeographyService } from "./geography.service";

@Module({
  imports: [NotificationsModule],
  controllers: [GeographyController],
  providers: [GeographyService],
  exports: [GeographyService],
})
export class GeographyModule {}
