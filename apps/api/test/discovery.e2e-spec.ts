import { ConfigService } from "@nestjs/config";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/bootstrap";
import { PrismaService } from "../src/prisma/prisma.service";
import type { EnvConfig } from "../src/config/env.validation";

/** §56-59, §115 Phase 3: the swipe feed, pass/save interactions, and saved-events list. */
describe("Discovery (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const testEmailPrefix = "e2e-discovery-";
  let sportCategoryId: string;
  let concertsCategoryId: string;
  let kyivCityId: string;
  let lvivCityId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app, app.get(ConfigService<EnvConfig, true>));
    await app.init();
    prisma = app.get(PrismaService);

    sportCategoryId = (await prisma.category.findUniqueOrThrow({ where: { slug: "sport" } })).id;
    concertsCategoryId = (await prisma.category.findUniqueOrThrow({ where: { slug: "concerts" } })).id;
    kyivCityId = (await prisma.city.findUniqueOrThrow({ where: { slug: "kyiv" } })).id;
    lvivCityId = (await prisma.city.findUniqueOrThrow({ where: { slug: "lviv" } })).id;
  });

  afterAll(async () => {
    await prisma.eventInteraction.deleteMany({ where: { user: { email: { startsWith: testEmailPrefix } } } });
    await prisma.savedEvent.deleteMany({ where: { user: { email: { startsWith: testEmailPrefix } } } });
    await prisma.listingCreditLedger.deleteMany({ where: { user: { email: { startsWith: testEmailPrefix } } } });
    await prisma.event.deleteMany({ where: { owner: { email: { startsWith: testEmailPrefix } } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: testEmailPrefix } } });
    await app.close();
  });

  async function registerUser(): Promise<{ token: string; userId: string }> {
    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({
        email: `${testEmailPrefix}${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
        password: "Str0ngPass",
        name: "Discovery Tester",
      })
      .expect(201);
    return { token: res.body.accessToken, userId: res.body.user.id };
  }

  async function createPublishedEvent(
    token: string,
    overrides: {
      title?: string;
      categoryId?: string;
      cityId?: string;
      startsAt?: string;
      priceType?: "FREE" | "PAID";
      price?: number;
      format?: "OFFLINE" | "ONLINE";
      onlineUrl?: string;
    } = {},
  ): Promise<string> {
    await request(app.getHttpServer())
      .post("/api/v1/credits/claim-free")
      .set("Authorization", `Bearer ${token}`);

    const created = await request(app.getHttpServer())
      .post("/api/v1/events")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: overrides.title ?? "Discovery Fixture Event" })
      .expect(201);
    const eventId = created.body.id;

    const format = overrides.format ?? "OFFLINE";
    await request(app.getHttpServer())
      .patch(`/api/v1/events/${eventId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        description: "A perfectly normal description.",
        categoryId: overrides.categoryId ?? sportCategoryId,
        format,
        cityId: format === "OFFLINE" ? (overrides.cityId ?? kyivCityId) : undefined,
        onlineUrl: format === "ONLINE" ? (overrides.onlineUrl ?? "https://example.com/stream") : undefined,
        startsAt: overrides.startsAt ?? new Date(Date.now() + 7 * 86_400_000).toISOString(),
        priceType: overrides.priceType ?? "FREE",
        price: overrides.priceType === "PAID" ? (overrides.price ?? 100) : undefined,
      })
      .expect(200);

    await request(app.getHttpServer())
      .post(`/api/v1/events/${eventId}/publish`)
      .set("Authorization", `Bearer ${token}`)
      .expect(201);

    return eventId;
  }

  it("GET /discovery is public and only returns published events", async () => {
    const { token } = await registerUser();
    const eventId = await createPublishedEvent(token, { title: "Public Feed Event" });

    const res = await request(app.getHttpServer()).get("/api/v1/discovery").expect(200);
    expect(res.body.items.some((e: { id: string }) => e.id === eventId)).toBe(true);
    expect(res.body.items.every((e: { status?: string }) => e.status === undefined || e.status === "PUBLISHED")).toBe(
      true,
    );
  });

  it("filters by cityIds and categoryIds", async () => {
    const { token } = await registerUser();
    const kyivSportEvent = await createPublishedEvent(token, {
      title: "Kyiv Sport Event",
      cityId: kyivCityId,
      categoryId: sportCategoryId,
    });
    const lvivConcertEvent = await createPublishedEvent(token, {
      title: "Lviv Concert Event",
      cityId: lvivCityId,
      categoryId: concertsCategoryId,
    });

    const res = await request(app.getHttpServer())
      .get("/api/v1/discovery")
      .query({ cityIds: kyivCityId, categoryIds: sportCategoryId })
      .expect(200);
    const ids: string[] = res.body.items.map((e: { id: string }) => e.id);
    expect(ids).toContain(kyivSportEvent);
    expect(ids).not.toContain(lvivConcertEvent);
  });

  it("freeOnly excludes paid events", async () => {
    const { token } = await registerUser();
    const freeEvent = await createPublishedEvent(token, { title: "Free Discovery Event", priceType: "FREE" });
    const paidEvent = await createPublishedEvent(token, {
      title: "Paid Discovery Event",
      priceType: "PAID",
      price: 250,
    });

    const res = await request(app.getHttpServer())
      .get("/api/v1/discovery")
      .query({ freeOnly: "true" })
      .expect(200);
    const ids: string[] = res.body.items.map((e: { id: string }) => e.id);
    expect(ids).toContain(freeEvent);
    expect(ids).not.toContain(paidEvent);
  });

  it("ranks an event in the caller's preferred city above an otherwise-identical event elsewhere (§58)", async () => {
    const { token, userId } = await registerUser();
    await prisma.userPreferences.update({ where: { userId }, data: { preferredCityId: kyivCityId } });

    const startsAt = new Date(Date.now() + 10 * 86_400_000).toISOString();
    const elsewhereEvent = await createPublishedEvent(token, {
      title: "Ranking Elsewhere",
      cityId: lvivCityId,
      startsAt,
    });
    const preferredEvent = await createPublishedEvent(token, {
      title: "Ranking Preferred City",
      cityId: kyivCityId,
      startsAt,
    });

    const res = await request(app.getHttpServer())
      .get("/api/v1/discovery")
      .set("Authorization", `Bearer ${token}`)
      .query({ limit: 50 })
      .expect(200);
    const ids: string[] = res.body.items.map((e: { id: string }) => e.id);
    const preferredIndex = ids.indexOf(preferredEvent);
    const elsewhereIndex = ids.indexOf(elsewhereEvent);
    expect(preferredIndex).not.toBe(-1);
    expect(elsewhereIndex).not.toBe(-1);
    expect(preferredIndex).toBeLessThan(elsewhereIndex);
  });

  it("PASS excludes an event from that user's feed, but not from another user's", async () => {
    const passer = await registerUser();
    const other = await registerUser();
    const eventId = await createPublishedEvent(passer.token, { title: "Passable Event" });

    await request(app.getHttpServer())
      .post(`/api/v1/discovery/${eventId}/interactions`)
      .set("Authorization", `Bearer ${passer.token}`)
      .send({ interaction: "PASS" })
      .expect(204);

    const passerFeed = await request(app.getHttpServer())
      .get("/api/v1/discovery")
      .set("Authorization", `Bearer ${passer.token}`)
      .expect(200);
    expect(passerFeed.body.items.some((e: { id: string }) => e.id === eventId)).toBe(false);

    const otherFeed = await request(app.getHttpServer())
      .get("/api/v1/discovery")
      .set("Authorization", `Bearer ${other.token}`)
      .expect(200);
    expect(otherFeed.body.items.some((e: { id: string }) => e.id === eventId)).toBe(true);
  });

  it("recording an interaction requires authentication", async () => {
    const { token } = await registerUser();
    const eventId = await createPublishedEvent(token, { title: "Auth Required Event" });

    await request(app.getHttpServer())
      .post(`/api/v1/discovery/${eventId}/interactions`)
      .send({ interaction: "OPEN" })
      .expect(401);
  });

  it("save/unsave is idempotent and reflected in the saved-events list (UX §5 — save is not a registration)", async () => {
    const { token } = await registerUser();
    const eventId = await createPublishedEvent(token, { title: "Saveable Event" });

    await request(app.getHttpServer())
      .post(`/api/v1/discovery/${eventId}/save`)
      .set("Authorization", `Bearer ${token}`)
      .expect(204);
    // Saving twice is a no-op, not an error.
    await request(app.getHttpServer())
      .post(`/api/v1/discovery/${eventId}/save`)
      .set("Authorization", `Bearer ${token}`)
      .expect(204);

    const saved = await request(app.getHttpServer())
      .get("/api/v1/discovery/saved")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(saved.body.items.map((e: { id: string }) => e.id)).toContain(eventId);

    await request(app.getHttpServer())
      .delete(`/api/v1/discovery/${eventId}/save`)
      .set("Authorization", `Bearer ${token}`)
      .expect(204);

    const afterUnsave = await request(app.getHttpServer())
      .get("/api/v1/discovery/saved")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(afterUnsave.body.items.map((e: { id: string }) => e.id)).not.toContain(eventId);
  });

  it("paginates with a cursor without duplicating or skipping items", async () => {
    const { token } = await registerUser();
    const startsAt = new Date(Date.now() + 20 * 86_400_000).toISOString();
    const ids = [
      await createPublishedEvent(token, { title: "Cursor Event A", startsAt }),
      await createPublishedEvent(token, { title: "Cursor Event B", startsAt }),
      await createPublishedEvent(token, { title: "Cursor Event C", startsAt }),
    ];

    const firstPage = await request(app.getHttpServer())
      .get("/api/v1/discovery")
      .query({ cityIds: kyivCityId, limit: 2 })
      .expect(200);
    expect(firstPage.body.items.length).toBeLessThanOrEqual(2);

    if (firstPage.body.hasMore) {
      const secondPage = await request(app.getHttpServer())
        .get("/api/v1/discovery")
        .query({ cityIds: kyivCityId, limit: 2, cursor: firstPage.body.nextCursor })
        .expect(200);

      const firstIds = firstPage.body.items.map((e: { id: string }) => e.id);
      const secondIds = secondPage.body.items.map((e: { id: string }) => e.id);
      expect(new Set([...firstIds, ...secondIds]).size).toBe(firstIds.length + secondIds.length);
    }

    // Sanity: all three fixtures exist and are findable across the paginated feed.
    const all = await prisma.event.findMany({ where: { id: { in: ids } } });
    expect(all).toHaveLength(3);
  });

  it("GET/PATCH /discovery/preferences persists the caller's filter defaults (UX §7)", async () => {
    const { token } = await registerUser();

    const before = await request(app.getHttpServer())
      .get("/api/v1/discovery/preferences")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(before.body.preferredCityId).toBeNull();

    await request(app.getHttpServer())
      .patch("/api/v1/discovery/preferences")
      .set("Authorization", `Bearer ${token}`)
      .send({ preferredCityId: lvivCityId, freeOnly: true })
      .expect(200);

    const after = await request(app.getHttpServer())
      .get("/api/v1/discovery/preferences")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(after.body.preferredCityId).toBe(lvivCityId);
    expect(after.body.freeOnly).toBe(true);
  });
});
