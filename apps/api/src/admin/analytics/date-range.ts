import { BadRequestException } from "@nestjs/common";
import { kyivLocalToDate } from "../../common/utils/kyiv-time";

/** A whole-day reporting window in Kyiv time: `from` and `to` are both included. */
export interface DateRange {
  from: string;
  to: string;
  /** Number of calendar days covered. */
  days: number;
  /** Kyiv midnight at the start of `from`, and Kyiv midnight after `to` (exclusive end). */
  start: Date;
  end: Date;
  /** Next day after `to`, as YYYY-MM-DD (exclusive end for HogQL). */
  toExclusive: string;
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 366;

const kyivToday = (): string => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Kyiv" });

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function diffDays(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
}

/**
 * `from`/`to` (YYYY-MM-DD, Kyiv days, both included) win; otherwise the last `days` days ending today (default 30).
 * Everything is validated here, so the dates are safe to interpolate into HogQL.
 */
export function resolveRange(q: { from?: string; to?: string; days?: string }): DateRange {
  let from: string;
  let to: string;
  if (q.from || q.to) {
    to = q.to ?? kyivToday();
    from = q.from ?? to;
    if (!DAY_RE.test(from) || !DAY_RE.test(to) || Number.isNaN(Date.parse(`${from}T12:00:00Z`)) || Number.isNaN(Date.parse(`${to}T12:00:00Z`))) {
      throw new BadRequestException("from and to must be dates like 2026-10-28");
    }
    if (from > to) [from, to] = [to, from];
  } else {
    const parsed = Number.parseInt(q.days ?? "30", 10);
    const days = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), 90) : 30;
    to = kyivToday();
    from = addDays(to, -(days - 1));
  }
  const days = diffDays(from, to) + 1;
  if (days > MAX_DAYS) throw new BadRequestException(`The period can be at most ${MAX_DAYS} days`);
  const toExclusive = addDays(to, 1);
  const start = kyivLocalToDate(`${from}T00:00`);
  const end = kyivLocalToDate(`${toExclusive}T00:00`);
  if (!start || !end) throw new BadRequestException("Invalid period");
  return { from, to, days, start, end, toExclusive };
}

/** HogQL condition for the window (project time zone, same as the daily grouping). */
export function hogqlWindow(range: DateRange): string {
  return `timestamp >= toDateTime('${range.from} 00:00:00') AND timestamp < toDateTime('${range.toExclusive} 00:00:00')`;
}

/** Visits marked `internal` by the apps (staff, review account, listing profiles) are left out of every PostHog report. */
export const HOGQL_NOT_INTERNAL = "coalesce(toString(properties.internal), '') != 'true'";

/** The window plus the internal-traffic filter: what every PostHog report in the admin uses. */
export function hogqlScope(range: DateRange): string {
  return `${hogqlWindow(range)} AND ${HOGQL_NOT_INTERNAL}`;
}

export const rangeKey = (r: DateRange): string => `${r.from}|${r.to}`;
