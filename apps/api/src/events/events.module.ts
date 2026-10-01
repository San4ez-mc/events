import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { UsersModule } from "../users/users.module";
import { CreditsModule } from "../credits/credits.module";
import { ModerationModule } from "../moderation/moderation.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { FriendsModule } from "../friends/friends.module";
import { EventsController } from "./events.controller";
import { EventsService } from "./events.service";
import { ShareImageService } from "./share-image.service";

@Module({
  imports: [AuthModule, UsersModule, CreditsModule, ModerationModule, NotificationsModule, FriendsModule],
  controllers: [EventsController],
  providers: [EventsService, ShareImageService],
  exports: [EventsService],
})
export class EventsModule {}
