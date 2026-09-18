import { Controller, Get, Param, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Public } from "../common/decorators/public.decorator";
import { GeographyService } from "./geography.service";
import { ListCitiesDto } from "./dto/list-cities.dto";
import { ListDistrictsDto } from "./dto/list-districts.dto";

/**
 * Fully public (§63 — browsing/filters never require auth). Used by the
 * discovery filters, the create-event wizard's location step, and profile
 * city pickers.
 */
@ApiTags("geography")
@Public()
@Controller("geography")
export class GeographyController {
  constructor(private readonly geographyService: GeographyService) {}

  @Get("regions")
  listRegions() {
    return this.geographyService.listRegions();
  }

  @Get("cities")
  listCities(@Query() query: ListCitiesDto) {
    return this.geographyService.listCities(query);
  }

  @Get("cities/:slug")
  getCity(@Param("slug") slug: string) {
    return this.geographyService.getCityBySlug(slug);
  }

  @Get("districts")
  listDistricts(@Query() query: ListDistrictsDto) {
    return this.geographyService.listDistricts(query.cityId);
  }
}
