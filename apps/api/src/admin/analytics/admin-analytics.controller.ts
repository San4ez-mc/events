import { Controller, Get, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Roles } from "../../common/decorators/roles.decorator";
import { AdminAnalyticsService } from "./admin-analytics.service";
import { TrafficService } from "./traffic.service";
import { InsightsService } from "./insights.service";
import { GrowthService } from "./growth.service";
import { resolveRange } from "./date-range";

/** §72. */
@ApiTags("admin")
@Roles("ADMIN", "SUPER_ADMIN")
@Controller("admin/analytics")
export class AdminAnalyticsController {
  constructor(
    private readonly adminAnalyticsService: AdminAnalyticsService,
    private readonly trafficService: TrafficService,
    private readonly insightsService: InsightsService,
    private readonly growthService: GrowthService,
  ) {}

  @Get()
  getSummary() {
    return this.adminAnalyticsService.getSummary();
  }

  /** Website + app visitors from PostHog (see TrafficService). Period: `from`/`to` (YYYY-MM-DD, Kyiv days) or the last `days` (1-90). */
  @Get("traffic")
  getTraffic(@Query("days") days?: string, @Query("from") from?: string, @Query("to") to?: string) {
    return this.trafficService.getReport(resolveRange({ days, from, to }));
  }

  /** Funnels / activation / retention / search terms (PostHog) + supply-demand, payments, referrals, notification delivery (database). */
  @Get("insights")
  getInsights(@Query("days") days?: string, @Query("from") from?: string, @Query("to") to?: string) {
    return this.insightsService.getReport(resolveRange({ days, from, to }));
  }

  /** New users, new event registrations and the share of registered people who actually came (organizers' post-event reports). Database only, so it is fast. */
  @Get("growth")
  getGrowth(@Query("days") days?: string, @Query("from") from?: string, @Query("to") to?: string) {
    return this.growthService.getReport(resolveRange({ days, from, to }));
  }
}
