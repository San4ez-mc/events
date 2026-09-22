import { ConfigService } from "@nestjs/config";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/bootstrap";
import { PrismaService } from "../src/prisma/prisma.service";
import type { EnvConfig } from "../src/config/env.validation";

/** §22/§23/§36/§82-83, §115 Phase 6: public profiles, privacy toggles, private notes, "friends going". */
describe("Profile & private notes (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const testEmailPrefix = "e2e-profile-";
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
    await prisma.privateUserNote.deleteMany({ where: { author: { email: { startsWith: testEmailPrefix } } } });
    await prisma.friendship.deleteMany({ where: { requester: { email: { startsWith: testEmailPrefix } } } });
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

  async function befriend(a: { token: string; userId: string }, b: { token: string; userId: string }) {
    const sent = await request(app.getHttpServer())
      .post("/api/v1/friends/requests")
      .set("Authorization", `Bearer ${a.token}`)
      .send({ addresseeId: b.userId })
      .expect(201);
    await request(app.getHttpServer())
      .patch(`/api/v1/friends/requests/${sent.body.id}/accept`)
      .set("Authorization", `Bearer ${b.token}`)
      .expect(200);
  }

  async function createPublishedEvent(token: string): Promise<string> {
    await request(app.getHttpServer()).post("/api/v1/credits/claim-free").set("Authorization", `Bearer ${token}`);
    const created = await request(app.getHttpServer())
      .post("/api/v1/events")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Profile Fixture Event" })
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
    return created.body.id;
  }

  it("public profile never leaks phone, and hides social links / upcoming events when opted out", async () => {
    const owner = await registerUser("Owner");
    await request(app.getHttpServer())
      .patch("/api/v1/users/me")
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ bio: "Table tennis enjoyer" })
      .expect(200);
    await createPublishedEvent(owner.token);

    const viewer = await registerUser("Viewer");

    const before = await request(app.getHttpServer())
      .get(`/api/v1/users/${owner.userId}/profile`)
      .set("Authorization", `Bearer ${viewer.token}`)
      .expect(200);
    expect(before.body.phone).toBeUndefined();
    expect(before.body.upcomingEvents.length).toBeGreaterThan(0);
    expect(before.body.relationshipStatus).toBe("NONE");

    await request(app.getHttpServer())
      .patch("/api/v1/users/me/preferences")
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ hideUpcomingEvents: true, hideSocialLinks: true })
      .expect(200);

    const after = await request(app.getHttpServer())
      .get(`/api/v1/users/${owner.userId}/profile`)
      .set("Authorization", `Bearer ${viewer.token}`)
      .expect(200);
    expect(after.body.upcomingEvents).toHaveLength(0);
    expect(after.body.socialLinks).toHaveLength(0);
  });

  it("a user blocked by the target can't view their profile (404, not leaking existence)", async () => {
    const owner = await registerUser("Owner");
    const blocked = await registerUser("Blocked");

    await request(app.getHttpServer())
      .post("/api/v1/friends/blocks")
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ userId: blocked.userId })
      .expect(204);

    await request(app.getHttpServer())
      .get(`/api/v1/users/${owner.userId}/profile`)
      .set("Authorization", `Bearer ${blocked.token}`)
      .expect(404);
  });

  it("event page shows how many of the viewer's friends are going (§34's friend event status)", async () => {
    const organizer = await registerUser("Organizer");
    await request(app.getHttpServer()).post("/api/v1/credits/claim-free").set("Authorization", `Bearer ${organizer.token}`);
    const created = await request(app.getHttpServer())
      .post("/api/v1/events")
      .set("Authorization", `Bearer ${organizer.token}`)
      .send({ title: "Friends Going Fixture Event" })
      .expect(201);
    await request(app.getHttpServer())
      .patch(`/api/v1/events/${created.body.id}`)
      .set("Authorization", `Bearer ${organizer.token}`)
      .send({
        description: "A perfectly normal description.",
        categoryId: sportCategoryId,
        cityId: kyivCityId,
        startsAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      })
      .expect(200);
    const publishRes = await request(app.getHttpServer())
      .post(`/api/v1/events/${created.body.id}/publish`)
      .set("Authorization", `Bearer ${organizer.token}`)
      .expect(201);
    const slug = publishRes.body.slug;

    const viewer = await registerUser("Viewer");
    const friend = await registerUser("Friend");
    const stranger = await registerUser("Stranger2");
    await befriend(viewer, friend);

    await request(app.getHttpServer())
      .post(`/api/v1/events/${created.body.id}/registrations`)
      .set("Authorization", `Bearer ${friend.token}`)
      .send({})
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/events/${created.body.id}/registrations`)
      .set("Authorization", `Bearer ${stranger.token}`)
      .send({})
      .expect(201);

    const page = await request(app.getHttpServer())
      .get(`/api/v1/events/slug/${slug}`)
      .set("Authorization", `Bearer ${viewer.token}`)
      .expect(200);
    expect(page.body.friendsGoing.count).toBe(1);
    expect(page.body.friendsGoing.previews[0].id).toBe(friend.userId);
  });

  it("private notes are author-scoped: upsert is idempotent per (author,target,event), never exposed to the target", async () => {
    const author = await registerUser("Author");
    const target = await registerUser("Target");

    const created = await request(app.getHttpServer())
      .put(`/api/v1/users/${target.userId}/notes`)
      .set("Authorization", `Bearer ${author.token}`)
      .send({ note: "Great teammate" })
      .expect(200);

    const updated = await request(app.getHttpServer())
      .put(`/api/v1/users/${target.userId}/notes`)
      .set("Authorization", `Bearer ${author.token}`)
      .send({ note: "Great teammate, very punctual" })
      .expect(200);
    expect(updated.body.id).toBe(created.body.id);

    const list = await request(app.getHttpServer())
      .get(`/api/v1/users/${target.userId}/notes`)
      .set("Authorization", `Bearer ${author.token}`)
      .expect(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].note).toBe("Great teammate, very punctual");

    // The target has no way to read notes about themselves.
    const targetsOwnList = await request(app.getHttpServer())
      .get(`/api/v1/users/${author.userId}/notes`)
      .set("Authorization", `Bearer ${target.token}`)
      .expect(200);
    expect(targetsOwnList.body).toHaveLength(0);
  });

  it("an event-scoped note is separate from the general note, and only the author can delete it", async () => {
    const author = await registerUser("Author");
    const target = await registerUser("Target");
    const eventId = await createPublishedEvent(author.token);

    await request(app.getHttpServer())
      .put(`/api/v1/users/${target.userId}/notes`)
      .set("Authorization", `Bearer ${author.token}`)
      .send({ note: "General note" })
      .expect(200);
    const scoped = await request(app.getHttpServer())
      .put(`/api/v1/users/${target.userId}/notes`)
      .set("Authorization", `Bearer ${author.token}`)
      .send({ note: "Note about this specific event", eventId })
      .expect(200);

    const list = await request(app.getHttpServer())
      .get(`/api/v1/users/${target.userId}/notes`)
      .set("Authorization", `Bearer ${author.token}`)
      .expect(200);
    expect(list.body).toHaveLength(2);

    const stranger = await registerUser("Stranger3");
    await request(app.getHttpServer())
      .delete(`/api/v1/users/${target.userId}/notes/${scoped.body.id}`)
      .set("Authorization", `Bearer ${stranger.token}`)
      .expect(403);

    await request(app.getHttpServer())
      .delete(`/api/v1/users/${target.userId}/notes/${scoped.body.id}`)
      .set("Authorization", `Bearer ${author.token}`)
      .expect(204);
  });
});
