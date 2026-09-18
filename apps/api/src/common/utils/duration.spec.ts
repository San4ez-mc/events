import { parseDurationToSeconds } from "./duration";

describe("parseDurationToSeconds", () => {
  it.each([
    ["15m", 900],
    ["1h", 3600],
    ["30d", 30 * 86400],
    ["45s", 45],
  ])("parses %s as %i seconds", (input, expected) => {
    expect(parseDurationToSeconds(input)).toBe(expected);
  });

  it("falls back to the default for an unparseable value", () => {
    expect(parseDurationToSeconds("garbage", 42)).toBe(42);
  });

  it("uses the 15-minute default when no fallback is given", () => {
    expect(parseDurationToSeconds("garbage")).toBe(900);
  });
});
