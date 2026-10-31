import { findTime, ottryUrls, parseOttryEvent, tierPrices } from "./ottry";
import { breadcrumbCategory, findEventNodes, parseJsonLdEvent, parseKontramarkaEvent } from "./jsonld";
import { classify } from "./classify";
import { hintCity, matchCity } from "./cities";

const ottryPage = (venue: string, extra = "") => `<!DOCTYPE html><html><head>
<meta data-rh="true" property="og:title" content="VESELKA: COVEN: Купити квитки на ottry.com"/>
<meta data-rh="true" name="description" content="Придбати квиток на ⭐️ VESELKA: COVEN ☝31-10-2026. Від 750 грн | Купити квитки онлайн"/>
<meta data-rh="true" property="og:image" content="https://ticket.example.com/a.png"/>
<title>x</title></head><body><img src="data:image/png;base64,AAAA"/>
<div>Квитки</div><h1>VESELKA: COVEN</h1><span>31-10-2026</span>
<p>31.10. День, коли межа між світами стає найтоншою.</p><p>Коло відкривається лише раз. Не запізнюйся. 14:00.</p>
<p>Early Birds - 750 sold out</p><p>Final Wave - 1500</p><p>31.10 - 2000</p><p>🔞 Вхід дозволяється особам віком 18+.</p>${extra}
<div>Ціна: від</div><div>750</div><div>UAH</div><div>Місце проведення</div><div>:</div><div>${venue}</div><div>Квитки</div>
</body></html>`;

describe("ottry parser", () => {
  it("reads title, Kyiv-time start, price range, venue, age and cover", () => {
    const r = parseOttryEvent(ottryPage("Closer, Нижньоюрківська 31"), "https://ottry.com/events/veselka");
    if (!("event" in r)) throw new Error(r.skip);
    expect(r.event).toMatchObject({
      source: "ottry",
      sourceRef: "veselka",
      title: "VESELKA: COVEN",
      priceMin: 750,
      priceMax: 2000,
      venue: "Closer, Нижньоюрківська 31",
      city: "Київ",
      ageRestriction: 18,
      timeKnown: true,
      imageUrl: "https://ticket.example.com/a.png",
      categorySlug: "parties",
    });
    // 14:00 Kyiv time on 31 Oct 2026 (UTC+2 after the clocks change on 25 Oct) = 12:00Z.
    expect(r.event.startsAt.toISOString()).toBe("2026-10-31T12:00:00.000Z");
  });

  it("skips an event whose venue is not announced yet", () => {
    expect(parseOttryEvent(ottryPage("Буде оголошено"), "https://ottry.com/events/x")).toEqual({ skip: "venue not announced" });
  });

  it("skips professional conferences", () => {
    const html = ottryPage("Lviv, LEM station").replace("VESELKA: COVEN: Купити", "LVIV MEDICAL FORUM: Купити");
    expect(parseOttryEvent(html, "https://ottry.com/events/x")).toEqual({ skip: "not for a general audience" });
  });

  it("lists only event pages from the sitemap", () => {
    const xml = "<urlset><url><loc>https://ottry.com/events</loc></url><url><loc>https://ottry.com/events/a-b</loc></url><url><loc>https://ottry.com/services/x/y</loc></url></urlset>";
    expect(ottryUrls(xml)).toEqual(["https://ottry.com/events/a-b"]);
  });

  it("finds times but not dates", () => {
    expect(findTime(["31.10. вечір", "Початок о 19.30"])).toBe("19:30");
    expect(findTime(["Двері 18:00"])).toBe("18:00");
    expect(findTime(["31.10.2026 рейв"])).toBeNull();
  });

  it("ignores sold-out tiers", () => {
    expect(tierPrices(["Early - 750 sold out", "Final Wave - 1500", "Просто текст"])).toEqual([1500]);
  });
});

const ldPage = (extra: Record<string, unknown> = {}) =>
  `<html><script type="application/ld+json">${JSON.stringify({
    "@context": "http://schema.org",
    "@type": "MusicEvent",
    name: "Трамвай — Бажання",
    description: "<p>Прем'єра в Одесі!</p>",
    image: "https://storage.concert.ua/a.jpg",
    startDate: "2026-11-25T18:00:00+02:00",
    endDate: "2026-11-25T20:00:00+02:00",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    eventStatus: "EventScheduled",
    location: { "@type": "Place", name: "Український театр", address: { streetAddress: "вул. Пастера, 15", addressLocality: "Одеса" } },
    offers: { "@type": "Offer", price: 350 },
    organizer: [{ name: "КА Art point" }],
    ...extra,
  })}</script></html>`;

describe("JSON-LD parser", () => {
  it("reads venue, city, price, times and organizer", () => {
    const r = parseJsonLdEvent(ldPage(), "https://concert.ua/uk/event/tramvai", "concert_ua");
    if (!("event" in r)) throw new Error(r.skip);
    expect(r.event).toMatchObject({
      sourceRef: "/uk/event/tramvai",
      title: "Трамвай — Бажання",
      city: "Одеса",
      address: "Український театр, вул. Пастера, 15",
      priceMin: 350,
      priceMax: null,
      imageUrl: "https://storage.concert.ua/a.jpg",
      organizerName: "КА Art point",
    });
    expect(r.event.startsAt.toISOString()).toBe("2026-11-25T16:00:00.000Z");
    expect(r.event.description).toBe("Прем'єра в Одесі!");
  });

  it("skips cancelled and online events", () => {
    expect(parseJsonLdEvent(ldPage({ eventStatus: "https://schema.org/EventCancelled" }), "https://x.ua/e", "s")).toEqual({ skip: "cancelled or postponed" });
    const online = { eventAttendanceMode: "https://schema.org/OnlineEventAttendanceMode" };
    expect(parseJsonLdEvent(ldPage({ ...online, location: { "@type": "VirtualLocation", name: "Zoom" } }), "https://x.ua/e", "s")).toEqual({ skip: "online event" });
    // A street address wins over a wrong "online" flag (kontramarka marks everything online).
    expect(parseJsonLdEvent(ldPage(online), "https://x.ua/e", "s")).toHaveProperty("event");
  });

  it("survives a broken block next to a good one and finds events inside @graph", () => {
    const html = `<script type="application/ld+json">{oops</script><script type="application/ld+json">${JSON.stringify({ "@graph": [{ "@type": "Event", name: "A", startDate: "2026-12-01T19:00:00+02:00" }] })}</script>`;
    expect(findEventNodes(html)).toHaveLength(1);
  });
});

describe("kontramarka", () => {
  const page = (section: string, dates = 1) =>
    `<script type="application/ld+json">${JSON.stringify({ "@type": "BreadcrumbList", itemListElement: [{ position: 1, name: "Афіша Київ" }, { position: 2, name: section }, { position: 3, name: "Назва" }] })}</script>` +
    Array.from({ length: dates }, (_, i) => ldPage({ startDate: `2026-11-${String(i + 1).padStart(2, "0")}T19:00:00+02:00` })).join("");

  it("reads the section from the breadcrumb trail", () => {
    expect(breadcrumbCategory(page("STAND-UP"))).toBe("STAND-UP");
    expect(breadcrumbCategory("<html></html>")).toBeNull();
  });

  it("publishes shows and skips permanent attractions", () => {
    expect(parseKontramarkaEvent(page("STAND-UP"), "https://kontramarka.ua/uk/show.html")).toHaveProperty("event");
    expect(parseKontramarkaEvent(page("ЗООПАРК"), "https://kontramarka.ua/uk/zoo.html")).toEqual({ skip: "attraction, not an event" });
    expect(parseKontramarkaEvent(page("ЩОСЬ ІНШЕ", 20), "https://kontramarka.ua/uk/x.html")).toEqual({ skip: "attraction with a date for every day" });
  });
});

describe("city and category helpers", () => {
  const cities = [
    { id: "1", nameUk: "Київ", nameEn: "Kyiv" },
    { id: "2", nameUk: "Івано-Франківськ", nameEn: "Ivano-Frankivsk" },
  ];

  it("matches city names the way sources write them", () => {
    expect(matchCity("м. Київ", cities)?.id).toBe("1");
    expect(matchCity("kyiv", cities)?.id).toBe("1");
    expect(matchCity("Киев", cities)?.id).toBe("1");
    expect(matchCity("Ковель", cities)).toBeNull();
  });

  it("guesses a city only from unmistakable venue text", () => {
    expect(hintCity("Closer, Нижньоюрківська 31")).toBe("Київ");
    expect(hintCity("nulovyi, жовківська 29")).toBe("Львів");
    expect(hintCity("Mad Cat")).toBeNull();
  });

  it("classifies by what the listing says", () => {
    expect(classify("Стендап Володимира Шумка")).toBe("standup");
    expect(classify("Halloween party у клубі")).toBe("parties");
    expect(classify("Концерт гурту")).toBe("concerts");
    expect(classify("Щось невідоме", "TheaterEvent")).toBe("culture");
  });
});
