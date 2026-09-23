import { ConfigService } from "@nestjs/config";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/bootstrap";
import { PrismaService } from "../src/prisma/prisma.service";
import type { EnvConfig } from "../src/config/env.validation";

/** §19/§70, §46/§47, §115 Phase 7: duplicating an event and the organizer stats endpoint. */
describe("Organizer tools: duplicate + stats (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const testEmailPrefix = "e2e-organizer-tools-";
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
    await prisma.registration.deleteMany({ where: { event: { owner: { email: { startsWith: testEmailPrefix } } } } });
    await prisma.savedEvent.deleteMany({ where: { user: { email: { startsWith: testEmailPrefix } } } });
    await prisma.listingCreditLedger.deleteMany({ where: { user: { email: { startsWith: testEmailPrefix } } } });
    await prisma.event.deleteMany({ where: { owner: { email: { startsWith: testEmailPrefix } } } });
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

  async function createPublishedEvent(token: string): Promise<string> {
    await request(app.getHttpServer()).post("/api/v1/credits/claim-free").set("Authorization", `Bearer ${token}`);
    const created = await request(app.getHttpServer())
      .post("/api/v1/events")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Organizer Tools Fixture Event" })
      .expect(201);
    await request(app.getHttpServer())
      .patch(`/api/v1/events/${created.body.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        description: "A perfectly normal description.",
        categoryId: sportCategoryId,
        cityId: kyivCityId,
        startsAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
        rules: "Be nice.",
      })
      .expect(200);
    await request(app.getHttpServer())
      .put(`/api/v1/events/${created.body.id}/registrations/fields`)
      .set("Authorization", `Bearer ${token}`)
      .send({ fields: [{ label: "Level?", type: "TEXT", required: false, sortOrder: 0 }] })
      .expect(200);
    await request(app.getHttpServer())
      .post(`/api/v1/events/${created.body.id}/publish`)
      .set("Authorization", `Bearer ${token}`)
      .expect(201);
    return created.body.id;
  }

  describe("duplicate", () => {
    it("copies content but starts a fresh DRAFT with no participants/stats", async () => {
      const { token } = await registerUser();
      const sourceId = await createPublishedEvent(token);
      const attendee = await registerUser("Attendee");
      await request(app.getHttpServer())
        .post(`/api/v1/events/${sourceId}/registrations`)
        .set("Authorization", `Bearer ${attendee.token}`)
        .send({})
        .expect(201);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/events/${sourceId}/duplicate`)
        .set("Authorization", `Bearer ${token}`)
        .expect(201);

      expect(res.body.id).not.toBe(sourceId);
      expect(res.body.status).toBe("DRAFT");
      expect(res.body.title).toBe("Organizer Tools Fixture Event");
      expect(res.body.description).toBe("A perfectly normal description.");
      expect(res.body.categoryId).toBe(sportCategoryId);
      expect(res.body.rules).toBe("Be nice.");
      expect(res.body.publishedAt).toBeNull();

      const fields = await prisma.registrationField.findMany({ where: { eventId: res.body.id } });
      expect(fields).toHaveLength(1);
      expect(fields[0]!.label).toBe("Level?");

      const registrations = await prisma.registration.count({ where: { eventId: res.body.id } });
      expect(registrations).toBe(0);
    });

    it("a stranger cannot duplicate someone else's event", async () => {
      const owner = await registerUser("Owner");
      const sourceId = await createPublishedEvent(owner.token);
      const stranger = await registerUser("Stranger");

      await request(app.getHttpServer())
        .post(`/api/v1/events/${sourceId}/duplicate`)
        .set("Authorization", `Bearer ${stranger.token}`)
        .expect(403);
    });
  });

  describe("stats", () => {
    it("returns registration/save/payment counts computed from existing data", async () => {
      const { token } = await registerUser();
      const eventId = await createPublishedEvent(token);
      const attendee = await registerUser("Attendee2");

      await request(app.getHttpServer())
        .post(`/api/v1/events/${eventId}/registrations`)
        .set("Authorization", `Bearer ${attendee.token}`)
        .send({})
        .expect(201);
      await request(app.getHttpServer())
        .post(`/api/v1/discovery/${eventId}/save`)
        .set("Authorization", `Bearer ${attendee.token}`)
        .expect(204);

      const stats = await request(app.getHttpServer())
        .get(`/api/v1/events/${eventId}/stats`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200);
      expect(stats.body.registrations).toBe(1);
      expect(stats.body.confirmed).toBe(0);
      expect(stats.body.saves).toBe(1);
    });

    it("a stranger cannot view another organizer's stats", async () => {
      const owner = await registerUser("Owner2");
      const eventId = await createPublishedEvent(owner.token);
      const stranger = await registerUser("Stranger2");

      await request(app.getHttpServer())
        .get(`/api/v1/events/${eventId}/stats`)
        .set("Authorization", `Bearer ${stranger.token}`)
        .expect(403);
    });
  });
});
