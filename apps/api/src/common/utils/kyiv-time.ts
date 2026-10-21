/** Calendar math in the product's home timezone — the server runs in UTC, but "this weekend" means Kyiv's. */
const TZ = "Europe/Kyiv";

function tzOffsetMs(at: Date): number {
  const local = new Date(at.toLocaleString("en-US", { timeZone: TZ }));
  const utc = new Date(at.toLocaleString("en-US", { timeZone: "UTC" }));
  return local.getTime() - utc.getTime();
}

/** Kyiv's calendar date (y, m 1-12, d) for an instant. */
function kyivYmd(at: Date): [number, number, number] {
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(at).split("-").map(Number);
  return [y!, m!, d!];
}

/** 0 = Sunday ... 6 = Saturday, in Kyiv. */
export function kyivWeekday(at: Date): number {
  const [y, m, d] = kyivYmd(at);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** The instant the Kyiv calendar day `daysFromToday` days after `from`'s day begins (00:00 Kyiv). */
export function kyivDayStart(from: Date, daysFromToday = 0): Date {
  const [y, m, d] = kyivYmd(from);
  const guess = new Date(Date.UTC(y, m - 1, d + daysFromToday));
  return new Date(guess.getTime() - tzOffsetMs(guess));
}

/** ISO-8601 week key of Kyiv's date, e.g. "2026-W42" — a stable once-per-week dedupe handle. */
export function kyivIsoWeek(at: Date): string {
  const [y, m, d] = kyivYmd(at);
  const date = new Date(Date.UTC(y, m - 1, d));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** True when an ISO date-time string already says which timezone it is in ("Z" or "+03:00" after a time part). */
export function hasUtcOffset(iso: string): boolean {
  return /[T ]\d{2}:\d{2}.*(Z|[+-]\d{2}(:?\d{2})?)$/i.test(iso.trim());
}

/**
 * Reads a zone-less ISO date/time ("2026-10-20T19:00", "2026-10-20 19:00:00" or a bare date) as Kyiv wall-clock time.
 * The server runs in UTC, so `new Date("2026-10-20T19:00")` would silently be 22:00 in Kyiv. Null if it isn't that shape.
 */
export function kyivLocalToDate(local: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?$/.exec(local.trim());
  if (!m) return null;
  const [y, mo, d, h, mi, s] = [m[1], m[2], m[3], m[4] ?? "0", m[5] ?? "0", m[6] ?? "0"].map(Number) as [number, number, number, number, number, number];
  const asUtc = Date.UTC(y, mo - 1, d, h, mi, s);
  // The offset depends on the instant itself (summer/winter time), so settle it in two passes.
  const first = asUtc - tzOffsetMs(new Date(asUtc));
  return new Date(asUtc - tzOffsetMs(new Date(first)));
}
