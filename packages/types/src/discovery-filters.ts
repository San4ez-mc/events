/** UX §7 — the full discovery filter set + how it maps to GET /discovery query params (§57). */

export type DatePreset =
  "any" | "today" | "tomorrow" | "weekend" | "date" | "range";
export type TimePreset =
  "any" | "morning" | "day" | "evening" | "night" | "custom";
export type FormatFilter = "any" | "OFFLINE" | "ONLINE";
export type GroupSize = "any" | "1-5" | "5-10" | "10-20" | "20+";

export interface DiscoveryFilters {
  cityId: string | null;
  districtIds: string[];
  categoryIds: string[];
  datePreset: DatePreset;
  /** yyyy-mm-dd, used by the "date" and "range" presets. */
  dateFrom: string;
  dateTo: string;
  timePreset: TimePreset;
  hourFrom: number;
  hourTo: number;
  minPrice: number | null;
  maxPrice: number | null;
  freeOnly: boolean;
  format: FormatFilter;
  adultsOnly: boolean;
  groupSize: GroupSize;
}

export const EMPTY_FILTERS: DiscoveryFilters = {
  cityId: null,
  districtIds: [],
  categoryIds: [],
  datePreset: "any",
  dateFrom: "",
  dateTo: "",
  timePreset: "any",
  hourFrom: 18,
  hourTo: 23,
  minPrice: null,
  maxPrice: null,
  freeOnly: false,
  format: "any",
  adultsOnly: false,
  groupSize: "any",
};

export const PRICE_SLIDER_MAX = 2000;

/** Named day parts (§7 "Час"); night wraps past midnight. */
export const TIME_RANGES: Record<
  Exclude<TimePreset, "any" | "custom">,
  [number, number]
> = {
  morning: [6, 12],
  day: [12, 18],
  evening: [18, 23],
  night: [23, 6],
};

/** How many independent filter groups are set — drives the badge on the filter button. */
export function countActiveFilters(f: DiscoveryFilters): number {
  return [
    f.cityId !== null,
    f.districtIds.length > 0,
    f.categoryIds.length > 0,
    f.datePreset !== "any",
    f.timePreset !== "any",
    f.minPrice !== null || f.maxPrice !== null,
    f.freeOnly,
    f.format !== "any",
    f.adultsOnly,
    f.groupSize !== "any",
  ].filter(Boolean).length;
}

const startOfDay = (d: Date) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
const endOfDay = (d: Date) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

function parseLocalDate(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

/** Resolves the date preset to a [from, to] window in the visitor's local time. */
export function resolveDateWindow(
  f: DiscoveryFilters,
  now = new Date(),
): { from?: Date; to?: Date } {
  switch (f.datePreset) {
    case "today":
      return { from: now, to: endOfDay(now) };
    case "tomorrow": {
      const t = new Date(now);
      t.setDate(now.getDate() + 1);
      return { from: startOfDay(t), to: endOfDay(t) };
    }
    case "weekend": {
      const day = now.getDay(); // 0 Sun … 6 Sat
      const sat = new Date(now);
      sat.setDate(now.getDate() + (day === 0 ? -1 : 6 - day));
      const sun = new Date(sat);
      sun.setDate(sat.getDate() + 1);
      return {
        from: day === 0 || day === 6 ? now : startOfDay(sat),
        to: endOfDay(sun),
      };
    }
    case "date": {
      const d = parseLocalDate(f.dateFrom);
      return d ? { from: startOfDay(d), to: endOfDay(d) } : {};
    }
    case "range": {
      const from = parseLocalDate(f.dateFrom);
      const to = parseLocalDate(f.dateTo);
      return {
        from: from ? startOfDay(from) : undefined,
        to: to ? endOfDay(to) : undefined,
      };
    }
    default:
      return {};
  }
}

export function filtersToQuery(
  f: DiscoveryFilters,
  cursor: string | null,
): string {
  // Tiny platform-neutral query builder (this package has no DOM/Node typings).
  const pairs: string[] = [];
  const p = { set: (key: string, value: string) => void pairs.push(`${key}=${encodeURIComponent(value)}`) };
  if (f.cityId) p.set("cityIds", f.cityId);
  if (f.districtIds.length) p.set("districtIds", f.districtIds.join(","));
  if (f.categoryIds.length) p.set("categoryIds", f.categoryIds.join(","));

  const { from, to } = resolveDateWindow(f);
  if (from) p.set("dateFrom", from.toISOString());
  if (to) p.set("dateTo", to.toISOString());

  if (f.timePreset === "custom") {
    p.set("hourFrom", String(f.hourFrom));
    p.set("hourTo", String(f.hourTo));
  } else if (f.timePreset !== "any") {
    const [a, b] = TIME_RANGES[f.timePreset];
    p.set("hourFrom", String(a));
    p.set("hourTo", String(b));
  }

  if (f.freeOnly) p.set("freeOnly", "true");
  else {
    if (f.minPrice !== null && f.minPrice > 0)
      p.set("minBudget", String(f.minPrice));
    if (f.maxPrice !== null && f.maxPrice < PRICE_SLIDER_MAX)
      p.set("maxBudget", String(f.maxPrice));
  }
  if (f.format !== "any") p.set("format", f.format);
  if (f.adultsOnly) p.set("adultsOnly", "true");

  switch (f.groupSize) {
    case "1-5":
      p.set("capacityMax", "5");
      break;
    case "5-10":
      p.set("capacityMin", "5");
      p.set("capacityMax", "10");
      break;
    case "10-20":
      p.set("capacityMin", "10");
      p.set("capacityMax", "20");
      break;
    case "20+":
      p.set("capacityMin", "20");
      break;
  }

  if (cursor) p.set("cursor", cursor);
  return pairs.join("&");
}
