/**
 * Parses a human-friendly duration string ("15m", "30d", "2h") into seconds.
 * Used instead of passing the raw string straight to jsonwebtoken's
 * `expiresIn`, whose TS type only accepts `number | StringValue` (a template
 * literal type from the `ms` package) — a plain `string` from env config
 * doesn't structurally match that, so we normalize to a number everywhere.
 */
export function parseDurationToSeconds(value: string, fallbackSeconds = 900): number {
  const match = /^(\d+)([smhd])$/.exec(value);
  if (!match) return fallbackSeconds;
  const amount = Number(match[1]);
  const unit = match[2] as "s" | "m" | "h" | "d";
  const multiplier = { s: 1, m: 60, h: 3600, d: 86400 }[unit];
  return amount * multiplier;
}
