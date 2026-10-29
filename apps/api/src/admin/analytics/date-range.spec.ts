import { hogqlWindow, resolveRange } from "./date-range";

describe("resolveRange", () => {
  it("covers both ends of an explicit period, in Kyiv days", () => {
    const r = resolveRange({ from: "2026-10-01", to: "2026-10-07" });
    expect(r.days).toBe(7);
    expect(r.toExclusive).toBe("2026-10-08");
    expect(r.start.toISOString()).toBe("2026-09-30T21:00:00.000Z");
    expect(hogqlWindow(r)).toBe("timestamp >= toDateTime('2026-10-01 00:00:00') AND timestamp < toDateTime('2026-10-08 00:00:00')");
  });

  it("treats a single day (from = to) as one day and swaps reversed dates", () => {
    expect(resolveRange({ from: "2026-10-28", to: "2026-10-28" }).days).toBe(1);
    expect(resolveRange({ from: "2026-10-10", to: "2026-10-01" }).from).toBe("2026-10-01");
  });

  it("falls back to the last N days, clamped to 1-90", () => {
    expect(resolveRange({ days: "7" }).days).toBe(7);
    expect(resolveRange({ days: "9999" }).days).toBe(90);
    expect(resolveRange({}).days).toBe(30);
  });

  it("rejects anything that is not a plain date (it ends up in HogQL) and periods over a year", () => {
    expect(() => resolveRange({ from: "2026-10-01'; DROP", to: "2026-10-07" })).toThrow();
    expect(() => resolveRange({ from: "2026-13-45", to: "2026-14-01" })).toThrow();
    expect(() => resolveRange({ from: "2025-01-01", to: "2026-10-07" })).toThrow();
  });
});
