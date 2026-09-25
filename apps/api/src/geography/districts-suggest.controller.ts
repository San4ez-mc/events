import { Body, Controller, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { RateLimit } from "../common/throttle";
import { GeographyService } from "./geography.service";
import { SuggestDistrictDto } from "./dto/suggest-district.dto";

/** Authenticated counterpart to the public GeographyController (which is @Public at class level). */
@ApiTags("geography")
@Controller("geography/districts")
export class DistrictsSuggestController {
  constructor(private readonly geographyService: GeographyService) {}

  @RateLimit(10)
  @Post()
  suggest(@CurrentUser() user: AuthenticatedUser, @Body() dto: SuggestDistrictDto) {
    return this.geographyService.suggestDistrict(user.id, dto);
  }
}
