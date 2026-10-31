import { hasUtcOffset, kyivLocalToDate } from "../../common/utils/kyiv-time";
import { classify, EXCLUDE_TITLE } from "./classify";
import { decodeEntities, stripTags } from "./html";
import type { ExternalEvent, ParseResult } from "./types";

type Json = Record<string, unknown>;
const EVENT_TYPE = /(^|[^A-Za-z])(Event|MusicEvent|TheaterEvent|ComedyEvent|DanceEvent|Festival|ExhibitionEvent|SportsEvent|EducationEvent|ScreeningEvent)$/;

const asArray = <T>(v: T | T[] | undefined | null): T[] => (v == null ? [] : Array.isArray(v) ? v : [v]);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

export function sitemapLocs(xml: string): string[] {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => decodeEntities(m[1]!.trim()));
}

/** Every schema.org Event object in the page's JSON-LD blocks (top level, arrays and @graph). */
export function findEventNodes(html: string): Json[] {
  const found: Json[] = [];
  const visit = (node: unknown): void => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) return node.forEach(visit);
    const obj = node as Json;
    const types = asArray(obj["@type"] as string | string[]).map(String);
    if (types.some((t) => EVENT_TYPE.test(t)) && obj.startDate) found.push(obj);
    visit(obj["@graph"]);
  };
  for (const m of html.matchAll(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      visit(JSON.parse(m[1]!.trim()));
    } catch {
      // a broken block on the page: ignore it, other blocks may be fine
    }
  }
  return found;
}

function toDate(value: unknown): Date | null {
  const s = str(value);
  if (!s) return null;
  if (hasUtcOffset(s)) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return kyivLocalToDate(s);
}

function imageOf(node: Json): string | null {
  const first = asArray(node.image as unknown)[0];
  const url = typeof first === "string" ? first : first && typeof first === "object" ? str((first as Json).url) : null;
  return url && /^https:\/\//.test(url) ? url : null;
}

function prices(node: Json): { min: number | null; max: number | null } {
  const nums: number[] = [];
  for (const offer of asArray(node.offers as Json | Json[])) {
    for (const key of ["price", "lowPrice", "highPrice"]) {
      const n = Number(offer?.[key]);
      if (Number.isFinite(n) && n > 0) nums.push(n);
    }
    const spec = offer?.priceSpecification as Json | undefined;
    for (const key of ["minPrice", "maxPrice", "price"]) {
      const n = Number(spec?.[key]);
      if (Number.isFinite(n) && n > 0) nums.push(n);
    }
  }
  if (nums.length === 0) return { min: null, max: null };
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  return { min, max: max > min ? max : null };
}

export function parseJsonLdEvent(html: string, url: string, source: string): ParseResult {
  const node = findEventNodes(html)[0];
  if (!node) return { skip: "no event data" };

  const status = str(node.eventStatus) ?? "";
  if (/Cancelled|Postponed/i.test(status)) return { skip: "cancelled or postponed" };
  const mode = str(node.eventAttendanceMode) ?? "";
  const title = str(node.name);
  if (!title) return { skip: "no title" };
  if (EXCLUDE_TITLE.test(title)) return { skip: "not for a general audience" };

  const startsAt = toDate(node.startDate);
  if (!startsAt) return { skip: "bad date" };
  const endsAt = toDate(node.endDate);

  const place = asArray(node.location as Json | Json[])[0];
  const addr = place?.address as Json | string | undefined;
  const street = typeof addr === "string" ? addr : str(addr?.streetAddress);
  const city = typeof addr === "object" && addr ? str(addr.addressLocality) : null;
  const venue = str(place?.name);
  if (!venue && !street) return { skip: "no venue" };
  // Some sites (kontramarka) mark every event Online; a street address means it is a real place.
  if (/Online/i.test(mode) && !/Mixed|Offline/i.test(mode) && !street) return { skip: "online event" };

  const { min, max } = prices(node);
  const description = stripTags(str(node.description) ?? "").slice(0, 6000);
  const types = asArray(node["@type"] as string | string[]).map(String);
  const organizer = str((asArray(node.organizer as Json | Json[])[0] as Json | undefined)?.name);
  const ref = url.replace(/^https?:\/\/[^/]+/, "").replace(/[?#].*$/, "").replace(/\/$/, "");

  const event: ExternalEvent = {
    source,
    sourceRef: ref,
    url,
    title: title.slice(0, 200),
    description,
    startsAt,
    endsAt: endsAt && endsAt > startsAt ? endsAt : null,
    timeKnown: true,
    venue,
    address: [venue, street].filter(Boolean).join(", "),
    city,
    priceMin: min,
    priceMax: max,
    imageUrl: imageOf(node),
    categorySlug: classify(`${title}\n${description.slice(0, 600)}`, types.find((t) => /Event$/.test(t))),
    ageRestriction: /(^|\D)18\+/.test(`${title} ${description}`) ? 18 : 0,
    organizerName: organizer,
  };
  return { event };
}

/** Section of the site a page sits in ("STAND-UP", "ЗООПАРК"): the second item of its breadcrumb trail. */
export function breadcrumbCategory(html: string): string | null {
  for (const m of html.matchAll(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const data = JSON.parse(m[1]!.trim()) as Json | Json[];
      for (const node of asArray(data)) {
        if (node["@type"] !== "BreadcrumbList") continue;
        const items = asArray(node.itemListElement as Json | Json[]);
        if (items.length < 3) return null;
        const second = items[1]!;
        const inner = second.item && typeof second.item === "object" ? str((second.item as Json).name) : null;
        return str(second.name) ?? inner;
      }
    } catch {
      // not a usable block: look at the next one
    }
  }
  return null;
}

/** kontramarka.ua also sells permanent attractions (zoo, museums, aquarium) that show up as events with a date for every single day. */
const ATTRACTION_SECTION = /зоопарк|музей|океанарі|акваріум|екскурс|квест|атракціон|планетарі|ферма|лабіринт/i;
const DAILY_ATTRACTION_DATES = 14;

export function parseKontramarkaEvent(html: string, url: string): ParseResult {
  const section = breadcrumbCategory(html);
  if (section && ATTRACTION_SECTION.test(section)) return { skip: "attraction, not an event" };
  if (findEventNodes(html).length >= DAILY_ATTRACTION_DATES) return { skip: "attraction with a date for every day" };
  return parseJsonLdEvent(html, url, "kontramarka");
}
