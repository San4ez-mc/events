import { Controller, Get, Query } from "@nestjs/common";
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
  @Get()
  search(@Query() query: SearchQueryDto) {
    return this.searchService.search(query);
  }
}
