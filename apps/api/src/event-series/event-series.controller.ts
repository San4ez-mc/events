import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { EventSeriesService } from "./event-series.service";
import { CreateSeriesDto } from "./dto/create-series.dto";
import { UpdateSeriesDto } from "./dto/update-series.dto";

@ApiTags("event-series")
@Controller()
export class EventSeriesController {
  constructor(private readonly eventSeriesService: EventSeriesService) {}

  @Post("events/:eventId/series")
  createSeries(
    @CurrentUser() user: AuthenticatedUser,
    @Param("eventId") eventId: string,
    @Body() dto: CreateSeriesDto,
  ) {
    return this.eventSeriesService.createSeries(eventId, user.id, dto);
  }

  @Get("event-series/:seriesId/occurrences")
  listOccurrences(@CurrentUser() user: AuthenticatedUser, @Param("seriesId") seriesId: string) {
    return this.eventSeriesService.listOccurrences(seriesId, user.id);
  }

  @Patch("event-series/:seriesId")
  updateUpcoming(@CurrentUser() user: AuthenticatedUser, @Param("seriesId") seriesId: string, @Body() dto: UpdateSeriesDto) {
    return this.eventSeriesService.updateUpcoming(seriesId, user.id, dto);
  }

  @Delete("event-series/:seriesId/upcoming-drafts")
  deleteUpcomingDrafts(@CurrentUser() user: AuthenticatedUser, @Param("seriesId") seriesId: string) {
    return this.eventSeriesService.deleteUpcomingDrafts(seriesId, user.id);
  }
}
