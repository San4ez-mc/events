import { Module } from "@nestjs/common";
import { NotificationsModule } from "../notifications/notifications.module";
import { GeographyController } from "./geography.controller";
import { DistrictsSuggestController } from "./districts-suggest.controller";
import { GeographyService } from "./geography.service";

@Module({
  imports: [NotificationsModule],
  controllers: [GeographyController, DistrictsSuggestController],
  providers: [GeographyService],
  exports: [GeographyService],
})
export class GeographyModule {}
