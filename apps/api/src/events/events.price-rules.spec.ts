import { EventsService } from "./events.service";

describe("price rules of a paid event", () => {
  // The two checks use nothing but their arguments.
  const rules = Object.create(EventsService.prototype) as {
    assertPublishable(event: Record<string, unknown>): void;
    assertPriceUpdate(event: Record<string, unknown>, dto: Record<string, unknown>): void;
  };
  const ready = {
    title: "Sound healing",
    categoryId: "c",
    startsAt: new Date(Date.now() + 86_400_000),
    description: "d",
    format: "OFFLINE",
    cityId: "city",
    addressText: null,
    onlineUrl: null,
    priceType: "PAID",
    price: null as number | null,
  };

  it("is not published without an amount", () => {
    expect(() => rules.assertPublishable(ready)).toThrow("missing required fields");
    expect(() => rules.assertPublishable({ ...ready, price: 0 })).toThrow("missing required fields");
    expect(() => rules.assertPublishable({ ...ready, price: 500 })).not.toThrow();
    expect(() => rules.assertPublishable({ ...ready, priceType: "FREE" })).not.toThrow();
  });

  it("refuses a zero price, an upper price below the price, and switching a live event to paid without an amount", () => {
    const live = { status: "PUBLISHED", priceType: "FREE", price: null };
    expect(() => rules.assertPriceUpdate(live, { priceType: "PAID" })).toThrow("needs a price");
    expect(() => rules.assertPriceUpdate(live, { priceType: "PAID", price: 0 })).toThrow("above zero");
    expect(() => rules.assertPriceUpdate(live, { priceType: "PAID", price: 500, priceMax: 400 })).toThrow("upper price");
    expect(() => rules.assertPriceUpdate(live, { priceType: "PAID", price: 500, priceMax: 0 })).not.toThrow();
  });

  it("still lets an older paid event without an amount be edited, and drafts be saved half-filled", () => {
    expect(() => rules.assertPriceUpdate({ status: "PUBLISHED", priceType: "PAID", price: null }, { priceType: "PAID" })).not.toThrow();
    expect(() => rules.assertPriceUpdate({ status: "DRAFT", priceType: "FREE", price: null }, { priceType: "PAID" })).not.toThrow();
  });
});
