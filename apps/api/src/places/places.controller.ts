import { Controller, Get, Param, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";
import { PlacesService } from "./places.service";

class AutocompleteQueryDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  q!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  sessionToken?: string;

  @IsOptional()
  @IsIn(["uk", "en"])
  locale?: "uk" | "en";
}

class DetailsQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  sessionToken?: string;

  @IsOptional()
  @IsIn(["uk", "en"])
  locale?: "uk" | "en";
}

/** Address search for the create-event flow. Requires login (organizers only in practice) and is rate-limited (§87). */
@ApiTags("places")
@Controller("places")
export class PlacesController {
  constructor(private readonly places: PlacesService) {}

  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  @Get("autocomplete")
  autocomplete(@Query() query: AutocompleteQueryDto) {
    return this.places.autocomplete(
      query.q,
      query.sessionToken,
      query.locale ?? "uk",
    );
  }

  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @Get(":placeId")
  details(@Param("placeId") placeId: string, @Query() query: DetailsQueryDto) {
    return this.places.details(
      placeId,
      query.sessionToken,
      query.locale ?? "uk",
    );
  }
}
