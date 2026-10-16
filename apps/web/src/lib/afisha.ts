/** Landing-page ("афіша") filters that live in the URL: /afisha/<city> and /afisha/<city>/<filter>. */
export const AFISHA_FILTERS = ["today", "weekend", "free"] as const;
export type AfishaFilter = (typeof AFISHA_FILTERS)[number];

const TZ = "Europe/Kyiv";

function kyivYmd(at: Date): [number, number, number] {
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(at).split("-").map(Number);
  return [y!, m!, d!];
}

function kyivDayStart(from: Date, daysFromToday: number): Date {
  const [y, m, d] = kyivYmd(from);
  const guess = new Date(Date.UTC(y, m - 1, d + daysFromToday));
  const local = new Date(guess.toLocaleString("en-US", { timeZone: TZ }));
  const utc = new Date(guess.toLocaleString("en-US", { timeZone: "UTC" }));
  return new Date(guess.getTime() - (local.getTime() - utc.getTime()));
}

function kyivWeekday(at: Date): number {
  const [y, m, d] = kyivYmd(at);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Date window (ISO strings) for the date-based filters, or null for "no date limit". */
export function dateWindow(filter: AfishaFilter | null, now = new Date()): { dateFrom: string; dateTo: string } | null {
  if (filter === "today") return { dateFrom: now.toISOString(), dateTo: kyivDayStart(now, 1).toISOString() };
  if (filter === "weekend") {
    const dow = kyivWeekday(now);
    // Fri-Sun: during the weekend itself it starts now, otherwise on the coming Friday.
    const onWeekend = dow === 0 || dow === 6 || dow === 5;
    const from = onWeekend ? now : kyivDayStart(now, (5 - dow + 7) % 7);
    const mondayIn = dow === 0 ? 1 : (8 - dow) % 7 || 7;
    return { dateFrom: from.toISOString(), dateTo: kyivDayStart(now, mondayIn).toISOString() };
  }
  return null;
}
