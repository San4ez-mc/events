import { Injectable, Logger } from "@nestjs/common";
import { FeatureFlagsService } from "../flags/feature-flags.service";
import { ConfigService } from "@nestjs/config";
import type { EnvConfig } from "../config/env.validation";
import { ApiException } from "../common/exceptions/api.exception";

export interface PlaceSuggestion {
  placeId: string;
  primary: string;
  secondary: string | null;
  description: string;
}

export interface PlaceDetails {
  placeId: string;
  formattedAddress: string;
  latitude: number;
  longitude: number;
}

const AUTOCOMPLETE_URL = "https://places.googleapis.com/v1/places:autocomplete";
const DETAILS_URL = "https://places.googleapis.com/v1/places";
const TTL_MS = 10 * 60 * 1000;

/**
 * §12/§60 — Google Places API (New): autocomplete + place details, proxied
 * through the API so the (IP-restricted) server key never reaches clients and
 * web + mobile share one integration. Details are cached in memory: once an
 * event stores its coordinates the Places API is never queried again on view.
 */
@Injectable()
export class PlacesService {
  private readonly logger = new Logger(PlacesService.name);
  private readonly apiKey: string | undefined;
  private readonly cache = new Map<
    string,
    { at: number; value: PlaceDetails }
  >();

  constructor(
    configService: ConfigService<EnvConfig, true>,
    private readonly flags: FeatureFlagsService,
  ) {
    this.apiKey = configService.get("GOOGLE_MAPS_API_KEY", { infer: true });
  }

  private requireKey(): string {
    if (!this.apiKey)
      throw new ApiException(
        "PLACES_UNAVAILABLE",
        "Address search is not configured",
        503,
      );
    return this.apiKey;
  }

  async autocomplete(
    input: string,
    sessionToken: string | undefined,
    locale: "uk" | "en",
  ): Promise<PlaceSuggestion[]> {
    await this.flags.assertEnabled("PLACES_AUTOCOMPLETE");
    const key = this.requireKey();
    const res = await fetch(AUTOCOMPLETE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key },
      body: JSON.stringify({
        input,
        sessionToken,
        languageCode: locale,
        includedRegionCodes: ["ua"],
      }),
      signal: AbortSignal.timeout(8000),
    }).catch((error: unknown) => {
      this.logger.warn(`Places autocomplete failed: ${String(error)}`);
      return null;
    });
    if (!res || !res.ok) {
      if (res) this.logger.warn(`Places autocomplete HTTP ${res.status}`);
      throw new ApiException(
        "PLACES_UNAVAILABLE",
        "Address search is temporarily unavailable",
        503,
      );
    }

    const body = (await res.json()) as {
      suggestions?: {
        placePrediction?: {
          placeId: string;
          text?: { text?: string };
          structuredFormat?: {
            mainText?: { text?: string };
            secondaryText?: { text?: string };
          };
        };
      }[];
    };

    return (body.suggestions ?? [])
      .map((s) => s.placePrediction)
      .filter((p): p is NonNullable<typeof p> => !!p)
      .slice(0, 6)
      .map((p) => ({
        placeId: p.placeId,
        primary: p.structuredFormat?.mainText?.text ?? p.text?.text ?? "",
        secondary: p.structuredFormat?.secondaryText?.text ?? null,
        description: p.text?.text ?? p.structuredFormat?.mainText?.text ?? "",
      }));
  }

  async details(
    placeId: string,
    sessionToken: string | undefined,
    locale: "uk" | "en",
  ): Promise<PlaceDetails> {
    const cacheKey = `${placeId}:${locale}`;
    const hit = this.cache.get(cacheKey);
    if (hit && Date.now() - hit.at < TTL_MS) return hit.value;

    const key = this.requireKey();
    const url = `${DETAILS_URL}/${encodeURIComponent(placeId)}?languageCode=${locale}${sessionToken ? `&sessionToken=${encodeURIComponent(sessionToken)}` : ""}`;
    const res = await fetch(url, {
      headers: {
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": "id,formattedAddress,location",
      },
      signal: AbortSignal.timeout(8000),
    }).catch(() => null);
    if (!res || !res.ok)
      throw new ApiException(
        "PLACES_UNAVAILABLE",
        "Address search is temporarily unavailable",
        503,
      );

    const body = (await res.json()) as {
      id?: string;
      formattedAddress?: string;
      location?: { latitude: number; longitude: number };
    };
    if (!body.location || !body.formattedAddress) {
      throw new ApiException(
        "PLACES_UNAVAILABLE",
        "Place has no location",
        503,
      );
    }
    const value: PlaceDetails = {
      placeId: body.id ?? placeId,
      formattedAddress: body.formattedAddress,
      latitude: body.location.latitude,
      longitude: body.location.longitude,
    };
    this.cache.set(cacheKey, { at: Date.now(), value });
    if (this.cache.size > 500)
      this.cache.delete(this.cache.keys().next().value as string);
    return value;
  }
}
