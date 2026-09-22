import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, Req } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { Public } from "../common/decorators/public.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { TokenService } from "../auth/token.service";
import { DiscoveryService } from "./discovery.service";
import { DiscoveryQueryDto } from "./dto/discovery-query.dto";
import { RecordInteractionDto } from "./dto/record-interaction.dto";
import { UpdateDiscoveryPreferencesDto } from "./dto/update-discovery-preferences.dto";

@ApiTags("discovery")
@Controller("discovery")
export class DiscoveryController {
  constructor(
    private readonly discoveryService: DiscoveryService,
    private readonly tokenService: TokenService,
  ) {}

  /**
   * §63 — browsing the feed never requires auth, but it personalizes (feed
   * ranking + pass-cooldown exclusion) when a token is present, same
   * optional-auth pattern as EventsController's slug preview.
   */
  @Public()
  @Get()
  getFeed(@Query() query: DiscoveryQueryDto, @Req() req: Request) {
    return this.discoveryService.getFeed(this.tryExtractUserId(req), query);
  }

  @Get("saved")
  listSaved(@CurrentUser() user: AuthenticatedUser, @Query() query: DiscoveryQueryDto) {
    return this.discoveryService.listSaved(user.id, query);
  }

  @Get("preferences")
  getPreferences(@CurrentUser() user: AuthenticatedUser) {
    return this.discoveryService.getPreferences(user.id);
  }

  @Patch("preferences")
  updatePreferences(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateDiscoveryPreferencesDto) {
    return this.discoveryService.updatePreferences(user.id, dto);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Post(":eventId/interactions")
  recordInteraction(
    @CurrentUser() user: AuthenticatedUser,
    @Param("eventId") eventId: string,
    @Body() dto: RecordInteractionDto,
  ) {
    return this.discoveryService.recordInteraction(user.id, eventId, dto);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Post(":eventId/save")
  saveEvent(@CurrentUser() user: AuthenticatedUser, @Param("eventId") eventId: string) {
    return this.discoveryService.saveEvent(user.id, eventId);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(":eventId/save")
  unsaveEvent(@CurrentUser() user: AuthenticatedUser, @Param("eventId") eventId: string) {
    return this.discoveryService.unsaveEvent(user.id, eventId);
  }

  private tryExtractUserId(req: Request): string | undefined {
    const auth = req.headers.authorization;
    if (!auth?.startsWith("Bearer ")) return undefined;
    return this.tokenService.tryVerifyAccessToken(auth.slice(7))?.sub;
  }
}
