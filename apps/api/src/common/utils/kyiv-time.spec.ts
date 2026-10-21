import { kyivDayStart, kyivIsoWeek, kyivWeekday } from "./kyiv-time";

describe("kyiv-time", () => {
  it("starts a Kyiv day at 00:00 local: UTC+3 in summer time, UTC+2 in winter time", () => {
    expect(kyivDayStart(new Date("2026-10-16T10:00:00Z")).toISOString()).toBe("2026-10-15T21:00:00.000Z");
    expect(kyivDayStart(new Date("2026-11-20T10:00:00Z")).toISOString()).toBe("2026-11-19T22:00:00.000Z");
  });

  it("uses Kyiv's calendar day even when UTC is still the day before", () => {
    // 22:30 UTC on 15 Oct is already 16 Oct 01:30 in Kyiv.
    expect(kyivDayStart(new Date("2026-10-15T22:30:00Z")).toISOString()).toBe("2026-10-15T21:00:00.000Z");
    expect(kyivWeekday(new Date("2026-10-15T22:30:00Z"))).toBe(5); // Friday
  });

  it("offsets by whole Kyiv days", () => {
    expect(kyivDayStart(new Date("2026-10-15T10:00:00Z"), 1).toISOString()).toBe("2026-10-15T21:00:00.000Z");
    expect(kyivDayStart(new Date("2026-10-15T10:00:00Z"), 4).toISOString()).toBe("2026-10-18T21:00:00.000Z"); // Mon 19 Oct 00:00 — still UTC+3, clocks go back on 25 Oct
  });

  it("gives a stable ISO week key", () => {
    expect(kyivIsoWeek(new Date("2026-10-16T10:00:00Z"))).toBe("2026-W42");
    expect(kyivIsoWeek(new Date("2026-10-19T10:00:00Z"))).toBe("2026-W43");
    expect(kyivIsoWeek(new Date("2026-01-01T10:00:00Z"))).toBe("2026-W01");
  });
});

import { hasUtcOffset, kyivLocalToDate } from "./kyiv-time";

describe("kyivLocalToDate / hasUtcOffset", () => {
  it("reads a zone-less time as Kyiv wall-clock time, in summer and winter", () => {
    expect(kyivLocalToDate("2026-10-20T19:00")?.toISOString()).toBe("2026-10-20T16:00:00.000Z");
    expect(kyivLocalToDate("2026-11-20 19:00:00")?.toISOString()).toBe("2026-11-20T17:00:00.000Z");
    expect(kyivLocalToDate("2026-10-20")?.toISOString()).toBe("2026-10-19T21:00:00.000Z");
  });

  it("is right on the day the clocks go back (25 Oct 2026, 04:00 -> 03:00)", () => {
    expect(kyivLocalToDate("2026-10-25T12:00")?.toISOString()).toBe("2026-10-25T10:00:00.000Z");
  });

  it("returns null for something that is not a date", () => {
    expect(kyivLocalToDate("завтра о сьомій")).toBeNull();
  });

  it("recognises strings that already carry an offset, and a bare date as having none", () => {
    expect(hasUtcOffset("2026-10-20T19:00:00Z")).toBe(true);
    expect(hasUtcOffset("2026-10-20T19:00:00+03:00")).toBe(true);
    expect(hasUtcOffset("2026-10-20T19:00:00-0500")).toBe(true);
    expect(hasUtcOffset("2026-10-20T19:00")).toBe(false);
    expect(hasUtcOffset("2026-10-20")).toBe(false);
  });
});
