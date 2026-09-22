import { ConfigService } from "@nestjs/config";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/bootstrap";
import { PrismaService } from "../src/prisma/prisma.service";
import type { EnvConfig } from "../src/config/env.validation";

/** §56, §115 Phase 3: pg_trgm-backed search across title/description/category/organizer/city/district. */
describe("Search (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const testEmailPrefix = "e2e-search-";
  let sportCategoryId: string;
  let kyivCityId: string;
  let lvivCityId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app, app.get(ConfigService<EnvConfig, true>));
    await app.init();
    prisma = app.get(PrismaService);

    sportCategoryId = (await prisma.category.findUniqueOrThrow({ where: { slug: "sport" } })).id;
    kyivCityId = (await prisma.city.findUniqueOrThrow({ where: { slug: "kyiv" } })).id;
    lvivCityId = (await prisma.city.findUniqueOrThrow({ where: { slug: "lviv" } })).id;
  });

  afterAll(async () => {
    await prisma.listingCreditLedger.deleteMany({ where: { user: { email: { startsWith: testEmailPrefix } } } });
    await prisma.event.deleteMany({ where: { owner: { email: { startsWith: testEmailPrefix } } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: testEmailPrefix } } });
    await app.close();
  });

  async function registerUser(): Promise<string> {
    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({
        email: `${testEmailPrefix}${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
        password: "Str0ngPass",
        name: "Search Tester",
      })
      .expect(201);
    return res.body.accessToken;
  }

  async function createPublishedEvent(
    token: string,
    overrides: { title: string; cityId?: string; description?: string },
  ): Promise<string> {
    await request(app.getHttpServer()).post("/api/v1/credits/claim-free").set("Authorization", `Bearer ${token}`);

    const created = await request(app.getHttpServer())
      .post("/api/v1/events")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: overrides.title })
      .expect(201);
    const eventId = created.body.id;

    await request(app.getHttpServer())
      .patch(`/api/v1/events/${eventId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        description: overrides.description ?? "A perfectly normal description.",
        categoryId: sportCategoryId,
        cityId: overrides.cityId ?? kyivCityId,
        startsAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      })
      .expect(200);

    await request(app.getHttpServer())
      .post(`/api/v1/events/${eventId}/publish`)
      .set("Authorization", `Bearer ${token}`)
      .expect(201);

    return eventId;
  }

  it("is public and finds events by (partial) title", async () => {
    const token = await registerUser();
    const eventId = await createPublishedEvent(token, { title: "Настільний теніс у Гідропарку" });

    const res = await request(app.getHttpServer())
      .get("/api/v1/search")
      .query({ q: "теніс" })
      .expect(200);
    expect(res.body.items.some((e: { id: string }) => e.id === eventId)).toBe(true);
  });

  it("finds events by city name even when the title doesn't mention it", async () => {
    const token = await registerUser();
    const eventId = await createPublishedEvent(token, { title: "Йога на світанку", cityId: lvivCityId });

    const res = await request(app.getHttpServer()).get("/api/v1/search").query({ q: "Львів" }).expect(200);
    expect(res.body.items.some((e: { id: string }) => e.id === eventId)).toBe(true);
  });

  it("respects structured filters (cityIds) combined with the text query", async () => {
    const token = await registerUser();
    const kyivEvent = await createPublishedEvent(token, { title: "Шахматний турнір", cityId: kyivCityId });
    const lvivEvent = await createPublishedEvent(token, { title: "Шахматний вечір", cityId: lvivCityId });

    const res = await request(app.getHttpServer())
      .get("/api/v1/search")
      .query({ q: "Шахмат", cityIds: kyivCityId })
      .expect(200);
    const ids: string[] = res.body.items.map((e: { id: string }) => e.id);
    expect(ids).toContain(kyivEvent);
    expect(ids).not.toContain(lvivEvent);
  });

  it("does not return unrelated events for an unmatched query", async () => {
    await registerUser();
    const res = await request(app.getHttpServer())
      .get("/api/v1/search")
      .query({ q: "zzznonexistentqueryzzz" })
      .expect(200);
    expect(res.body.items).toHaveLength(0);
  });

  it("rejects an empty query", async () => {
    await request(app.getHttpServer()).get("/api/v1/search").query({ q: "" }).expect(400);
  });

  it("never returns unpublished drafts", async () => {
    const token = await registerUser();
    const created = await request(app.getHttpServer())
      .post("/api/v1/events")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Unpublished Draft Searchable Title" })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get("/api/v1/search")
      .query({ q: "Unpublished Draft Searchable" })
      .expect(200);
    expect(res.body.items.some((e: { id: string }) => e.id === created.body.id)).toBe(false);
  });
});
