import type { RecurrenceType } from "@kiro/types";

/** Hard safety cap regardless of what count/until allow — never generate a runaway series. */
export const MAX_OCCURRENCES = 52;

export interface RecurrenceRule {
  recurrenceType: RecurrenceType;
  interval?: number;
  count?: number;
  until?: string;
}

/**
 * §29 — expands a recurrence rule into concrete occurrence start dates,
 * starting from (and including) `firstStartsAt`. Deliberately not a general
 * RRULE engine — just the seven patterns the spec explicitly lists.
 */
export function generateOccurrenceDates(firstStartsAt: Date, rule: RecurrenceRule): Date[] {
  const interval = rule.interval ?? 1;
  const until = rule.until ? new Date(rule.until) : undefined;
  const maxCount = Math.min(rule.count ?? MAX_OCCURRENCES, MAX_OCCURRENCES);

  const dates: Date[] = [firstStartsAt];
  let cursor = firstStartsAt;

  while (dates.length < maxCount) {
    cursor = nextDate(cursor, rule.recurrenceType, interval);
    if (until && cursor > until) break;
    dates.push(cursor);
  }

  return dates;
}

function nextDate(from: Date, type: RecurrenceType, interval: number): Date {
  const next = new Date(from);
  switch (type) {
    case "DAILY":
      next.setDate(next.getDate() + 1);
      return next;
    case "EVERY_N_DAYS":
      next.setDate(next.getDate() + interval);
      return next;
    case "WEEKLY":
    case "SPECIFIC_WEEKDAY":
      next.setDate(next.getDate() + 7);
      return next;
    case "EVERY_N_WEEKS":
      next.setDate(next.getDate() + 7 * interval);
      return next;
    case "SPECIFIC_DAY_OF_MONTH":
      next.setMonth(next.getMonth() + 1);
      return next;
    case "EVERY_N_MONTHS":
      next.setMonth(next.getMonth() + interval);
      return next;
    default:
      // Exhaustiveness guard — every RecurrenceType above is handled.
      throw new Error(`Unsupported recurrence type: ${type as string}`);
  }
}
