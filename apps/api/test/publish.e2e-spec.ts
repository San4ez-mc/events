import { ConfigService } from "@nestjs/config";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/bootstrap";
import { PrismaService } from "../src/prisma/prisma.service";
import type { EnvConfig } from "../src/config/env.validation";

/**
 * §52/§55: the publication transaction (credit debit, moderation
 * flag/reject, idempotency). Split from events.e2e-spec.ts since this
 * exercises a different subsystem (credits + moderation) on top of events.
 */
describe("Event publish (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const testEmailPrefix = "e2e-publish-";
  let sportCategoryId: string;
  let kyivCityId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app, app.get(ConfigService<EnvConfig, true>));
    await app.init();
    prisma = app.get(PrismaService);

    const sport = await prisma.category.findUniqueOrThrow({ where: { slug: "sport" } });
    sportCategoryId = sport.id;
    const kyiv = await prisma.city.findUniqueOrThrow({ where: { slug: "kyiv" } });
    kyivCityId = kyiv.id;
  });

  afterAll(async () => {
    await prisma.moderationCase.deleteMany({});
    await prisma.listingCreditLedger.deleteMany({ where: { user: { email: { startsWith: testEmailPrefix } } } });
    await prisma.event.deleteMany({ where: { owner: { email: { startsWith: testEmailPrefix } } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: testEmailPrefix } } });
    await app.close();
  });

  async function registerOrganizer(): Promise<{ token: string; userId: string }> {
    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({
        email: `${testEmailPrefix}${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
        password: "Str0ngPass",
        name: "Publish Tester",
      })
      .expect(201);
    return { token: res.body.accessToken, userId: res.body.user.id };
  }

  async function grantCredits(token: string) {
    await request(app.getHttpServer())
      .post("/api/v1/credits/claim-free")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
  }

  async function createPublishableDraft(
    token: string,
    overrides: Record<string, unknown> = {},
  ): Promise<string> {
    const created = await request(app.getHttpServer())
      .post("/api/v1/events")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: overrides.title ?? "Publishable Draft" })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/api/v1/events/${created.body.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        description: "A perfectly normal description.",
        categoryId: sportCategoryId,
        cityId: kyivCityId,
        startsAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
        ...overrides,
      })
      .expect(200);

    return created.body.id;
  }

  it("rejects publishing with missing required fields (§69)", async () => {
    const { token } = await registerOrganizer();
    const created = await request(app.getHttpServer())
      .post("/api/v1/events")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Incomplete Draft" })
      .expect(201);

    const res = await request(app.getHttpServer())
      .post(`/api/v1/events/${created.body.id}/publish`)
      .set("Authorization", `Bearer ${token}`)
      .expect(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects publishing without enough credits (§52)", async () => {
    const { token } = await registerOrganizer();
    const eventId = await createPublishableDraft(token);

    const res = await request(app.getHttpServer())
      .post(`/api/v1/events/${eventId}/publish`)
      .set("Authorization", `Bearer ${token}`)
      .expect(402);
    expect(res.body.error.code).toBe("INSUFFICIENT_LISTING_CREDITS");

    const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId } });
    expect(event.status).toBe("DRAFT");
  });

  it("publishes successfully and debits exactly one credit", async () => {
    const { token } = await registerOrganizer();
    await grantCredits(token);
    const eventId = await createPublishableDraft(token);

    const before = await request(app.getHttpServer())
      .get("/api/v1/credits/balance")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    const res = await request(app.getHttpServer())
      .post(`/api/v1/events/${eventId}/publish`)
      .set("Authorization", `Bearer ${token}`)
      .expect(201);
    expect(res.body.status).toBe("PUBLISHED");
    expect(res.body.publishedAt).toEqual(expect.any(String));

    const after = await request(app.getHttpServer())
      .get("/api/v1/credits/balance")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(after.body.balance).toBe(before.body.balance - 1);
  });

  it("is idempotent — publishing an already-published event again does not double-charge (§98)", async () => {
    const { token } = await registerOrganizer();
    await grantCredits(token);
    const eventId = await createPublishableDraft(token);

    await request(app.getHttpServer())
      .post(`/api/v1/events/${eventId}/publish`)
      .set("Authorization", `Bearer ${token}`)
      .expect(201);
    const balanceAfterFirst = (
      await request(app.getHttpServer()).get("/api/v1/credits/balance").set("Authorization", `Bearer ${token}`)
    ).body.balance;

    const second = await request(app.getHttpServer())
      .post(`/api/v1/events/${eventId}/publish`)
      .set("Authorization", `Bearer ${token}`)
      .expect(201);
    expect(second.body.status).toBe("PUBLISHED");

    const balanceAfterSecond = (
      await request(app.getHttpServer()).get("/api/v1/credits/balance").set("Authorization", `Bearer ${token}`)
    ).body.balance;
    expect(balanceAfterSecond).toBe(balanceAfterFirst);
  });

  it("rejects publish from a non-owner", async () => {
    const owner = await registerOrganizer();
    await grantCredits(owner.token);
    const eventId = await createPublishableDraft(owner.token);

    const stranger = await registerOrganizer();
    await request(app.getHttpServer())
      .post(`/api/v1/events/${eventId}/publish`)
      .set("Authorization", `Bearer ${stranger.token}`)
      .expect(403);
  });

  describe("content moderation (§54)", () => {
    it("hard-rejects content matching a blocked pattern, without charging a credit", async () => {
      const { token } = await registerOrganizer();
      await grantCredits(token);
      const eventId = await createPublishableDraft(token, {
        description: "Купити зброю дешево, доставка по Києву.",
      });

      const before = await request(app.getHttpServer())
        .get("/api/v1/credits/balance")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      await request(app.getHttpServer())
        .post(`/api/v1/events/${eventId}/publish`)
        .set("Authorization", `Bearer ${token}`)
        .expect(400);

      const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId } });
      expect(event.status).toBe("REJECTED");

      const after = await request(app.getHttpServer())
        .get("/api/v1/credits/balance")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);
      expect(after.body.balance).toBe(before.body.balance);
    });

    it("flags war-related content for manual review instead of blocking, without charging a credit yet", async () => {
      const { token } = await registerOrganizer();
      await grantCredits(token);
      const eventId = await createPublishableDraft(token, {
        description: "Благодійний захід на підтримку ЗСУ під час війни.",
      });

      const before = await request(app.getHttpServer())
        .get("/api/v1/credits/balance")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/events/${eventId}/publish`)
        .set("Authorization", `Bearer ${token}`)
        .expect(201);
      expect(res.body.status).toBe("PENDING_MODERATION");

      const after = await request(app.getHttpServer())
        .get("/api/v1/credits/balance")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);
      expect(after.body.balance).toBe(before.body.balance);

      const cases = await prisma.moderationCase.findMany({ where: { targetId: eventId } });
      expect(cases).toHaveLength(1);
      expect(cases[0]!.reasonCode).toBe("WAR_RELATED");
      expect(cases[0]!.status).toBe("PENDING");
    });
  });
});
