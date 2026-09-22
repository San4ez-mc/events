import { ConfigService } from "@nestjs/config";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/bootstrap";
import { PrismaService } from "../src/prisma/prisma.service";
import type { EnvConfig } from "../src/config/env.validation";

/** §33, §115 Phase 6: following an event, an organizer within a category, or all of an organizer's events. */
describe("Subscriptions (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const testEmailPrefix = "e2e-subscriptions-";
  let sportCategoryId: string;
  let concertsCategoryId: string;
  let kyivCityId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app, app.get(ConfigService<EnvConfig, true>));
    await app.init();
    prisma = app.get(PrismaService);

    sportCategoryId = (await prisma.category.findUniqueOrThrow({ where: { slug: "sport" } })).id;
    concertsCategoryId = (await prisma.category.findUniqueOrThrow({ where: { slug: "concerts" } })).id;
    kyivCityId = (await prisma.city.findUniqueOrThrow({ where: { slug: "kyiv" } })).id;
  });

  afterAll(async () => {
    await prisma.subscription.deleteMany({ where: { user: { email: { startsWith: testEmailPrefix } } } });
    await prisma.listingCreditLedger.deleteMany({ where: { user: { email: { startsWith: testEmailPrefix } } } });
    await prisma.event.deleteMany({ where: { owner: { email: { startsWith: testEmailPrefix } } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: testEmailPrefix } } });
    await app.close();
  });

  async function registerUser(namePrefix = "User"): Promise<{ token: string; userId: string }> {
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

  async function createPublishedEvent(): Promise<{ eventId: string; organizerId: string }> {
    const { token, userId } = await registerUser("Organizer");
    await request(app.getHttpServer()).post("/api/v1/credits/claim-free").set("Authorization", `Bearer ${token}`);
    const created = await request(app.getHttpServer())
      .post("/api/v1/events")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Subscription Fixture Event" })
      .expect(201);
    await request(app.getHttpServer())
      .patch(`/api/v1/events/${created.body.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        description: "A perfectly normal description.",
        categoryId: sportCategoryId,
        cityId: kyivCityId,
        startsAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      })
      .expect(200);
    await request(app.getHttpServer())
      .post(`/api/v1/events/${created.body.id}/publish`)
      .set("Authorization", `Bearer ${token}`)
      .expect(201);
    return { eventId: created.body.id, organizerId: userId };
  }

  it("subscribing to an event also creates an organizer+category subscription", async () => {
    const { eventId, organizerId } = await createPublishedEvent();
    const follower = await registerUser();

    await request(app.getHttpServer())
      .post(`/api/v1/events/${eventId}/subscribe`)
      .set("Authorization", `Bearer ${follower.token}`)
      .expect(201);

    const mine = await request(app.getHttpServer())
      .get("/api/v1/subscriptions/mine")
      .set("Authorization", `Bearer ${follower.token}`)
      .expect(200);

    expect(mine.body.some((s: { scope: string; eventId: string }) => s.scope === "EVENT" && s.eventId === eventId)).toBe(
      true,
    );
    expect(
      mine.body.some(
        (s: { scope: string; organizerId: string; categoryId: string }) =>
          s.scope === "ORGANIZER_CATEGORY" && s.organizerId === organizerId && s.categoryId === sportCategoryId,
      ),
    ).toBe(true);
  });

  it("subscribing to the same event twice does not duplicate rows", async () => {
    const { eventId } = await createPublishedEvent();
    const follower = await registerUser();

    await request(app.getHttpServer())
      .post(`/api/v1/events/${eventId}/subscribe`)
      .set("Authorization", `Bearer ${follower.token}`)
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/events/${eventId}/subscribe`)
      .set("Authorization", `Bearer ${follower.token}`)
      .expect(201);

    const count = await prisma.subscription.count({
      where: { userId: follower.userId, scope: "EVENT", eventId, active: true },
    });
    expect(count).toBe(1);
  });

  it("unsubscribing from an event leaves the organizer+category follow intact", async () => {
    const { eventId } = await createPublishedEvent();
    const follower = await registerUser();

    await request(app.getHttpServer())
      .post(`/api/v1/events/${eventId}/subscribe`)
      .set("Authorization", `Bearer ${follower.token}`)
      .expect(201);
    await request(app.getHttpServer())
      .delete(`/api/v1/events/${eventId}/subscribe`)
      .set("Authorization", `Bearer ${follower.token}`)
      .expect(204);

    const mine = await request(app.getHttpServer())
      .get("/api/v1/subscriptions/mine")
      .set("Authorization", `Bearer ${follower.token}`)
      .expect(200);
    expect(mine.body.some((s: { scope: string; eventId: string }) => s.scope === "EVENT" && s.eventId === eventId)).toBe(
      false,
    );
    expect(mine.body.some((s: { scope: string }) => s.scope === "ORGANIZER_CATEGORY")).toBe(true);
  });

  it("following an organizer accepts multiple categories and/or all-events", async () => {
    const { organizerId } = await createPublishedEvent();
    const follower = await registerUser();

    const res = await request(app.getHttpServer())
      .post(`/api/v1/subscriptions/organizers/${organizerId}`)
      .set("Authorization", `Bearer ${follower.token}`)
      .send({ categoryIds: [sportCategoryId, concertsCategoryId], allEvents: true })
      .expect(201);
    expect(res.body).toHaveLength(3);

    const mine = await request(app.getHttpServer())
      .get("/api/v1/subscriptions/mine")
      .set("Authorization", `Bearer ${follower.token}`)
      .expect(200);
    expect(mine.body.filter((s: { scope: string }) => s.scope === "ORGANIZER_CATEGORY")).toHaveLength(2);
    expect(mine.body.some((s: { scope: string }) => s.scope === "ORGANIZER_ALL")).toBe(true);
  });

  it("only the subscriber can unsubscribe, and unsubscribing hides it from the list", async () => {
    const { eventId } = await createPublishedEvent();
    const follower = await registerUser();
    const stranger = await registerUser();

    const sub = await request(app.getHttpServer())
      .post(`/api/v1/events/${eventId}/subscribe`)
      .set("Authorization", `Bearer ${follower.token}`)
      .expect(201);

    await request(app.getHttpServer())
      .delete(`/api/v1/subscriptions/${sub.body.id}`)
      .set("Authorization", `Bearer ${stranger.token}`)
      .expect(403);

    await request(app.getHttpServer())
      .delete(`/api/v1/subscriptions/${sub.body.id}`)
      .set("Authorization", `Bearer ${follower.token}`)
      .expect(204);

    const mine = await request(app.getHttpServer())
      .get("/api/v1/subscriptions/mine")
      .set("Authorization", `Bearer ${follower.token}`)
      .expect(200);
    expect(mine.body.some((s: { id: string }) => s.id === sub.body.id)).toBe(false);
  });

  it("requires authentication", async () => {
    await request(app.getHttpServer()).get("/api/v1/subscriptions/mine").expect(401);
  });
});
