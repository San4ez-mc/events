import { Body, Controller, Get, Param, Patch, Post, Query, Req } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { Public } from "../common/decorators/public.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { TokenService } from "../auth/token.service";
import { EventsService } from "./events.service";
import { CreateEventDto } from "./dto/create-event.dto";
import { UpdateEventDto } from "./dto/update-event.dto";
import { ListMyEventsDto } from "./dto/list-my-events.dto";
import { CancelEventDto } from "./dto/cancel-event.dto";
import { RateLimit } from "../common/throttle";

@ApiTags("events")
@Controller("events")
export class EventsController {
  constructor(
    private readonly eventsService: EventsService,
    private readonly tokenService: TokenService,
  ) {}

  @RateLimit(20)
  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateEventDto) {
    return this.eventsService.create(user.id, dto);
  }

  @Get("mine")
  findMine(@CurrentUser() user: AuthenticatedUser, @Query() query: ListMyEventsDto) {
    return this.eventsService.findMine(user.id, query);
  }

  @Get(":id")
  findOne(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.eventsService.findByIdForOwner(id, user.id);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: UpdateEventDto,
  ) {
    return this.eventsService.update(id, user.id, dto);
  }

  @RateLimit(20)
  @Post(":id/publish")
  publish(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.eventsService.publish(id, user.id);
  }

  @Post(":id/cancel")
  cancel(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: CancelEventDto) {
    return this.eventsService.cancel(id, user.id, dto.reason);
  }

  @Post(":id/duplicate")
  duplicate(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.eventsService.duplicate(id, user.id);
  }

  @Get(":id/stats")
  getStats(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.eventsService.getStats(id, user.id);
  }

  /**
   * Public preview by slug. @Public() because published events must be
   * viewable without auth (§63) — the service itself still enforces that
   * unpublished drafts are only visible to their owner via the (optional)
   * bearer token below.
   */
  @Public()
  @Get("slug/:slug")
  findBySlug(@Param("slug") slug: string, @Req() req: Request) {
    const requesterId = this.tryExtractUserId(req);
    return this.eventsService.findBySlugForPreview(slug, requesterId);
  }

  /**
   * @Public() routes don't populate req.user (JwtAuthGuard short-circuits),
   * so we can't use @CurrentUser() here — this endpoint needs to work both
   * for anonymous visitors (published-only) and for the owner previewing an
   * unpublished draft, so we verify the bearer token ourselves (signature +
   * expiry, via TokenService) rather than duplicating this route as two
   * separate guarded/unguarded handlers.
   */
  private tryExtractUserId(req: Request): string | undefined {
    const auth = req.headers.authorization;
    if (!auth?.startsWith("Bearer ")) return undefined;
    return this.tokenService.tryVerifyAccessToken(auth.slice(7))?.sub;
  }
}
