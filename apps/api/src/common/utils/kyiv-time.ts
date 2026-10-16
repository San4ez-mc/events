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
