import { kyivLocalToDate } from "../../common/utils/kyiv-time";
import { classify, EXCLUDE_TITLE } from "./classify";
import { decodeEntities, metaContent, visibleLines } from "./html";
import { hintCity } from "./cities";
import type { ExternalEvent, ParseResult } from "./types";

export const OTTRY_SOURCE = "ottry";
/** Used when the page gives a date but no time (clubs: late evening). */
const DEFAULT_START = "21:00";
const TBA = /^(буде оголошено|tba|tbd|уточнюється)$/i;

export function ottryUrls(sitemapXml: string): string[] {
  return [...sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => decodeEntities(m[1]!)).filter((u) => /^https:\/\/ottry\.com\/events\/[^/?#]+$/.test(u));
}

/** First wall-clock time written in the description: "14:00", "о 19.00". Dates like 31.10 are not times. */
export function findTime(lines: string[]): string | null {
  for (const line of lines) {
    const colon = /(?<![\d.])([01]?\d|2[0-3]):([0-5]\d)(?!\d)/.exec(line);
    if (colon) return `${colon[1]!.padStart(2, "0")}:${colon[2]}`;
    const dot = /(?:^|\s)(?:о|з|від|at|start)\s+([01]?\d|2[0-3])\.([0-5]\d)(?!\d)/i.exec(line);
    if (dot) return `${dot[1]!.padStart(2, "0")}:${dot[2]}`;
  }
  return null;
}

/** Ticket prices listed in the description that aren't sold out ("Final Wave - 1500"). */
export function tierPrices(lines: string[]): number[] {
  const prices: number[] = [];
  for (const line of lines) {
    if (/sold\s*out|розпродан/i.test(line)) continue;
    const m = /^.{2,}?\s[-–—:]\s*(\d{2,5})(?:\s*(?:грн|uah|₴))?\s*$/i.exec(line);
    if (m) prices.push(Number(m[1]));
  }
  return prices;
}

export function parseOttryEvent(html: string, url: string): ParseResult {
  const sourceRef = url.split("/").pop()!;
  const og = metaContent(html, "og:title") ?? "";
  const title = og.replace(/:\s*Купити квитки.*$/i, "").replace(/\s+/g, " ").trim();
  if (!title) return { skip: "no title" };
  if (EXCLUDE_TITLE.test(title)) return { skip: "not for a general audience" };

  const metaDesc = metaContent(html, "description") ?? "";
  const dm = /(\d{2})-(\d{2})-(\d{4})/.exec(metaDesc);
  if (!dm) return { skip: "no date" };
  const date = `${dm[3]}-${dm[2]}-${dm[1]}`;

  const lines = visibleLines(html);
  const dateIdx = lines.findIndex((l) => l === `${dm[1]}-${dm[2]}-${dm[3]}`);
  const priceIdx = lines.findIndex((l) => /^Ціна:\s*від$/i.test(l));
  const descLines = dateIdx >= 0 ? lines.slice(dateIdx + 1, priceIdx > dateIdx ? priceIdx : dateIdx + 40) : [];

  const priceMin = priceIdx >= 0 ? Number(lines[priceIdx + 1]?.replace(/\s/g, "")) : NaN;
  if (!Number.isFinite(priceMin) || priceMin <= 0) return { skip: "no price" };
  const tiers = tierPrices(descLines);
  const priceMax = tiers.length ? Math.max(...tiers) : null;

  const venueIdx = lines.findIndex((l) => /^Місце проведення$/i.test(l));
  let venue: string | null = null;
  if (venueIdx >= 0) {
    const v = lines.slice(venueIdx + 1, venueIdx + 4).find((l) => l !== ":" && !/^Квитки$/i.test(l));
    venue = v ? v.replace(/^:\s*/, "").trim() : null;
  }
  if (!venue || TBA.test(venue)) return { skip: "venue not announced" };

  const description = descLines.join("\n").slice(0, 6000);
  const time = findTime(descLines);
  const startsAt = kyivLocalToDate(`${date}T${time ?? DEFAULT_START}`);
  if (!startsAt) return { skip: "bad date" };

  const image = metaContent(html, "og:image");
  const event: ExternalEvent = {
    source: OTTRY_SOURCE,
    sourceRef,
    url,
    title: title.slice(0, 200),
    description,
    startsAt,
    endsAt: new Date(startsAt.getTime() + 5 * 3_600_000),
    timeKnown: time !== null,
    venue,
    address: venue,
    city: hintCity(venue, title),
    priceMin,
    priceMax: priceMax && priceMax > priceMin ? priceMax : null,
    imageUrl: image && /^https:\/\//.test(image) ? image : null,
    categorySlug: classify(`${title}\n${description}`, undefined, "parties"), // ottry is mostly club nights
    ageRestriction: /(^|\D)18\+|🔞/.test(description) ? 18 : 0,
    organizerName: null,
  };
  return { event };
}
