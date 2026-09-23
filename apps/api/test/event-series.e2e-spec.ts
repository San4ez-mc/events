import { ConfigService } from "@nestjs/config";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/bootstrap";
import { PrismaService } from "../src/prisma/prisma.service";
import type { EnvConfig } from "../src/config/env.validation";

/** §29, §115 Phase 7: recurring events — each occurrence is its own independent Event row. */
describe("Event series (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const testEmailPrefix = "e2e-series-";
  let sportCategoryId: string;
  let kyivCityId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app, app.get(ConfigService<EnvConfig, true>));
    await app.init();
    prisma = app.get(PrismaService);

    sportCategoryId = (await prisma.category.findUniqueOrThrow({ where: { slug: "sport" } })).id;
    kyivCityId = (await prisma.city.findUniqueOrThrow({ where: { slug: "kyiv" } })).id;
  });

  afterAll(async () => {
    await prisma.registrationField.deleteMany({ where: { event: { owner: { email: { startsWith: testEmailPrefix } } } } });
    await prisma.event.deleteMany({ where: { owner: { email: { startsWith: testEmailPrefix } } } });
    await prisma.eventSeries.deleteMany({ where: { owner: { email: { startsWith: testEmailPrefix } } } });
    await prisma.listingCreditLedger.deleteMany({ where: { user: { email: { startsWith: testEmailPrefix } } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: testEmailPrefix } } });
    await app.close();
  });

  async function registerUser(namePrefix = "Organizer"): Promise<{ token: string; userId: string }> {
    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({
        email: `${testEmailPrefix}${namePrefix}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
        password: "Str0ngPass",
        name: `${namePrefix} Tester`,
      })
      .expect(201);
    return { token: res.body.accessToken, userId: res.body.user.id };
  }

  async function createDraftEvent(
    token: string,
    overrides: { title?: string; fields?: boolean } = {},
  ): Promise<string> {
    await request(app.getHttpServer()).post("/api/v1/credits/claim-free").set("Authorization", `Bearer ${token}`);
    const created = await request(app.getHttpServer())
      .post("/api/v1/events")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: overrides.title ?? "Series Fixture Event" })
      .expect(201);
    await request(app.getHttpServer())
      .patch(`/api/v1/events/${created.body.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        description: "A perfectly normal description.",
        categoryId: sportCategoryId,
        cityId: kyivCityId,
        startsAt: "2026-11-02T18:00:00.000Z",
        endsAt: "2026-11-02T20:00:00.000Z",
      })
      .expect(200);
    if (overrides.fields) {
      await request(app.getHttpServer())
        .put(`/api/v1/events/${created.body.id}/registrations/fields`)
        .set("Authorization", `Bearer ${token}`)
        .send({ fields: [{ label: "T-shirt size?", type: "TEXT", required: false, sortOrder: 0 }] })
        .expect(200);
    }
    return created.body.id;
  }

  it("WEEKLY generates weekly occurrences, each its own draft with the same duration", async () => {
    const { token } = await registerUser();
    const templateId = await createDraftEvent(token);

    const res = await request(app.getHttpServer())
      .post(`/api/v1/events/${templateId}/series`)
      .set("Authorization", `Bearer ${token}`)
      .send({ recurrenceType: "WEEKLY", count: 4 })
      .expect(201);

    expect(res.body.occurrences).toHaveLength(4);
    const dates = res.body.occurrences.map((e: { startsAt: string }) => new Date(e.startsAt).getTime());
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i] - dates[i - 1]).toBe(7 * 24 * 60 * 60 * 1000);
    }
    for (const occurrence of res.body.occurrences) {
      expect(occurrence.status).toBe("DRAFT");
      const durationMs = new Date(occurrence.endsAt).getTime() - new Date(occurrence.startsAt).getTime();
      expect(durationMs).toBe(2 * 60 * 60 * 1000);
    }

    const distinctIds = new Set(res.body.occurrences.map((e: { id: string }) => e.id));
    expect(distinctIds.size).toBe(4);
  });

  it("EVERY_N_DAYS respects the interval, and `until` stops generation", async () => {
    const { token } = await registerUser();
    const templateId = await createDraftEvent(token);

    const res = await request(app.getHttpServer())
      .post(`/api/v1/events/${templateId}/series`)
      .set("Authorization", `Bearer ${token}`)
      .send({ recurrenceType: "EVERY_N_DAYS", interval: 3, until: "2026-11-12T00:00:00.000Z" })
      .expect(201);

    // Template starts 2026-11-02; +3d steps: 02, 05, 08, 11 (14 would exceed `until`).
    expect(res.body.occurrences).toHaveLength(4);
  });

  it("copies registration fields onto every occurrence", async () => {
    const { token } = await registerUser();
    const templateId = await createDraftEvent(token, { fields: true });

    const res = await request(app.getHttpServer())
      .post(`/api/v1/events/${templateId}/series`)
      .set("Authorization", `Bearer ${token}`)
      .send({ recurrenceType: "WEEKLY", count: 2 })
      .expect(201);

    const secondOccurrenceId = res.body.occurrences[1].id;
    const fields = await prisma.registrationField.findMany({ where: { eventId: secondOccurrenceId } });
    expect(fields).toHaveLength(1);
    expect(fields[0]!.label).toBe("T-shirt size?");
  });

  it("rejects turning an event that's already in a series into another one", async () => {
    const { token } = await registerUser();
    const templateId = await createDraftEvent(token);

    await request(app.getHttpServer())
      .post(`/api/v1/events/${templateId}/series`)
      .set("Authorization", `Bearer ${token}`)
      .send({ recurrenceType: "WEEKLY", count: 2 })
      .expect(201);

    const res = await request(app.getHttpServer())
      .post(`/api/v1/events/${templateId}/series`)
      .set("Authorization", `Bearer ${token}`)
      .send({ recurrenceType: "WEEKLY", count: 2 })
      .expect(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("a stranger cannot create a series for someone else's event", async () => {
    const owner = await registerUser("Owner");
    const templateId = await createDraftEvent(owner.token);
    const stranger = await registerUser("Stranger");

    await request(app.getHttpServer())
      .post(`/api/v1/events/${templateId}/series`)
      .set("Authorization", `Bearer ${stranger.token}`)
      .send({ recurrenceType: "WEEKLY", count: 2 })
      .expect(403);
  });

  it("lists occurrences for a series, ordered by date", async () => {
    const { token } = await registerUser();
    const templateId = await createDraftEvent(token);

    const created = await request(app.getHttpServer())
      .post(`/api/v1/events/${templateId}/series`)
      .set("Authorization", `Bearer ${token}`)
      .send({ recurrenceType: "EVERY_N_WEEKS", interval: 2, count: 3 })
      .expect(201);

    const list = await request(app.getHttpServer())
      .get(`/api/v1/event-series/${created.body.series.id}/occurrences`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(list.body).toHaveLength(3);
    const dates = list.body.map((e: { startsAt: string }) => new Date(e.startsAt).getTime());
    expect(dates).toEqual([...dates].sort((a, b) => a - b));
  });

  it("requires authentication", async () => {
    await request(app.getHttpServer()).post("/api/v1/events/x/series").send({ recurrenceType: "WEEKLY" }).expect(401);
  });
});
