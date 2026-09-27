import { ConfigService } from "@nestjs/config";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../../src/app.module";
import { configureApp } from "../../src/bootstrap";
import { PrismaService } from "../../src/prisma/prisma.service";
import type { EnvConfig } from "../../src/config/env.validation";

/**
 * QA audit — section 6 (feed) and section 7 (filters) of
 * C:\Users\Admin\Downloads\kiro_qa_acceptance_tests.md.
 * Own-data prefix: "qa-soc-"; events use title prefix "QASOC Feed" so this
 * suite only asserts on events it created, even though the feed is shared
 * with other auditors running in parallel.
 */
describe("QA social — feed & filters (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const prefix = "qa-soc-";
  const titlePrefix = "QASOC Feed";
  let sportCategoryId: string;
  let kyivCityId: string;
  let otherCityId: string;
  let otherCategoryId: string;
  const http = () => request(app.getHttpServer());

  jest.setTimeout(45000);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app, app.get(ConfigService<EnvConfig, true>));
    await app.init();
    prisma = app.get(PrismaService);

    sportCategoryId = (await prisma.category.findUniqueOrThrow({ where: { slug: "sport" } })).id;
    kyivCityId = (await prisma.city.findUniqueOrThrow({ where: { slug: "kyiv" } })).id;
    otherCityId = (await prisma.city.findUniqueOrThrow({ where: { slug: "dnipro" } })).id;
    otherCategoryId = (await prisma.category.findUniqueOrThrow({ where: { slug: "board-games" } })).id;
  });

  afterAll(async () => {
    const owner = { owner: { email: { startsWith: prefix } } };
    await prisma.eventInteraction.deleteMany({ where: { event: owner } });
    await prisma.savedEvent.deleteMany({ where: { event: owner } });
    await prisma.registration.deleteMany({ where: { event: owner } });
    await prisma.listingCreditLedger.deleteMany({ where: { user: { email: { startsWith: prefix } } } });
    await prisma.event.deleteMany({ where: owner });
    await prisma.user.deleteMany({ where: { email: { startsWith: prefix } } });
    await app.close();
  });

  async function newUser(label: string): Promise<{ token: string; id: string }> {
    const res = await http()
      .post("/api/v1/auth/register")
      .send({ email: `${prefix}${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`, password: "Str0ngPass", name: `${label} Tester` })
      .expect(201);
    return { token: res.body.accessToken, id: res.body.user.id };
  }

  async function publishedEvent(title: string, token: string, extra: Record<string, unknown> = {}): Promise<{ id: string; slug: string }> {
    const created = await http().post("/api/v1/events").set("Authorization", `Bearer ${token}`).send({ title }).expect(201);
    await http()
      .patch(`/api/v1/events/${created.body.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        description: "A normal description of the QA feed fixture event.",
        categoryId: sportCategoryId,
        cityId: kyivCityId,
        addressText: "вул. Хрещатик, 1",
        startsAt: new Date(Date.now() + 5 * 86_400_000).toISOString(),
        ...extra,
      })
      .expect(200);
    await http().post(`/api/v1/events/${created.body.id}/publish`).set("Authorization", `Bearer ${token}`).expect(201);
    return { id: created.body.id as string, slug: created.body.slug as string };
  }

  async function organizerWithCredits(label: string, credits = 40) {
    const organizer = await newUser(label);
    await http().post("/api/v1/credits/claim-free").set("Authorization", `Bearer ${organizer.token}`);
    // The free bonus (5 publications) isn't enough for fixtures that publish many events — top up directly
    // via the ledger (same mechanism admin/credits adjustments use) rather than exercising real payments here.
    await prisma.listingCreditLedger.create({
      data: { userId: organizer.id, type: "GRANT", creditsDelta: credits, sourceType: "QA_FIXTURE", sourceId: organizer.id, description: "QA fixture top-up" },
    });
    return organizer;
  }

  const feedPage = async (query: string, token?: string) => {
    const req = http().get(`/api/v1/discovery?${query}`);
    if (token) req.set("Authorization", `Bearer ${token}`);
    return req.expect(200);
  };

  describe("§6 Home / feed", () => {
    /**
     * FIXED (was a QA finding, §6/§57): `DiscoveryService.scoreEvent` folded `now = new Date()`
     * (captured fresh on every request) into the ranking score via `dateProximityMax - daysUntil`
     * and `freshEventMax - daysSinceCreated`, both of which drift continuously with wall-clock
     * time — the cursor's exact-match lookup in `sliceAfterScoredCursor` could then miss and fall
     * back to a boundary filter that duplicated or skipped an item near the page edge,
     * non-deterministically. Fixed by freezing `now` into the cursor itself
     * (`ScoredCursor.now`, `scored-cursor.ts`) and reusing that same `now` for every later page in
     * the same pagination session (`DiscoveryService.getFeed`) instead of a fresh one per request.
     */
    it("lists at least 20 public events, paginates without duplicates or gaps, and excludes draft/private/expired events", async () => {
      const organizer = await organizerWithCredits("feed-org");
      // 22 published public events with a distinctive title, so pagination has to cross more than one default page (20).
      // Fully sequential (no concurrency at all) — this DB is shared with other QA auditors running in
      // parallel, and concurrent publishes here were tripping Prisma's 5s interactive-transaction timeout.
      const specs = Array.from({ length: 22 }, (_, i) => `${titlePrefix} Public ${i}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
      for (const title of specs) {
        await publishedEvent(title, organizer.token);
      }

      // A draft (never published) must never reach the feed.
      const draft = await http().post("/api/v1/events").set("Authorization", `Bearer ${organizer.token}`).send({ title: `${titlePrefix} Draft ${Date.now()}` }).expect(201);

      // A published PRIVATE event must never reach the public feed.
      const privateEvt = await publishedEvent(`${titlePrefix} Private ${Date.now()}`, organizer.token, { visibility: "PRIVATE" });

      // An event whose startsAt is already in the past ("expired") must never reach the feed.
      // startsAt can't be set to the past through the normal update path (server validates future dates for a
      // PUBLISHED event's date), so we simulate "expired" the way the scheduler itself would find it: directly
      // age a previously-valid published event's startsAt into the past after publishing.
      const expired = await publishedEvent(`${titlePrefix} Expired ${Date.now()}`, organizer.token);
      await prisma.event.update({ where: { id: expired.id }, data: { startsAt: new Date(Date.now() - 60_000) } });

      // Walk every page via cursor, collecting every card whose title matches our fixture prefix.
      const seen = new Map<string, number>();
      let cursor: string | undefined;
      let pages = 0;
      do {
        const res = await feedPage(`limit=10${cursor ? `&cursor=${cursor}` : ""}`);
        expect(res.body.items.length).toBeLessThanOrEqual(10);
        for (const item of res.body.items as { id: string; title: string }[]) {
          if (!item.title.startsWith(titlePrefix)) continue;
          seen.set(item.id, (seen.get(item.id) ?? 0) + 1);
        }
        cursor = res.body.nextCursor ?? undefined;
        pages++;
      } while (cursor && pages < 50);

      const dupes = [...seen.values()].filter((n) => n > 1);
      expect(dupes).toHaveLength(0); // no duplicate cards across pages
      expect(seen.size).toBeGreaterThanOrEqual(22); // all 22 public events surfaced somewhere in the feed
      expect(seen.has(draft.body.id)).toBe(false);
      expect(seen.has(privateEvt.id)).toBe(false);
      expect(seen.has(expired.id)).toBe(false);
    }, 120000);

    it("swipe semantics: OPEN (tap/swipe-right) never creates a registration; PASS (swipe-left) removes the card from the feed", async () => {
      const organizer = await organizerWithCredits("swipe-org");
      const viewer = await newUser("swipe-viewer");
      const evt = await publishedEvent(`${titlePrefix} Swipe ${Date.now()}`, organizer.token);

      await http()
        .post(`/api/v1/discovery/${evt.id}/interactions`)
        .set("Authorization", `Bearer ${viewer.token}`)
        .send({ interaction: "OPEN" })
        .expect(204);

      const registrationCount = await prisma.registration.count({ where: { eventId: evt.id, userId: viewer.id } });
      expect(registrationCount).toBe(0); // opening/"swiping right" must never auto-register

      const beforePass = await feedPage(`limit=50`, viewer.token);
      expect(beforePass.body.items.map((e: { id: string }) => e.id)).toContain(evt.id);

      await http()
        .post(`/api/v1/discovery/${evt.id}/interactions`)
        .set("Authorization", `Bearer ${viewer.token}`)
        .send({ interaction: "PASS" })
        .expect(204);

      const afterPass = await feedPage(`limit=50`, viewer.token);
      expect(afterPass.body.items.map((e: { id: string }) => e.id)).not.toContain(evt.id);

      // "Look again" (reset passes) brings it back.
      await http().delete("/api/v1/discovery/passes").set("Authorization", `Bearer ${viewer.token}`).expect(204);
      const afterReset = await feedPage(`limit=50`, viewer.token);
      expect(afterReset.body.items.map((e: { id: string }) => e.id)).toContain(evt.id);
    }, 45000);

    it("feed priority: an event in the viewer's preferred city/category ranks above an otherwise-identical event that isn't", async () => {
      const organizer = await organizerWithCredits("priority-org");
      const viewer = await newUser("priority-viewer");
      await http()
        .patch("/api/v1/discovery/preferences")
        .set("Authorization", `Bearer ${viewer.token}`)
        .send({ preferredCityId: kyivCityId, preferredCategoryIds: [sportCategoryId] })
        .expect(200);

      const preferred = await publishedEvent(`${titlePrefix} Priority Preferred ${Date.now()}`, organizer.token, { cityId: kyivCityId, categoryId: sportCategoryId });
      const other = await publishedEvent(`${titlePrefix} Priority Other ${Date.now()}`, organizer.token, { cityId: otherCityId, categoryId: otherCategoryId });

      const res = await feedPage(`limit=50`, viewer.token);
      const ids = res.body.items.map((e: { id: string }) => e.id);
      const preferredIndex = ids.indexOf(preferred.id);
      const otherIndex = ids.indexOf(other.id);
      expect(preferredIndex).toBeGreaterThanOrEqual(0);
      expect(otherIndex).toBeGreaterThanOrEqual(0);
      expect(preferredIndex).toBeLessThan(otherIndex); // preferred-city/category event ranks first
    });
  });

  describe("§7 Filters", () => {
    it("filters by city and category", async () => {
      const organizer = await organizerWithCredits("filt-org");
      const inKyiv = await publishedEvent(`${titlePrefix} FilterCity Kyiv ${Date.now()}`, organizer.token, { cityId: kyivCityId, categoryId: sportCategoryId });
      const inOther = await publishedEvent(`${titlePrefix} FilterCity Other ${Date.now()}`, organizer.token, { cityId: otherCityId, categoryId: otherCategoryId });

      const byCity = await feedPage(`limit=50&cityIds=${kyivCityId}`);
      const cityIds = byCity.body.items.map((e: { id: string }) => e.id);
      expect(cityIds).toContain(inKyiv.id);
      expect(cityIds).not.toContain(inOther.id);

      const byCategory = await feedPage(`limit=50&categoryIds=${otherCategoryId}`);
      const catIds = byCategory.body.items.map((e: { id: string }) => e.id);
      expect(catIds).toContain(inOther.id);
      expect(catIds).not.toContain(inKyiv.id);
    });

    it("filters by budget (min/max never hide free events unless a positive min is set), and by online/offline format", async () => {
      const organizer = await organizerWithCredits("filt-budget-org");
      const free = await publishedEvent(`${titlePrefix} FilterBudget Free ${Date.now()}`, organizer.token);
      const paid = await publishedEvent(`${titlePrefix} FilterBudget Paid ${Date.now()}`, organizer.token, { priceType: "PAID", price: 300, paymentUrl: "https://example.com/pay" });
      const online = await publishedEvent(`${titlePrefix} FilterFormat Online ${Date.now()}`, organizer.token, { format: "ONLINE", onlineUrl: "https://meet.example.com/x" });

      const upTo100 = await feedPage(`limit=50&maxBudget=100`);
      const upTo100Ids = upTo100.body.items.map((e: { id: string }) => e.id);
      expect(upTo100Ids).toContain(free.id);
      expect(upTo100Ids).not.toContain(paid.id);

      const from200 = await feedPage(`limit=50&minBudget=200&maxBudget=400`);
      const from200Ids = from200.body.items.map((e: { id: string }) => e.id);
      expect(from200Ids).toContain(paid.id);
      expect(from200Ids).not.toContain(free.id);

      const onlineOnly = await feedPage(`limit=50&format=ONLINE`);
      const onlineIds = onlineOnly.body.items.map((e: { id: string }) => e.id);
      expect(onlineIds).toContain(online.id);
      expect(onlineIds).not.toContain(free.id);

      const offlineOnly = await feedPage(`limit=50&format=OFFLINE`);
      const offlineIds = offlineOnly.body.items.map((e: { id: string }) => e.id);
      expect(offlineIds).toContain(free.id);
      expect(offlineIds).not.toContain(online.id);
    });

    it("filters by date range", async () => {
      const organizer = await organizerWithCredits("filt-date-org");
      const soon = await publishedEvent(`${titlePrefix} FilterDate Soon ${Date.now()}`, organizer.token);
      const later = await publishedEvent(`${titlePrefix} FilterDate Later ${Date.now()}`, organizer.token, {
        startsAt: new Date(Date.now() + 40 * 86_400_000).toISOString(),
      });

      const soonWindow = await feedPage(`limit=50&dateTo=${new Date(Date.now() + 10 * 86_400_000).toISOString()}`);
      const soonIds = soonWindow.body.items.map((e: { id: string }) => e.id);
      expect(soonIds).toContain(soon.id);
      expect(soonIds).not.toContain(later.id);
    });

    it("apply/reset works and preferences survive a fresh request (persisted server-side, no client restart needed)", async () => {
      const viewer = await newUser("filt-prefs");
      const set = await http()
        .patch("/api/v1/discovery/preferences")
        .set("Authorization", `Bearer ${viewer.token}`)
        .send({ preferredCityId: kyivCityId, preferredCategoryIds: [sportCategoryId], freeOnly: true, maxBudget: 500 })
        .expect(200);
      expect(set.body.preferredCityId).toBe(kyivCityId);
      expect(set.body.freeOnly).toBe(true);

      // A brand-new request (simulating a fresh session/app restart) with the same token sees the saved prefs.
      const reread = await http().get("/api/v1/discovery/preferences").set("Authorization", `Bearer ${viewer.token}`).expect(200);
      expect(reread.body.preferredCityId).toBe(kyivCityId);
      expect(reread.body.preferredCategoryIds).toEqual([sportCategoryId]);
      expect(reread.body.freeOnly).toBe(true);
      expect(Number(reread.body.maxBudget)).toBe(500);

      // Reset: clear every filter field back to its default.
      const reset = await http()
        .patch("/api/v1/discovery/preferences")
        .set("Authorization", `Bearer ${viewer.token}`)
        .send({ preferredCityId: null, preferredCategoryIds: [], freeOnly: false, maxBudget: null })
        .expect(200);
      expect(reset.body.preferredCityId).toBeNull();
      expect(reset.body.freeOnly).toBe(false);
      expect(reset.body.maxBudget).toBeNull();
    });

    it("adults-only and capacity-range filters narrow the feed", async () => {
      const organizer = await organizerWithCredits("filt-misc-org");
      const adults = await publishedEvent(`${titlePrefix} FilterAdults ${Date.now()}`, organizer.token, { ageRestriction: 18, capacity: 6 });
      const open = await publishedEvent(`${titlePrefix} FilterOpen ${Date.now()}`, organizer.token, { capacity: 40 });

      const only18 = await feedPage(`limit=50&adultsOnly=true`);
      const only18Ids = only18.body.items.map((e: { id: string }) => e.id);
      expect(only18Ids).toContain(adults.id);
      expect(only18Ids).not.toContain(open.id);

      const small = await feedPage(`limit=50&capacityMax=10`);
      const smallIds = small.body.items.map((e: { id: string }) => e.id);
      expect(smallIds).toContain(adults.id);
      expect(smallIds).not.toContain(open.id);
    });
  });
});
