import { Controller, Get, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import { isLegacyNativeClient } from "../common/utils/client-features";
import { RateLimit } from "../common/throttle";
import { ApiTags } from "@nestjs/swagger";
import { Public } from "../common/decorators/public.decorator";
import { SearchService } from "./search.service";
import { SearchQueryDto } from "./dto/search-query.dto";

/** §56/§63 — search never requires auth. */
@ApiTags("search")
@Controller("search")
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Public()
  @RateLimit(60)
  @Get()
  search(@Query() query: SearchQueryDto, @Req() req: Request) {
    if (isLegacyNativeClient(req)) Object.assign(query, { hideExternal: true }); // not a DTO field: set server-side only
    return this.searchService.search(query);
  }
}
