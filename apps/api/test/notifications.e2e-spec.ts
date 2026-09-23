import { ConfigService } from "@nestjs/config";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { Prisma } from "@prisma/client";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/bootstrap";
import { PrismaService } from "../src/prisma/prisma.service";
import type { EnvConfig } from "../src/config/env.validation";

/** §40-44, §115 Phase 5: in-app notifications fired by the registration/event lifecycle. */
describe("Notifications (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const testEmailPrefix = "e2e-notifications-";
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
    await prisma.userDevice.deleteMany({ where: { user: { email: { startsWith: testEmailPrefix } } } });
    await prisma.notification.deleteMany({ where: { user: { email: { startsWith: testEmailPrefix } } } });
    await prisma.registrationAnswer.deleteMany({ where: { field: { event: { owner: { email: { startsWith: testEmailPrefix } } } } } });
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

  async function createPublishedEvent(
    overrides: { approvalMode?: "AUTO" | "ORGANIZER_APPROVAL"; priceType?: "FREE" | "PAID"; capacity?: number } = {},
  ): Promise<{ eventId: string; organizerToken: string; organizerId: string }> {
    const { token, userId } = await registerUser("Organizer");
    await request(app.getHttpServer()).post("/api/v1/credits/claim-free").set("Authorization", `Bearer ${token}`);

    const created = await request(app.getHttpServer())
      .post("/api/v1/events")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Notification Fixture Event" })
      .expect(201);
    const eventId = created.body.id;

    await request(app.getHttpServer())
      .patch(`/api/v1/events/${eventId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        description: "A perfectly normal description.",
        categoryId: sportCategoryId,
        cityId: kyivCityId,
        startsAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
        approvalMode: overrides.approvalMode ?? "AUTO",
        priceType: overrides.priceType ?? "FREE",
        price: overrides.priceType === "PAID" ? 200 : undefined,
        paymentUrl: overrides.priceType === "PAID" ? "https://example.com/pay" : undefined,
        capacity: overrides.capacity,
      })
      .expect(200);

    await request(app.getHttpServer())
      .post(`/api/v1/events/${eventId}/publish`)
      .set("Authorization", `Bearer ${token}`)
      .expect(201);

    return { eventId, organizerToken: token, organizerId: userId };
  }

  async function latestNotification(userId: string, type: Prisma.NotificationWhereInput["type"]) {
    return prisma.notification.findFirst({ where: { userId, type }, orderBy: { createdAt: "desc" } });
  }

  it("notifies the organizer when someone registers", async () => {
    const { eventId, organizerId } = await createPublishedEvent();
    const attendee = await registerUser();

    await request(app.getHttpServer())
      .post(`/api/v1/events/${eventId}/registrations`)
      .set("Authorization", `Bearer ${attendee.token}`)
      .send({})
      .expect(201);

    const notification = await latestNotification(organizerId, "REGISTRATION_RECEIVED");
    expect(notification).not.toBeNull();
    expect((notification!.payloadJson as { eventId: string }).eventId).toBe(eventId);
  });

  it("notifies the attendee on approve and reject", async () => {
    const { eventId, organizerToken } = await createPublishedEvent({ approvalMode: "ORGANIZER_APPROVAL" });
    const approved = await registerUser();
    const rejected = await registerUser();

    const approvedReg = await request(app.getHttpServer())
      .post(`/api/v1/events/${eventId}/registrations`)
      .set("Authorization", `Bearer ${approved.token}`)
      .send({})
      .expect(201);
    const rejectedReg = await request(app.getHttpServer())
      .post(`/api/v1/events/${eventId}/registrations`)
      .set("Authorization", `Bearer ${rejected.token}`)
      .send({})
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/api/v1/events/${eventId}/registrations/${approvedReg.body.id}/approve`)
      .set("Authorization", `Bearer ${organizerToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/api/v1/events/${eventId}/registrations/${rejectedReg.body.id}/reject`)
      .set("Authorization", `Bearer ${organizerToken}`)
      .send({})
      .expect(200);

    expect(await latestNotification(approved.userId, "REGISTRATION_APPROVED")).not.toBeNull();
    expect(await latestNotification(rejected.userId, "REGISTRATION_REJECTED")).not.toBeNull();
  });

  it("notifies on the paid flow: organizer on mark-paid, attendee on confirm-payment", async () => {
    const { eventId, organizerToken, organizerId } = await createPublishedEvent({ priceType: "PAID" });
    const attendee = await registerUser();

    const created = await request(app.getHttpServer())
      .post(`/api/v1/events/${eventId}/registrations`)
      .set("Authorization", `Bearer ${attendee.token}`)
      .send({})
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/api/v1/registrations/${created.body.id}/mark-paid`)
      .set("Authorization", `Bearer ${attendee.token}`)
      .expect(200);
    expect(await latestNotification(organizerId, "PAYMENT_PENDING")).not.toBeNull();

    await request(app.getHttpServer())
      .patch(`/api/v1/events/${eventId}/registrations/${created.body.id}/confirm-payment`)
      .set("Authorization", `Bearer ${organizerToken}`)
      .expect(200);
    expect(await latestNotification(attendee.userId, "PAYMENT_CONFIRMED")).not.toBeNull();
  });

  it("notifies the promoted attendee when a waitlist spot opens up", async () => {
    const { eventId } = await createPublishedEvent({ capacity: 1 });
    const first = await registerUser();
    const second = await registerUser();

    await request(app.getHttpServer())
      .post(`/api/v1/events/${eventId}/registrations`)
      .set("Authorization", `Bearer ${first.token}`)
      .send({})
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/events/${eventId}/registrations`)
      .set("Authorization", `Bearer ${second.token}`)
      .send({ joinWaitlist: true })
      .expect(201);

    const firstRegistration = await prisma.registration.findFirstOrThrow({ where: { eventId, userId: first.userId } });
    await request(app.getHttpServer())
      .patch(`/api/v1/registrations/${firstRegistration.id}/cancel`)
      .set("Authorization", `Bearer ${first.token}`)
      .expect(200);

    expect(await latestNotification(second.userId, "WAITLIST_SPOT_OPENED")).not.toBeNull();
  });

  it("notifies every active registrant when the organizer cancels the event (§79)", async () => {
    const { eventId, organizerToken } = await createPublishedEvent();
    const attendee = await registerUser();

    await request(app.getHttpServer())
      .post(`/api/v1/events/${eventId}/registrations`)
      .set("Authorization", `Bearer ${attendee.token}`)
      .send({})
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/events/${eventId}/cancel`)
      .set("Authorization", `Bearer ${organizerToken}`)
      .send({ reason: "Rain" })
      .expect(201);

    const notification = await latestNotification(attendee.userId, "EVENT_CANCELLED");
    expect(notification).not.toBeNull();
    expect(notification!.body).toContain("Rain");
  });

  it("GET /notifications lists mine, unread-count and mark-read/read-all work", async () => {
    const { eventId, organizerToken } = await createPublishedEvent();
    const attendee = await registerUser();
    await request(app.getHttpServer())
      .post(`/api/v1/events/${eventId}/registrations`)
      .set("Authorization", `Bearer ${attendee.token}`)
      .send({})
      .expect(201);

    const list = await request(app.getHttpServer())
      .get("/api/v1/notifications")
      .set("Authorization", `Bearer ${organizerToken}`)
      .expect(200);
    expect(list.body.items.length).toBeGreaterThan(0);
    const notificationId = list.body.items[0].id;

    const unread = await request(app.getHttpServer())
      .get("/api/v1/notifications/unread-count")
      .set("Authorization", `Bearer ${organizerToken}`)
      .expect(200);
    expect(unread.body.count).toBeGreaterThan(0);

    await request(app.getHttpServer())
      .patch(`/api/v1/notifications/${notificationId}/read`)
      .set("Authorization", `Bearer ${organizerToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .patch("/api/v1/notifications/read-all")
      .set("Authorization", `Bearer ${organizerToken}`)
      .expect(204);

    const afterReadAll = await request(app.getHttpServer())
      .get("/api/v1/notifications/unread-count")
      .set("Authorization", `Bearer ${organizerToken}`)
      .expect(200);
    expect(afterReadAll.body.count).toBe(0);
  });

  it("a stranger cannot mark someone else's notification as read", async () => {
    const { organizerId } = await createPublishedEvent();
    const notification = await prisma.notification.create({
      data: { userId: organizerId, type: "REGISTRATION_RECEIVED", title: "t", body: "b" },
    });
    const stranger = await registerUser();

    await request(app.getHttpServer())
      .patch(`/api/v1/notifications/${notification.id}/read`)
      .set("Authorization", `Bearer ${stranger.token}`)
      .expect(403);
  });

  it("requires authentication", async () => {
    await request(app.getHttpServer()).get("/api/v1/notifications").expect(401);
    await request(app.getHttpServer()).get("/api/v1/notifications/unread-count").expect(401);
  });

  describe("device registration (§41)", () => {
    it("registers a device, re-registering the same token refreshes it instead of duplicating", async () => {
      const { token, userId } = await registerUser();
      const pushToken = `ExponentPushToken[${Date.now()}]`;

      await request(app.getHttpServer())
        .post("/api/v1/notifications/devices")
        .set("Authorization", `Bearer ${token}`)
        .send({ pushToken, platform: "IOS" })
        .expect(204);

      await request(app.getHttpServer())
        .post("/api/v1/notifications/devices")
        .set("Authorization", `Bearer ${token}`)
        .send({ pushToken, platform: "IOS" })
        .expect(204);

      const devices = await prisma.userDevice.findMany({ where: { userId, pushToken } });
      expect(devices).toHaveLength(1);
      expect(devices[0]!.active).toBe(true);
    });

    it("unregistering deactivates the device without deleting its history", async () => {
      const { token, userId } = await registerUser();
      const pushToken = `ExponentPushToken[${Date.now()}-2]`;

      await request(app.getHttpServer())
        .post("/api/v1/notifications/devices")
        .set("Authorization", `Bearer ${token}`)
        .send({ pushToken, platform: "ANDROID" })
        .expect(204);

      await request(app.getHttpServer())
        .delete(`/api/v1/notifications/devices/${pushToken}`)
        .set("Authorization", `Bearer ${token}`)
        .expect(204);

      const device = await prisma.userDevice.findUniqueOrThrow({ where: { userId_pushToken: { userId, pushToken } } });
      expect(device.active).toBe(false);
    });
  });
});
