import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { FeedbackController } from "./feedback.controller";
import { FeedbackService } from "./feedback.service";

@Module({ imports: [AuthModule, NotificationsModule], controllers: [FeedbackController], providers: [FeedbackService] })
export class FeedbackModule {}
