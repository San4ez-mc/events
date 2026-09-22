import { SensitiveContentService } from "./sensitive-content.service";

describe("SensitiveContentService", () => {
  const service = new SensitiveContentService();

  it("allows ordinary content", () => {
    expect(service.scan("Настільний теніс у парку", "Приходьте пограти в теніс!")).toEqual({
      decision: "ALLOW",
    });
  });

  it("allows null/undefined/empty parts without throwing", () => {
    expect(service.scan(null, undefined, "")).toEqual({ decision: "ALLOW" });
  });

  describe("Cyrillic word-boundary matching", () => {
    // Regression test: JS regex `\b` is ASCII-only (defined via `\w`), so it
    // silently fails to find a boundary next to Cyrillic text even with the
    // `u` flag — this is what a failing e2e test caught originally.
    it("flags war-related content in inflected Ukrainian forms", () => {
      const result = service.scan(null, "Благодійний захід на підтримку ЗСУ під час війни.", null);
      expect(result.decision).toBe("FLAG");
      expect(result).toMatchObject({ reasonCode: "WAR_RELATED" });
    });

    it("does not flag unrelated words that merely contain the substring", () => {
      // "війна" as a real word should flag; a word that only *contains* the
      // fragment without being a boundary-matched instance should not.
      const result = service.scan(null, "Це слово міжвійнатись — вигадане, не має стосунку.", null);
      expect(result.decision).toBe("ALLOW");
    });
  });

  describe("hard-rejected content", () => {
    it("rejects weapon sale offers", () => {
      const result = service.scan("Продаж зброї", null, null);
      expect(result).toMatchObject({ decision: "REJECT", reasonCode: "SENSITIVE_KEYWORDS" });
    });

    it("rejects sexual-services content", () => {
      const result = service.scan(null, "Пропоную секс послуги, дзвоніть.", null);
      expect(result).toMatchObject({ decision: "REJECT", reasonCode: "SENSITIVE_KEYWORDS" });
    });

    it("takes priority over a flag when both would match", () => {
      const result = service.scan("Продаж зброї під час війни", null, null);
      expect(result.decision).toBe("REJECT");
    });
  });
});
