import { Throttle } from "@nestjs/throttler";

/**
 * §87 — per-route rate limit (requests per minute, per IP/user). Under
 * NODE_ENV=test the limit is lifted so e2e suites that log in/register in a
 * tight loop don't trip it; production behaviour is unaffected.
 */
export const RateLimit = (perMinute: number) =>
  Throttle({ default: { ttl: 60_000, limit: process.env.NODE_ENV === "test" ? 10_000 : perMinute } });
