import { ConfigService } from "@nestjs/config";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/bootstrap";
import { PrismaService } from "../src/prisma/prisma.service";
import type { EnvConfig } from "../src/config/env.validation";

/** §71, §115 Phase 7: organizer invites a past participant to a new event. */
describe("Invitations (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const testEmailPrefix = "e2e-invitations-";
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
    await prisma.eventInvitation.deleteMany({ where: { inviter: { email: { startsWith: testEmailPrefix } } } });
    await prisma.notification.deleteMany({ where: { user: { email: { startsWith: testEmailPrefix } } } });
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

  async function createPublishedEvent(token: string, title: string): Promise<string> {
    await request(app.getHttpServer()).post("/api/v1/credits/claim-free").set("Authorization", `Bearer ${token}`);
    const created = await request(app.getHttpServer())
      .post("/api/v1/events")
      .set("Authorization", `Bearer ${token}`)
      .send({ title })
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

  it("finds a genuine past participant as a candidate, invites them, and notifies them", async () => {
    const organizer = await registerUser("Organizer");
    const pastEventId = await createPublishedEvent(organizer.token, "Past Fixture Event");
    const participant = await registerUser("Participant");
    await request(app.getHttpServer())
      .post(`/api/v1/events/${pastEventId}/registrations`)
      .set("Authorization", `Bearer ${participant.token}`)
      .send({})
      .expect(201);

    const newEventId = await createPublishedEvent(organizer.token, "New Fixture Event");

    const candidates = await request(app.getHttpServer())
      .get(`/api/v1/events/${newEventId}/invitations/candidates`)
      .set("Authorization", `Bearer ${organizer.token}`)
      .expect(200);
    expect(candidates.body.some((c: { id: string }) => c.id === participant.userId)).toBe(true);

    const invitation = await request(app.getHttpServer())
      .post(`/api/v1/events/${newEventId}/invitations`)
      .set("Authorization", `Bearer ${organizer.token}`)
      .send({ inviteeUserId: participant.userId })
      .expect(201);
    expect(invitation.body.status).toBe("PENDING");

    const notification = await prisma.notification.findFirst({
      where: { userId: participant.userId, type: "ORGANIZER_NEW_EVENT" },
    });
    expect(notification).not.toBeNull();

    // Now that they're invited, they no longer show up as a fresh candidate.
    const candidatesAfter = await request(app.getHttpServer())
      .get(`/api/v1/events/${newEventId}/invitations/candidates`)
      .set("Authorization", `Bearer ${organizer.token}`)
      .expect(200);
    expect(candidatesAfter.body.some((c: { id: string }) => c.id === participant.userId)).toBe(false);
  });

  it("someone who never participated in any of the organizer's events is not a candidate", async () => {
    const organizer = await registerUser("Organizer2");
    const eventId = await createPublishedEvent(organizer.token, "Solo Fixture Event");
    const stranger = await registerUser("NeverParticipated");

    const candidates = await request(app.getHttpServer())
      .get(`/api/v1/events/${eventId}/invitations/candidates`)
      .set("Authorization", `Bearer ${organizer.token}`)
      .expect(200);
    expect(candidates.body.some((c: { id: string }) => c.id === stranger.userId)).toBe(false);
  });

  it("the invitee can accept or decline, but only their own invitation", async () => {
    const organizer = await registerUser("Organizer3");
    const pastEventId = await createPublishedEvent(organizer.token, "Past Fixture Event 2");
    const participant = await registerUser("Participant2");
    await request(app.getHttpServer())
      .post(`/api/v1/events/${pastEventId}/registrations`)
      .set("Authorization", `Bearer ${participant.token}`)
      .send({})
      .expect(201);
    const newEventId = await createPublishedEvent(organizer.token, "New Fixture Event 2");
    const invitation = await request(app.getHttpServer())
      .post(`/api/v1/events/${newEventId}/invitations`)
      .set("Authorization", `Bearer ${organizer.token}`)
      .send({ inviteeUserId: participant.userId })
      .expect(201);

    const stranger = await registerUser("Stranger");
    await request(app.getHttpServer())
      .patch(`/api/v1/invitations/${invitation.body.id}/accept`)
      .set("Authorization", `Bearer ${stranger.token}`)
      .expect(403);

    const mine = await request(app.getHttpServer())
      .get("/api/v1/invitations/mine")
      .set("Authorization", `Bearer ${participant.token}`)
      .expect(200);
    expect(mine.body.some((i: { id: string }) => i.id === invitation.body.id)).toBe(true);

    await request(app.getHttpServer())
      .patch(`/api/v1/invitations/${invitation.body.id}/accept`)
      .set("Authorization", `Bearer ${participant.token}`)
      .expect(200);

    const mineAfter = await request(app.getHttpServer())
      .get("/api/v1/invitations/mine")
      .set("Authorization", `Bearer ${participant.token}`)
      .expect(200);
    expect(mineAfter.body.some((i: { id: string }) => i.id === invitation.body.id)).toBe(false);
  });

  it("only someone with INVITE_PREVIOUS_PARTICIPANTS can search candidates or invite", async () => {
    const organizer = await registerUser("Organizer4");
    const eventId = await createPublishedEvent(organizer.token, "Permission Fixture Event");
    const stranger = await registerUser("Stranger2");

    await request(app.getHttpServer())
      .get(`/api/v1/events/${eventId}/invitations/candidates`)
      .set("Authorization", `Bearer ${stranger.token}`)
      .expect(403);
    await request(app.getHttpServer())
      .post(`/api/v1/events/${eventId}/invitations`)
      .set("Authorization", `Bearer ${stranger.token}`)
      .send({ inviteeUserId: organizer.userId })
      .expect(403);
  });
});
