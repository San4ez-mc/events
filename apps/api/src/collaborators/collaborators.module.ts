import { Module } from "@nestjs/common";
import { PlatformSubscriptionsModule } from "../platform-subscriptions/platform-subscriptions.module";
import { CollaboratorsController } from "./collaborators.controller";
import { CollaboratorsService } from "./collaborators.service";

@Module({
  imports: [PlatformSubscriptionsModule],
  controllers: [CollaboratorsController],
  providers: [CollaboratorsService],
})
export class CollaboratorsModule {}
