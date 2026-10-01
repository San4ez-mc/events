import { Module } from "@nestjs/common";
import { NotificationsModule } from "../notifications/notifications.module";
import { FriendsModule } from "../friends/friends.module";
import { InvitationsController } from "./invitations.controller";
import { InvitationsService } from "./invitations.service";

@Module({
  imports: [NotificationsModule, FriendsModule],
  controllers: [InvitationsController],
  providers: [InvitationsService],
})
export class InvitationsModule {}
