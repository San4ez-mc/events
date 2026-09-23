import { Module } from "@nestjs/common";
import { EventsModule } from "../events/events.module";
import { UsersModule } from "../users/users.module";
import { CategoriesModule } from "../categories/categories.module";
import { GeographyModule } from "../geography/geography.module";
import { CreditsModule } from "../credits/credits.module";
import { PaymentsModule } from "../payments/payments.module";
import { ReportsModule } from "../reports/reports.module";
import { AdminUsersController } from "./users/admin-users.controller";
import { AdminEventsController } from "./events/admin-events.controller";
import { AdminEventsService } from "./events/admin-events.service";
import { AdminModerationController } from "./moderation/admin-moderation.controller";
import { AdminModerationService } from "./moderation/admin-moderation.service";
import { AdminReportsController } from "./reports/admin-reports.controller";
import { AdminCategoriesController } from "./categories/admin-categories.controller";
import { AdminDistrictsController } from "./districts/admin-districts.controller";
import { AdminCreditsController } from "./credits/admin-credits.controller";
import { AdminPaymentsController } from "./payments/admin-payments.controller";
import { AdminAuditController } from "./audit/admin-audit.controller";
import { AdminAnalyticsController } from "./analytics/admin-analytics.controller";
import { AdminAnalyticsService } from "./analytics/admin-analytics.service";

/** §72/§73/§115 Phase 10 — every `/admin/*` route. Access is gated per-controller via `@Roles`, not here. */
@Module({
  imports: [EventsModule, UsersModule, CategoriesModule, GeographyModule, CreditsModule, PaymentsModule, ReportsModule],
  controllers: [
    AdminUsersController,
    AdminEventsController,
    AdminModerationController,
    AdminReportsController,
    AdminCategoriesController,
    AdminDistrictsController,
    AdminCreditsController,
    AdminPaymentsController,
    AdminAuditController,
    AdminAnalyticsController,
  ],
  providers: [AdminEventsService, AdminModerationService, AdminAnalyticsService],
})
export class AdminModule {}
