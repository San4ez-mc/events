import { ConfigService } from "@nestjs/config";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/bootstrap";
import { PrismaService } from "../src/prisma/prisma.service";
import type { EnvConfig } from "../src/config/env.validation";

/** §30, §115 Phase 7: co-organizers (event_collaborators) and their scoped permissions. */
describe("Collaborators (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const testEmailPrefix = "e2e-collaborators-";
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
    await prisma.eventCollaborator.deleteMany({ where: { event: { owner: { email: { startsWith: testEmailPrefix } } } } });
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

  async function createDraftEvent(token: string): Promise<string> {
    await request(app.getHttpServer()).post("/api/v1/credits/claim-free").set("Authorization", `Bearer ${token}`);
    const created = await request(app.getHttpServer())
      .post("/api/v1/events")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Collaborator Fixture Event" })
      .expect(201);
    return created.body.id;
  }

  it("a stranger cannot edit, but a collaborator with EDIT_EVENT can", async () => {
    const owner = await registerUser("Owner");
    const eventId = await createDraftEvent(owner.token);
    const manager = await registerUser("Manager");

    await request(app.getHttpServer())
      .patch(`/api/v1/events/${eventId}`)
      .set("Authorization", `Bearer ${manager.token}`)
      .send({ description: "Trying without access" })
      .expect(403);

    await request(app.getHttpServer())
      .post(`/api/v1/events/${eventId}/collaborators`)
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ userId: manager.userId, permissions: ["EDIT_EVENT"] })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/api/v1/events/${eventId}`)
      .set("Authorization", `Bearer ${manager.token}`)
      .send({ description: "Now I can edit this." })
      .expect(200);
  });

  it("a collaborator without MANAGE_REGISTRATIONS can't approve registrations, but one with it can", async () => {
    const owner = await registerUser("Owner");
    const eventId = await createDraftEvent(owner.token);
    await request(app.getHttpServer())
      .patch(`/api/v1/events/${eventId}`)
      .set("Authorization", `Bearer ${owner.token}`)
      .send({
        description: "A perfectly normal description.",
        categoryId: sportCategoryId,
        cityId: kyivCityId,
        startsAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
        approvalMode: "ORGANIZER_APPROVAL",
      })
      .expect(200);
    await request(app.getHttpServer())
      .post(`/api/v1/events/${eventId}/publish`)
      .set("Authorization", `Bearer ${owner.token}`)
      .expect(201);

    const manager = await registerUser("Manager");
    await request(app.getHttpServer())
      .post(`/api/v1/events/${eventId}/collaborators`)
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ userId: manager.userId, permissions: ["EDIT_EVENT"] })
      .expect(201);

    const attendee = await registerUser("Attendee");
    const registration = await request(app.getHttpServer())
      .post(`/api/v1/events/${eventId}/registrations`)
      .set("Authorization", `Bearer ${attendee.token}`)
      .send({})
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/api/v1/events/${eventId}/registrations/${registration.body.id}/approve`)
      .set("Authorization", `Bearer ${manager.token}`)
      .expect(403);

    await request(app.getHttpServer())
      .post(`/api/v1/events/${eventId}/collaborators`)
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ userId: manager.userId, permissions: ["EDIT_EVENT", "MANAGE_REGISTRATIONS"] })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/api/v1/events/${eventId}/registrations/${registration.body.id}/approve`)
      .set("Authorization", `Bearer ${manager.token}`)
      .expect(200);
  });

  it("only the owner can add/update/remove collaborators, not a collaborator themselves", async () => {
    const owner = await registerUser("Owner");
    const eventId = await createDraftEvent(owner.token);
    const manager = await registerUser("Manager");
    const stranger = await registerUser("Stranger");

    const added = await request(app.getHttpServer())
      .post(`/api/v1/events/${eventId}/collaborators`)
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ userId: manager.userId, permissions: ["EDIT_EVENT"] })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/events/${eventId}/collaborators`)
      .set("Authorization", `Bearer ${manager.token}`)
      .send({ userId: stranger.userId, permissions: ["EDIT_EVENT"] })
      .expect(403);

    const list = await request(app.getHttpServer())
      .get(`/api/v1/events/${eventId}/collaborators`)
      .set("Authorization", `Bearer ${owner.token}`)
      .expect(200);
    expect(list.body).toHaveLength(1);

    await request(app.getHttpServer())
      .delete(`/api/v1/events/${eventId}/collaborators/${added.body.id}`)
      .set("Authorization", `Bearer ${manager.token}`)
      .expect(403);

    await request(app.getHttpServer())
      .delete(`/api/v1/events/${eventId}/collaborators/${added.body.id}`)
      .set("Authorization", `Bearer ${owner.token}`)
      .expect(204);
  });

  it("adding the same user twice replaces their permission set instead of erroring", async () => {
    const owner = await registerUser("Owner");
    const eventId = await createDraftEvent(owner.token);
    const manager = await registerUser("Manager");

    await request(app.getHttpServer())
      .post(`/api/v1/events/${eventId}/collaborators`)
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ userId: manager.userId, permissions: ["EDIT_EVENT"] })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/events/${eventId}/collaborators`)
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ userId: manager.userId, permissions: ["VIEW_ANALYTICS"] })
      .expect(201);

    const list = await request(app.getHttpServer())
      .get(`/api/v1/events/${eventId}/collaborators`)
      .set("Authorization", `Bearer ${owner.token}`)
      .expect(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].permissions).toEqual(["VIEW_ANALYTICS"]);
  });
});
