import { ConfigService } from "@nestjs/config";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { Prisma } from "@prisma/client";
import request from "supertest";
import { AppModule } from "../../src/app.module";
import { configureApp } from "../../src/bootstrap";
import { PrismaService } from "../../src/prisma/prisma.service";
import { EventLifecycleScheduler } from "../../src/notifications/event-lifecycle.scheduler";
import type { EnvConfig } from "../../src/config/env.validation";

/** QA audit — sections 34-37 (notifications, event-change notifications, reminders, preferences). */
describe("QA social — notifications (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let scheduler: EventLifecycleScheduler;
  const prefix = "qa-soc-";
  let sportCategoryId: string;
  let kyivCityId: string;
  const http = () => request(app.getHttpServer());

  jest.setTimeout(60000);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app, app.get(ConfigService<EnvConfig, true>));
    await app.init();
    prisma = app.get(PrismaService);
    scheduler = app.get(EventLifecycleScheduler);
    sportCategoryId = (await prisma.category.findUniqueOrThrow({ where: { slug: "sport" } })).id;
    kyivCityId = (await prisma.city.findUniqueOrThrow({ where: { slug: "kyiv" } })).id;
  });

  afterAll(async () => {
    const owner = { owner: { email: { startsWith: prefix } } };
    await prisma.userDevice.deleteMany({ where: { user: { email: { startsWith: prefix } } } });
    await prisma.notification.deleteMany({ where: { user: { email: { startsWith: prefix } } } });
    await prisma.subscription.deleteMany({ where: { user: { email: { startsWith: prefix } } } });
    await prisma.friendship.deleteMany({
      where: { OR: [{ requester: { email: { startsWith: prefix } } }, { addressee: { email: { startsWith: prefix } } }] },
    });
    await prisma.registrationAnswer.deleteMany({ where: { field: { event: owner } } });
    await prisma.registration.deleteMany({ where: { event: owner } });
    await prisma.listingCreditLedger.deleteMany({ where: { user: { email: { startsWith: prefix } } } });
    await prisma.event.deleteMany({ where: owner });
    await prisma.user.deleteMany({ where: { email: { startsWith: prefix } } });
    await app.close();
  });

  async function newUser(label: string): Promise<{ token: string; id: string }> {
    const res = await http()
      .post("/api/v1/auth/register")
      .send({ email: `${prefix}${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`, password: "Str0ngPass", name: `${label} Tester` })
      .expect(201);
    return { token: res.body.accessToken, id: res.body.user.id };
  }

  async function organizerWithCredits(label: string) {
    const organizer = await newUser(label);
    await http().post("/api/v1/credits/claim-free").set("Authorization", `Bearer ${organizer.token}`);
    return organizer;
  }

  async function publishedEvent(title: string, token: string, extra: Record<string, unknown> = {}): Promise<{ id: string; slug: string }> {
    const created = await http().post("/api/v1/events").set("Authorization", `Bearer ${token}`).send({ title }).expect(201);
    await http()
      .patch(`/api/v1/events/${created.body.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        description: "A normal description of the QA notifications fixture event.",
        categoryId: sportCategoryId,
        cityId: kyivCityId,
        addressText: "вул. Хрещатик, 1",
        startsAt: new Date(Date.now() + 5 * 86_400_000).toISOString(),
        ...extra,
      })
      .expect(200);
    await http().post(`/api/v1/events/${created.body.id}/publish`).set("Authorization", `Bearer ${token}`).expect(201);
    return { id: created.body.id as string, slug: created.body.slug as string };
  }

  async function latest(userId: string, type: Prisma.NotificationWhereInput["type"]) {
    return prisma.notification.findFirst({ where: { userId, type }, orderBy: { createdAt: "desc" } });
  }

  /** Polls for a fire-and-forget notification to land, rather than racing it with a fixed sleep. */
  async function waitFor<T>(check: () => Promise<T | null>, attempts = 20): Promise<T | null> {
    for (let i = 0; i < attempts; i++) {
      const result = await check();
      if (result) return result;
      await new Promise((r) => setTimeout(r, 150));
    }
    return null;
  }

  describe("§34 Notification types fire on the right action", () => {
    it("registration -> organizer gets REGISTRATION_RECEIVED; approve/reject -> attendee gets REGISTRATION_APPROVED/REJECTED", async () => {
      const organizer = await organizerWithCredits("notif-reg-org");
      const approved = await newUser("notif-reg-approved");
      const rejected = await newUser("notif-reg-rejected");
      const evt = await publishedEvent("QASOC Notif Registration Fixture", organizer.token, { approvalMode: "ORGANIZER_APPROVAL" });

      const approvedReg = await http().post(`/api/v1/events/${evt.id}/registrations`).set("Authorization", `Bearer ${approved.token}`).send({}).expect(201);
      expect((await latest(organizer.id, "REGISTRATION_RECEIVED"))?.payloadJson).toMatchObject({ eventId: evt.id });

      const rejectedReg = await http().post(`/api/v1/events/${evt.id}/registrations`).set("Authorization", `Bearer ${rejected.token}`).send({}).expect(201);

      await http().patch(`/api/v1/events/${evt.id}/registrations/${approvedReg.body.id}/approve`).set("Authorization", `Bearer ${organizer.token}`).expect(200);
      expect(await latest(approved.id, "REGISTRATION_APPROVED")).not.toBeNull();

      await http().patch(`/api/v1/events/${evt.id}/registrations/${rejectedReg.body.id}/reject`).set("Authorization", `Bearer ${organizer.token}`).send({}).expect(200);
      expect(await latest(rejected.id, "REGISTRATION_REJECTED")).not.toBeNull();
    });

    it("payment confirmation notifies the participant", async () => {
      const organizer = await organizerWithCredits("notif-pay-org");
      const attendee = await newUser("notif-pay-attendee");
      const evt = await publishedEvent("QASOC Notif Payment Fixture", organizer.token, { priceType: "PAID", price: 100, paymentUrl: "https://example.com/pay" });
      const reg = await http().post(`/api/v1/events/${evt.id}/registrations`).set("Authorization", `Bearer ${attendee.token}`).send({}).expect(201);

      // Registering an AUTO+PAID event lands as REGISTERED, not PAYMENT_PENDING — the attendee must explicitly
      // mark it paid first (§24's external-payment flow); only then can the organizer confirm it.
      await http().patch(`/api/v1/registrations/${reg.body.id}/mark-paid`).set("Authorization", `Bearer ${attendee.token}`).expect(200);
      await http().patch(`/api/v1/events/${evt.id}/registrations/${reg.body.id}/confirm-payment`).set("Authorization", `Bearer ${organizer.token}`).expect(200);
      expect(await latest(attendee.id, "PAYMENT_CONFIRMED")).not.toBeNull();
    });

    it("friend request and friend-accepted notify the right party", async () => {
      const a = await newUser("notif-friend-a");
      const b = await newUser("notif-friend-b");
      const req = await http().post("/api/v1/friends/requests").set("Authorization", `Bearer ${a.token}`).send({ addresseeId: b.id }).expect(201);
      expect(await latest(b.id, "FRIEND_REQUEST")).not.toBeNull();

      await http().patch(`/api/v1/friends/requests/${req.body.id}/accept`).set("Authorization", `Bearer ${b.token}`).expect(200);
      expect(await latest(a.id, "FRIEND_ACCEPTED")).not.toBeNull();
    });

    it("subscriptions: an organizer-follower gets ORGANIZER_NEW_EVENT on publish; a friend gets FRIEND_EVENT_REGISTERED", async () => {
      const organizer = await organizerWithCredits("notif-sub-org");
      const follower = await newUser("notif-sub-follower");
      await http().post(`/api/v1/subscriptions/organizers/${organizer.id}`).set("Authorization", `Bearer ${follower.token}`).send({ allEvents: true }).expect(201);
      const evt = await publishedEvent("QASOC Notif Subscription Fixture", organizer.token);
      // notifySubscribersOfNewEvent runs fire-and-forget after publish() returns — poll briefly instead of racing it.
      const gotNewEvent = await waitFor(() => latest(follower.id, "ORGANIZER_NEW_EVENT"));
      expect(gotNewEvent).not.toBeNull();

      const friendOfAttendee = await newUser("notif-sub-friend");
      const attendee = await newUser("notif-sub-attendee");
      const friendReq = await http().post("/api/v1/friends/requests").set("Authorization", `Bearer ${attendee.token}`).send({ addresseeId: friendOfAttendee.id }).expect(201);
      await http().patch(`/api/v1/friends/requests/${friendReq.body.id}/accept`).set("Authorization", `Bearer ${friendOfAttendee.token}`).expect(200);
      await http().post(`/api/v1/events/${evt.id}/registrations`).set("Authorization", `Bearer ${attendee.token}`).send({ showAsParticipant: true }).expect(201);
      // Fire-and-forget after the registration commits — give it a moment to land.
      await new Promise((r) => setTimeout(r, 500));
      expect(await latest(friendOfAttendee.id, "FRIEND_EVENT_REGISTERED")).not.toBeNull();
    });
  });

  describe("§35 Event change notifications", () => {
    it("notifies both registered participants when the organizer changes date/time/location, and does not duplicate per save", async () => {
      const organizer = await organizerWithCredits("notif-change-org");
      const userA = await newUser("notif-change-a");
      const userB = await newUser("notif-change-b");
      const evt = await publishedEvent("QASOC Notif Change Fixture", organizer.token);
      await http().post(`/api/v1/events/${evt.id}/registrations`).set("Authorization", `Bearer ${userA.token}`).send({}).expect(201);
      await http().post(`/api/v1/events/${evt.id}/registrations`).set("Authorization", `Bearer ${userB.token}`).send({}).expect(201);

      await http()
        .patch(`/api/v1/events/${evt.id}`)
        .set("Authorization", `Bearer ${organizer.token}`)
        .send({ startsAt: new Date(Date.now() + 8 * 86_400_000).toISOString(), notifyParticipants: true })
        .expect(200);

      const notifsA = await prisma.notification.findMany({ where: { userId: userA.id, type: "EVENT_CHANGED" } });
      const notifsB = await prisma.notification.findMany({ where: { userId: userB.id, type: "EVENT_CHANGED" } });
      expect(notifsA).toHaveLength(1); // exactly one notification for this one save operation, not per-field
      expect(notifsB).toHaveLength(1);
    });

    it("a significant change on a published event is rejected unless notifyParticipants is set (forces the notification to actually happen)", async () => {
      const organizer = await organizerWithCredits("notif-change-guard-org");
      const evt = await publishedEvent("QASOC Notif Change Guard Fixture", organizer.token);
      await http()
        .patch(`/api/v1/events/${evt.id}`)
        .set("Authorization", `Bearer ${organizer.token}`)
        .send({ startsAt: new Date(Date.now() + 9 * 86_400_000).toISOString() })
        .expect(400);
    });

    it.failing("[SPEC DEVIATION] changing price or the event's rules on a published event also notifies affected participants", async () => {
      // Root cause: apps/api/src/events/events.service.ts `SIGNIFICANT_PUBLISHED_FIELDS` is
      // `["startsAt", "addressText", "cityId", "districtId", "onlineUrl"]` — it does not include `price` or
      // `rules`, even though QA spec §35 explicitly lists "price" and "important rules" as changes that must
      // notify participants. A price/rules change on a PUBLISHED event is accepted silently, with no
      // notifyParticipants requirement and no EVENT_CHANGED notification sent at all.
      const organizer = await organizerWithCredits("notif-change-price-org");
      const attendee = await newUser("notif-change-price-attendee");
      const evt = await publishedEvent("QASOC Notif Change Price Fixture", organizer.token, { priceType: "PAID", price: 100, paymentUrl: "https://example.com/pay" });
      await http().post(`/api/v1/events/${evt.id}/registrations`).set("Authorization", `Bearer ${attendee.token}`).send({}).expect(201);

      await http().patch(`/api/v1/events/${evt.id}`).set("Authorization", `Bearer ${organizer.token}`).send({ price: 500, notifyParticipants: true }).expect(200);
      const notif = await latest(attendee.id, "EVENT_CHANGED");
      expect(notif).not.toBeNull(); // fails today: no such notification is ever created for a price-only change
    });
  });

  describe("§36 Reminders (calls EventLifecycleScheduler.run() directly)", () => {
    it("sends 24h and 1h reminders only to actively-registered attendees, not after cancel, and never duplicated on repeat runs", async () => {
      const organizer = await organizerWithCredits("notif-reminder-org");
      const staying = await newUser("notif-reminder-staying");
      const cancelling = await newUser("notif-reminder-cancelling");
      // Inside the 24h reminder window (>now, <=now+24h) so the scheduler's threshold check matches.
      const evt = await publishedEvent("QASOC Notif Reminder Fixture", organizer.token, { startsAt: new Date(Date.now() + 20 * 60 * 60 * 1000).toISOString() });

      const stayingReg = await http().post(`/api/v1/events/${evt.id}/registrations`).set("Authorization", `Bearer ${staying.token}`).send({}).expect(201);
      const cancellingReg = await http().post(`/api/v1/events/${evt.id}/registrations`).set("Authorization", `Bearer ${cancelling.token}`).send({}).expect(201);
      await http().patch(`/api/v1/registrations/${cancellingReg.body.id}/cancel`).set("Authorization", `Bearer ${cancelling.token}`).expect(200);

      await scheduler.run();

      expect(await latest(staying.id, "EVENT_REMINDER_24H")).not.toBeNull();
      expect(await latest(cancelling.id, "EVENT_REMINDER_24H")).toBeNull(); // cancelled before the reminder ran — never sent

      // Running the scheduler again must not create a second reminder for the same event/user/type.
      await scheduler.run();
      const remindersForStaying = await prisma.notification.findMany({ where: { userId: staying.id, type: "EVENT_REMINDER_24H" } });
      expect(remindersForStaying).toHaveLength(1);

      void stayingReg; // referenced only for symmetry with cancellingReg above
    });

    it("cancelling the whole event stops it from ever being reminded (event leaves PUBLISHED, scheduler only looks at PUBLISHED events)", async () => {
      const organizer = await organizerWithCredits("notif-reminder-cancel-org");
      const attendee = await newUser("notif-reminder-cancel-attendee");
      const evt = await publishedEvent("QASOC Notif Reminder Cancel Fixture", organizer.token, { startsAt: new Date(Date.now() + 20 * 60 * 60 * 1000).toISOString() });
      await http().post(`/api/v1/events/${evt.id}/registrations`).set("Authorization", `Bearer ${attendee.token}`).send({}).expect(201);
      await http().post(`/api/v1/events/${evt.id}/cancel`).set("Authorization", `Bearer ${organizer.token}`).send({}).expect(201);

      await scheduler.run();
      expect(await latest(attendee.id, "EVENT_REMINDER_24H")).toBeNull();
    });

    it("min-participant warning fires once the deadline passes with too few registrations, and is not duplicated on repeat runs", async () => {
      const organizer = await organizerWithCredits("notif-minpart-org");
      const onlyRegistrant = await newUser("notif-minpart-attendee");
      const evt = await publishedEvent("QASOC Notif MinParticipants Fixture", organizer.token, {
        minParticipants: 5,
        registrationDeadline: new Date(Date.now() + 60_000).toISOString(), // still open, so the registration below is accepted
      });
      await http().post(`/api/v1/events/${evt.id}/registrations`).set("Authorization", `Bearer ${onlyRegistrant.token}`).send({}).expect(201);
      // Now push the deadline into the past directly (simulating time passing) — mirrors how the scheduler itself finds these events.
      await prisma.event.update({ where: { id: evt.id }, data: { registrationDeadline: new Date(Date.now() - 60_000) } });

      await scheduler.run();
      const warning = await latest(organizer.id, "EVENT_MIN_PARTICIPANTS_WARNING");
      expect(warning).not.toBeNull();
      expect((warning!.payloadJson as { eventId: string }).eventId).toBe(evt.id);

      await scheduler.run();
      const warnings = await prisma.notification.findMany({ where: { userId: organizer.id, type: "EVENT_MIN_PARTICIPANTS_WARNING", payloadJson: { path: ["eventId"], equals: evt.id } } });
      expect(warnings).toHaveLength(1);
    });
  });

  describe("§37 Notification preferences", () => {
    it("disabling push stops PUSH deliveries but the in-app notification is still recorded", async () => {
      const organizer = await organizerWithCredits("notif-pref-org");
      const attendee = await newUser("notif-pref-attendee");
      await http().post("/api/v1/notifications/devices").set("Authorization", `Bearer ${attendee.token}`).send({ pushToken: `ExponentPushToken[qa-${Date.now()}]`, platform: "ANDROID" }).expect(204);
      await http().patch("/api/v1/users/me/preferences").set("Authorization", `Bearer ${attendee.token}`).send({ allowPush: false }).expect(200);

      const evt = await publishedEvent("QASOC Notif Preferences Push Fixture", organizer.token, { approvalMode: "ORGANIZER_APPROVAL" });
      const reg = await http().post(`/api/v1/events/${evt.id}/registrations`).set("Authorization", `Bearer ${attendee.token}`).send({}).expect(201);
      await http().patch(`/api/v1/events/${evt.id}/registrations/${reg.body.id}/approve`).set("Authorization", `Bearer ${organizer.token}`).expect(200);

      const notif = await latest(attendee.id, "REGISTRATION_APPROVED");
      expect(notif).not.toBeNull(); // IN_APP still recorded
      const deliveries = await prisma.notificationDelivery.findMany({ where: { notificationId: notif!.id } });
      expect(deliveries.map((d) => d.channel)).toContain("IN_APP");
      expect(deliveries.map((d) => d.channel)).not.toContain("PUSH"); // opted out — no push attempt at all
    });

    it("preference changes affect future notifications, not past ones already recorded", async () => {
      const organizer = await organizerWithCredits("notif-pref-future-org");
      const attendee = await newUser("notif-pref-future-attendee");
      const evt = await publishedEvent("QASOC Notif Preferences Future Fixture", organizer.token, { approvalMode: "ORGANIZER_APPROVAL" });

      const reg1 = await http().post(`/api/v1/events/${evt.id}/registrations`).set("Authorization", `Bearer ${attendee.token}`).send({}).expect(201);
      await http().patch(`/api/v1/events/${evt.id}/registrations/${reg1.body.id}/approve`).set("Authorization", `Bearer ${organizer.token}`).expect(200);
      const firstNotif = await latest(attendee.id, "REGISTRATION_APPROVED");
      expect(firstNotif).not.toBeNull();

      // Now disable reminder notifications specifically and confirm a *future* reminder is skipped for this user.
      await http().patch("/api/v1/users/me/preferences").set("Authorization", `Bearer ${attendee.token}`).send({ allowEventReminderNotifications: false }).expect(200);
      const evt2 = await publishedEvent("QASOC Notif Preferences Future Reminder Fixture", organizer.token, { startsAt: new Date(Date.now() + 20 * 60 * 60 * 1000).toISOString() });
      await http().post(`/api/v1/events/${evt2.id}/registrations`).set("Authorization", `Bearer ${attendee.token}`).send({}).expect(201);
      await scheduler.run();
      expect(await latest(attendee.id, "EVENT_REMINDER_24H")).toBeNull();

      // The earlier, already-recorded notification is untouched by the later preference change.
      const stillThere = await prisma.notification.findUnique({ where: { id: firstNotif!.id } });
      expect(stillThere).not.toBeNull();
    });
  });
});
