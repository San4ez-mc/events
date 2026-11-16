import sharp from "sharp";
import { dayLabel, isCalmEvent, priceLabel, renderShareImage, themeFor, venueLabel, wrapText, type ShareImageFormat, type ShareImageVariant } from "./share-image.render";

const NOW = new Date("2026-11-14T09:00:00Z"); // 11:00 in Kyiv

describe("share image labels", () => {
  it("names the day in Kyiv time", () => {
    expect(dayLabel(new Date("2026-11-14T16:00:00Z"), NOW)).toBe("Сьогодні");
    expect(dayLabel(new Date("2026-11-15T16:00:00Z"), NOW)).toBe("Завтра");
    expect(dayLabel(new Date("2026-11-17T16:00:00Z"), NOW)).toBe("Через 3 дні");
    expect(dayLabel(new Date("2026-11-20T16:00:00Z"), NOW)).toBe("Через 6 днів");
    expect(dayLabel(new Date("2026-12-04T16:00:00Z"), NOW)).toMatch(/4 грудня/);
    // 23:30 UTC is already tomorrow in Kyiv (UTC+2 in winter).
    expect(dayLabel(new Date("2026-11-14T23:30:00Z"), NOW)).toBe("Завтра");
    expect(dayLabel(new Date("2026-11-10T16:00:00Z"), NOW)).toMatch(/10 листопада/);
  });

  it("shows the price the way people read it", () => {
    expect(priceLabel("FREE")).toBe("Безкоштовно");
    expect(priceLabel("DONATION")).toBe("Донат");
    expect(priceLabel("PAID", 390)).toBe("390 грн");
    expect(priceLabel("PAID", 390, 2700)).toBe("від 390 грн");
    expect(priceLabel("PAID", 19.5, null, "EUR")).toBe("19.5 EUR");
    expect(priceLabel("PAID", null)).toBeNull();
    expect(priceLabel("PAID", 0)).toBeNull();
  });

  it("takes the venue, not the whole address", () => {
    expect(venueLabel("Будинок кіно, вул. Саксаганського, 6", "Київ")).toBe("Будинок кіно");
    expect(venueLabel("вул. Хрещатик, 1", "Київ")).toBe("вул. Хрещатик, 1");
    expect(venueLabel("Київ, Театр на Подолі", "Київ")).toBe("Театр на Подолі");
    expect(venueLabel(null)).toBeNull();
    expect(venueLabel("Дуже довга назва закладу, що не вміщається в один рядок картки")!.length).toBeLessThanOrEqual(34);
  });

  it("wraps and truncates titles", () => {
    expect(wrapText("Курган і Agregat. 100% на ЗСУ", 21, 3)).toEqual(["Курган і Agregat.", "100% на ЗСУ"]);
    expect(wrapText("слово ".repeat(40).trim(), 12, 2)).toHaveLength(2);
    // The cut falls on a word boundary, so a long title never ends in half a word.
    expect(wrapText("Фестиваль вуличної їжі та крафтового пива просто неба у центрі міста", 21, 3)).toEqual(["Фестиваль вуличної", "їжі та крафтового", "пива просто неба…"]);
    expect(wrapText("Коротка назва", 21, 3)).toEqual(["Коротка назва"]);
  });
});

describe("share image theme", () => {
  const base = { title: "Концерт", description: null, free: false };

  it("follows the category, free events are green", () => {
    expect(themeFor({ ...base, categorySlugs: ["concerts"] }).from).toBe("#6d28d9");
    expect(themeFor({ ...base, categorySlugs: ["parties"] }).to).toBe("#ec4899");
    expect(themeFor({ ...base, categorySlugs: ["sport-yoga", "sport"] }).from).toBe("#c2410c");
    expect(themeFor({ ...base, categorySlugs: ["board-games"] }).from).toBe("#8b5cf6"); // brand default
    expect(themeFor({ ...base, free: true, categorySlugs: ["concerts"] }).from).toBe("#15803d");
    expect(themeFor({ ...base, categorySlugs: [undefined, "culture"] }).from).toBe("#0f766e"); // falls back to the parent
  });

  it("makes fundraisers and remembrance events calm, whatever the category or price", () => {
    expect(isCalmEvent("Курган і Agregat. 100% на ЗСУ")).toBe(true);
    expect(isCalmEvent("Вечір пам'яті героїв")).toBe(true);
    expect(isCalmEvent("Вечірка", "Усі кошти збираємо на військо, приходьте")).toBe(true);
    expect(isCalmEvent("Хелловін-вечірка", "Dj-сети до ранку")).toBe(false);
    const calm = themeFor({ title: "Благодійний концерт", description: null, free: true, categorySlugs: ["concerts"] });
    expect(calm.calm).toBe(true);
  });
});

describe("renderShareImage", () => {
  const photo = () => sharp({ create: { width: 800, height: 600, channels: 3, background: "#d97706" } }).png().toBuffer();
  const data = (variant: ShareImageVariant, format: ShareImageFormat, withPhoto: boolean) => async () => ({
    title: "Курган і Agregat. 100% на ЗСУ",
    startsAt: new Date("2026-11-15T16:00:00Z"),
    city: "Київ",
    venue: "Будинок кіно",
    price: "від 390 грн",
    theme: themeFor({ title: "Концерт", free: false, categorySlugs: ["concerts"] }),
    photo: withPhoto ? await photo() : null,
    variant,
    format,
    now: NOW,
  });

  const cases: Array<[ShareImageVariant, ShareImageFormat, boolean]> = [];
  for (const variant of [1, 2, 3] as const) for (const format of ["story", "post"] as const) for (const withPhoto of [true, false]) cases.push([variant, format, withPhoto]);

  it.each(cases)("variant %i, %s, photo=%s gives a full-size JPEG", async (variant, format, withPhoto) => {
    const out = await renderShareImage(await data(variant, format, withPhoto)());
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe("jpeg");
    expect(meta.width).toBe(1080);
    expect(meta.height).toBe(format === "story" ? 1920 : 1350);
  });

  it("copes with missing optional facts", async () => {
    const out = await renderShareImage({ title: "Подія", startsAt: null, city: "", venue: null, price: null, theme: themeFor({ title: "Подія", free: false, categorySlugs: [] }), photo: null, variant: 1, format: "story" });
    expect((await sharp(out).metadata()).height).toBe(1920);
  });
});
