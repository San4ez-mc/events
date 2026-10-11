import { Module } from "@nestjs/common";
import { NotificationsModule } from "../notifications/notifications.module";
import { InquiriesController } from "./inquiries.controller";
import { InquiriesService } from "./inquiries.service";

@Module({ imports: [NotificationsModule], controllers: [InquiriesController], providers: [InquiriesService] })
export class InquiriesModule {}
