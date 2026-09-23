import { ConfigService } from "@nestjs/config";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/bootstrap";
import { PrismaService } from "../src/prisma/prisma.service";
import type { EnvConfig } from "../src/config/env.validation";

/** §37/§38/§80-81, §115 Phase 8: post-event reviews + organizer aggregate rating. */
describe("Reviews (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const testEmailPrefix = "e2e-reviews-";
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
    await prisma.eventReview.deleteMany({ where: { event: { owner: { email: { startsWith: testEmailPrefix } } } } });
    await prisma.registration.deleteMany({ where: { event: { owner: { email: { startsWith: testEmailPrefix } } } } });
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

  async function createPublishedEvent(token: string): Promise<{ id: string; slug: string }> {
    await request(app.getHttpServer()).post("/api/v1/credits/claim-free").set("Authorization", `Bearer ${token}`);
    const created = await request(app.getHttpServer())
      .post("/api/v1/events")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Reviews Fixture Event" })
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
      .post(`/api/v1/events/${created.body.id}/publish`)
      .set("Authorization", `Bearer ${token}`)
      .expect(201);
    return { id: created.body.id, slug: created.body.slug };
  }

  /** Simulates what EventLifecycleScheduler does at §80, without waiting for the cron. */
  async function markCompleted(eventId: string, completedAt = new Date()): Promise<void> {
    await prisma.event.update({ where: { id: eventId }, data: { status: "COMPLETED", completedAt } });
  }

  async function registerAttendee(eventId: string, token: string): Promise<void> {
    await request(app.getHttpServer())
      .post(`/api/v1/events/${eventId}/registrations`)
      .set("Authorization", `Bearer ${token}`)
      .send({})
      .expect(201);
  }

  it("rejects a review before the event has completed", async () => {
    const organizer = await registerUser("Organizer1");
    const event = await createPublishedEvent(organizer.token);
    const attendee = await registerUser("Attendee1");
    await registerAttendee(event.id, attendee.token);

    await request(app.getHttpServer())
      .post(`/api/v1/events/${event.id}/reviews`)
      .set("Authorization", `Bearer ${attendee.token}`)
      .send({ rating: 5 })
      .expect(400);
  });

  it("rejects a review from someone without an eligible registration", async () => {
    const organizer = await registerUser("Organizer2");
    const event = await createPublishedEvent(organizer.token);
    await markCompleted(event.id);
    const stranger = await registerUser("Stranger1");

    await request(app.getHttpServer())
      .post(`/api/v1/events/${event.id}/reviews`)
      .set("Authorization", `Bearer ${stranger.token}`)
      .send({ rating: 5 })
      .expect(403);
  });

  it("the organizer cannot review their own event", async () => {
    const organizer = await registerUser("Organizer3");
    const event = await createPublishedEvent(organizer.token);
    await markCompleted(event.id);

    await request(app.getHttpServer())
      .post(`/api/v1/events/${event.id}/reviews`)
      .set("Authorization", `Bearer ${organizer.token}`)
      .send({ rating: 5 })
      .expect(400);
  });

  it("rejects an out-of-range rating", async () => {
    const organizer = await registerUser("Organizer4");
    const event = await createPublishedEvent(organizer.token);
    const attendee = await registerUser("Attendee2");
    await registerAttendee(event.id, attendee.token);
    await markCompleted(event.id);

    await request(app.getHttpServer())
      .post(`/api/v1/events/${event.id}/reviews`)
      .set("Authorization", `Bearer ${attendee.token}`)
      .send({ rating: 6 })
      .expect(400);
  });

  it("rejects a review once the review window has closed", async () => {
    const organizer = await registerUser("Organizer5");
    const event = await createPublishedEvent(organizer.token);
    const attendee = await registerUser("Attendee3");
    await registerAttendee(event.id, attendee.token);
    await markCompleted(event.id, new Date(Date.now() - 30 * 86_400_000)); // 30 days ago, default window is 7

    await request(app.getHttpServer())
      .post(`/api/v1/events/${event.id}/reviews`)
      .set("Authorization", `Bearer ${attendee.token}`)
      .send({ rating: 4 })
      .expect(400);
  });

  it("creates a review, lists it publicly, shows it in the event's summary, and a second submission updates rather than duplicates it", async () => {
    const organizer = await registerUser("Organizer6");
    const event = await createPublishedEvent(organizer.token);
    const attendee = await registerUser("Attendee4");
    await registerAttendee(event.id, attendee.token);
    await markCompleted(event.id);

    const created = await request(app.getHttpServer())
      .post(`/api/v1/events/${event.id}/reviews`)
      .set("Authorization", `Bearer ${attendee.token}`)
      .send({ rating: 4, text: "Pretty good!" })
      .expect(201);
    expect(created.body.rating).toBe(4);

    const updated = await request(app.getHttpServer())
      .post(`/api/v1/events/${event.id}/reviews`)
      .set("Authorization", `Bearer ${attendee.token}`)
      .send({ rating: 5, text: "Actually, great!" })
      .expect(201);
    expect(updated.body.id).toBe(created.body.id);
    expect(updated.body.rating).toBe(5);

    const list = await request(app.getHttpServer()).get(`/api/v1/events/${event.id}/reviews`).expect(200);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].rating).toBe(5);
    expect(list.body.items[0].text).toBe("Actually, great!");

    const eventPage = await request(app.getHttpServer()).get(`/api/v1/events/slug/${event.slug}`).expect(200);
    expect(eventPage.body.reviewSummary).toEqual({ average: 5, count: 1 });

    const profile = await request(app.getHttpServer()).get(`/api/v1/users/${organizer.userId}/profile`).expect(200);
    expect(profile.body.ratingAverage).toBe(5);
    expect(profile.body.reviewsCount).toBe(1);
  });

  it("the author can delete their own review, but a stranger cannot", async () => {
    const organizer = await registerUser("Organizer7");
    const event = await createPublishedEvent(organizer.token);
    const attendee = await registerUser("Attendee5");
    await registerAttendee(event.id, attendee.token);
    await markCompleted(event.id);

    const created = await request(app.getHttpServer())
      .post(`/api/v1/events/${event.id}/reviews`)
      .set("Authorization", `Bearer ${attendee.token}`)
      .send({ rating: 3 })
      .expect(201);

    const stranger = await registerUser("Stranger2");
    await request(app.getHttpServer())
      .delete(`/api/v1/reviews/${created.body.id}`)
      .set("Authorization", `Bearer ${stranger.token}`)
      .expect(403);

    await request(app.getHttpServer())
      .delete(`/api/v1/reviews/${created.body.id}`)
      .set("Authorization", `Bearer ${attendee.token}`)
      .expect(204);

    const list = await request(app.getHttpServer()).get(`/api/v1/events/${event.id}/reviews`).expect(200);
    expect(list.body.items).toHaveLength(0);
  });
});
