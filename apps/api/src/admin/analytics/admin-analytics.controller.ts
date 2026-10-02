import { Controller, Get, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Roles } from "../../common/decorators/roles.decorator";
import { AdminAnalyticsService } from "./admin-analytics.service";
import { TrafficService } from "./traffic.service";
import { InsightsService } from "./insights.service";

/** §72. */
@ApiTags("admin")
@Roles("ADMIN", "SUPER_ADMIN")
@Controller("admin/analytics")
export class AdminAnalyticsController {
  constructor(
    private readonly adminAnalyticsService: AdminAnalyticsService,
    private readonly trafficService: TrafficService,
    private readonly insightsService: InsightsService,
  ) {}

  @Get()
  getSummary() {
    return this.adminAnalyticsService.getSummary();
  }

  /** Website + app visitors from PostHog (see TrafficService). `days` is clamped to 1–90. */
  @Get("traffic")
  getTraffic(@Query("days") days?: string) {
    const parsed = Number.parseInt(days ?? "30", 10);
    return this.trafficService.getReport(Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), 90) : 30);
  }

  /** Funnels / activation / retention / search terms (PostHog) + supply-demand, payments, referrals, notification delivery (database). */
  @Get("insights")
  getInsights(@Query("days") days?: string) {
    const parsed = Number.parseInt(days ?? "30", 10);
    return this.insightsService.getReport(Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), 90) : 30);
  }
}
