import type { INestApplication } from "@nestjs/common";
import { PrismaService } from "../../src/prisma/prisma.service";
import { bootstrapApp, cleanupQaData, createPublishedEvent, http, newUser } from "./qa-helpers";

jest.setTimeout(120_000); // this shared local Postgres/embedded env runs several QA auditors concurrently; the default 30s per-test timeout is too tight under that contention (see docs/qa/QA_events.md).

/**
 * QA acceptance sections 14 (Registration modes), 15 (Registration form /
 * custom fields), 16 (Cancellation), 22 (Registration deadline/timezone),
 * 23 (Multiple prices/tiers), 24 (External payment).
 */
describe("QA §14/§15/§16/§22/§23/§24 — registration lifecycle (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let categoryId: string;
  let cityId: string;

  beforeAll(async () => {
    const boot = await bootstrapApp();
    app = boot.app;
    prisma = boot.prisma;
    categoryId = (await prisma.category.findUniqueOrThrow({ where: { slug: "sport" } })).id;
    cityId = (await prisma.city.findUniqueOrThrow({ where: { slug: "kyiv" } })).id;
  });

  afterAll(async () => {
    await cleanupQaData(prisma);
    await app.close();
  });

  describe("§14 Registration modes", () => {
    it("Public + free: registration is automatic (REGISTERED immediately)", async () => {
      const { eventId } = await createPublishedEvent(app, categoryId, cityId, { title: "Public Free QA" });
      const attendee = await newUser(app, "pubfree");
      const res = await http(app)
        .post(`/api/v1/events/${eventId}/registrations`)
        .set("Authorization", `Bearer ${attendee.token}`)
        .send({})
        .expect(201);
      expect(res.body.status).toBe("REGISTERED");
    });

    it("Public + paid: user registers, then organizer confirms payment (REGISTERED -> PAYMENT_PENDING -> CONFIRMED)", async () => {
      const { eventId, organizerToken } = await createPublishedEvent(app, categoryId, cityId, {
        title: "Public Paid QA",
        priceType: "PAID",
        price: 300,
      });
      const attendee = await newUser(app, "pubpaid");

      const created = await http(app)
        .post(`/api/v1/events/${eventId}/registrations`)
        .set("Authorization", `Bearer ${attendee.token}`)
        .send({})
        .expect(201);
      expect(created.body.status).toBe("REGISTERED");

      const markedPaid = await http(app)
        .patch(`/api/v1/registrations/${created.body.id}/mark-paid`)
        .set("Authorization", `Bearer ${attendee.token}`)
        .expect(200);
      expect(markedPaid.body.status).toBe("PAYMENT_PENDING");

      const confirmed = await http(app)
        .patch(`/api/v1/events/${eventId}/registrations/${created.body.id}/confirm-payment`)
        .set("Authorization", `Bearer ${organizerToken}`)
        .expect(200);
      expect(confirmed.body.status).toBe("CONFIRMED");
    });

    it("Private event + organizer approval: registration is PENDING, then organizer approves", async () => {
      const { eventId, organizerToken } = await createPublishedEvent(app, categoryId, cityId, {
        title: "Private Approval QA",
        visibility: "PRIVATE",
        approvalMode: "ORGANIZER_APPROVAL",
      });
      const attendee = await newUser(app, "privateapproval");

      const created = await http(app)
        .post(`/api/v1/events/${eventId}/registrations`)
        .set("Authorization", `Bearer ${attendee.token}`)
        .send({})
        .expect(201);
      expect(created.body.status).toBe("PENDING");

      const approved = await http(app)
        .patch(`/api/v1/events/${eventId}/registrations/${created.body.id}/approve`)
        .set("Authorization", `Bearer ${organizerToken}`)
        .expect(200);
      expect(approved.body.status).toBe("REGISTERED");
    });

    it("Public + organizer approval: organizer can approve or reject", async () => {
      const { eventId, organizerToken } = await createPublishedEvent(app, categoryId, cityId, {
        title: "Public Approval QA",
        approvalMode: "ORGANIZER_APPROVAL",
      });
      const toApprove = await newUser(app, "approveme");
      const toReject = await newUser(app, "rejectme");

      const created1 = await http(app)
        .post(`/api/v1/events/${eventId}/registrations`)
        .set("Authorization", `Bearer ${toApprove.token}`)
        .send({})
        .expect(201);
      const created2 = await http(app)
        .post(`/api/v1/events/${eventId}/registrations`)
        .set("Authorization", `Bearer ${toReject.token}`)
        .send({})
        .expect(201);

      const approved = await http(app)
        .patch(`/api/v1/events/${eventId}/registrations/${created1.body.id}/approve`)
        .set("Authorization", `Bearer ${organizerToken}`)
        .expect(200);
      expect(approved.body.status).toBe("REGISTERED");

      const rejected = await http(app)
        .patch(`/api/v1/events/${eventId}/registrations/${created2.body.id}/reject`)
        .set("Authorization", `Bearer ${organizerToken}`)
        .send({ note: "Not eligible" })
        .expect(200);
      expect(rejected.body.status).toBe("REJECTED");

      // Another organizer (of a different event) cannot approve/reject this one — IDOR check.
      const other = await createPublishedEvent(app, categoryId, cityId, { title: "Unrelated Organizer Event" });
      await http(app)
        .patch(`/api/v1/events/${eventId}/registrations/${created1.body.id}/approve`)
        .set("Authorization", `Bearer ${other.organizerToken}`)
        .expect(403);
    });
  });

  describe("§15 Registration form — required/optional/phone custom fields", () => {
    it("blocks submission missing a required field, allows omitting an optional one, and stores a PHONE answer", async () => {
      const { eventId, organizerToken } = await createPublishedEvent(app, categoryId, cityId, { title: "Custom Fields QA" });
      await http(app)
        .put(`/api/v1/events/${eventId}/registrations/fields`)
        .set("Authorization", `Bearer ${organizerToken}`)
        .send({
          fields: [
            { label: "Phone", type: "PHONE", required: true, sortOrder: 0 },
            { label: "Dietary notes", type: "TEXT", required: false, sortOrder: 1 },
          ],
        })
        .expect(200);
      const fields = await http(app)
        .get(`/api/v1/events/${eventId}`)
        .set("Authorization", `Bearer ${organizerToken}`)
        .expect(200);
      const phoneField = fields.body.registrationFields.find((f: { label: string }) => f.label === "Phone");
      const notesField = fields.body.registrationFields.find((f: { label: string }) => f.label === "Dietary notes");

      const attendee = await newUser(app, "customfields");

      const missing = await http(app)
        .post(`/api/v1/events/${eventId}/registrations`)
        .set("Authorization", `Bearer ${attendee.token}`)
        .send({})
        .expect(400);
      expect(missing.body.error.code).toBe("VALIDATION_ERROR");
      expect(missing.body.error.details[phoneField.id]).toBeDefined();

      const ok = await http(app)
        .post(`/api/v1/events/${eventId}/registrations`)
        .set("Authorization", `Bearer ${attendee.token}`)
        .send({ answers: [{ fieldId: phoneField.id, value: "+380501234567" }] })
        .expect(201);
      expect(ok.body.status).toBe("REGISTERED"); // optional "Dietary notes" was omitted without issue
      const savedAnswer = ok.body.answers.find((a: { fieldId: string }) => a.fieldId === phoneField.id);
      expect(savedAnswer.valueJson).toBe("+380501234567");
      expect(notesField.required).toBe(false);
    });

    it("PARTIAL/NOT VERIFIABLE AT API LEVEL: phone prefill from profile is a client-side (web/mobile) concern — GET /users/me exposes phone for the frontend to prefill with, but the backend has no server-side prefill logic", async () => {
      const user = await newUser(app, "phoneprofile");
      await http(app)
        .patch("/api/v1/users/me")
        .set("Authorization", `Bearer ${user.token}`)
        .send({ phone: "+380671112233" })
        .expect(200);
      const me = await http(app).get("/api/v1/users/me").set("Authorization", `Bearer ${user.token}`).expect(200);
      expect(me.body.phone).toBe("+380671112233"); // available for the client to prefill with; not asserting UI behavior
    });
  });

  describe("§16 Cancellation", () => {
    it("cancelling frees the capacity slot and the registration reflects CANCELLED status, without ever claiming a refund", async () => {
      const { eventId, organizerToken } = await createPublishedEvent(app, categoryId, cityId, { title: "Cancel QA Event", capacity: 5 });
      const attendee = await newUser(app, "cancelme");
      const created = await http(app)
        .post(`/api/v1/events/${eventId}/registrations`)
        .set("Authorization", `Bearer ${attendee.token}`)
        .send({})
        .expect(201);

      const beforeStats = await http(app).get(`/api/v1/events/${eventId}/stats`).set("Authorization", `Bearer ${organizerToken}`).expect(200);
      expect(beforeStats.body.registrations).toBe(1);

      const cancelled = await http(app)
        .patch(`/api/v1/registrations/${created.body.id}/cancel`)
        .set("Authorization", `Bearer ${attendee.token}`)
        .expect(200);
      expect(cancelled.body.status).toBe("CANCELLED");
      expect(JSON.stringify(cancelled.body).toLowerCase()).not.toContain("refund");

      const afterStats = await http(app).get(`/api/v1/events/${eventId}/stats`).set("Authorization", `Bearer ${organizerToken}`).expect(200);
      expect(afterStats.body.registrations).toBe(0); // capacity count correctly decremented
    });

    // FIXED (was a QA finding, docs/qa/QA_events.md §16) — added the REGISTRATION_CANCELLED
    // notification type and RegistrationsService.notifyOrganizerOfCancellation().
    it("organizer is notified when a participant cancels their registration (§16)", async () => {
      // Deliberately NOT named anything containing "cancel" — an earlier
      // version of this test used a title like "Cancel Notify QA Event" and
      // matched notification text with a loose /cancel/i regex, which was a
      // false positive: it matched the EVENT'S OWN TITLE inside the
      // unrelated "New registration" notification the organizer gets when
      // the attendee first registers, not any real cancellation notice.
      // This version instead does a before/after notification-count
      // comparison, which cannot produce that false positive.
      const { eventId, organizerId } = await createPublishedEvent(app, categoryId, cityId, { title: "Registration Withdrawal QA Event" });
      const attendee = await newUser(app, "cancelnotify");
      const created = await http(app)
        .post(`/api/v1/events/${eventId}/registrations`)
        .set("Authorization", `Bearer ${attendee.token}`)
        .send({})
        .expect(201);

      const before = await prisma.notification.count({ where: { userId: organizerId } });

      await http(app)
        .patch(`/api/v1/registrations/${created.body.id}/cancel`)
        .set("Authorization", `Bearer ${attendee.token}`)
        .expect(200);

      const after = await prisma.notification.count({ where: { userId: organizerId } });
      expect(after).toBeGreaterThan(before); // a new notification should have been created for the cancellation itself
    });
  });

  describe("§22 Registration deadline / timezone", () => {
    it("registration works before the deadline and is blocked after it, using an explicit UTC offset (no ambiguous local timestamp)", async () => {
      const { eventId } = await createPublishedEvent(app, categoryId, cityId, {
        title: "Deadline Future QA Event",
        registrationDeadline: new Date(Date.now() + 3 * 86_400_000).toISOString(),
      });
      const attendee = await newUser(app, "beforedeadline");
      await http(app)
        .post(`/api/v1/events/${eventId}/registrations`)
        .set("Authorization", `Bearer ${attendee.token}`)
        .send({})
        .expect(201);

      const { eventId: pastId } = await createPublishedEvent(app, categoryId, cityId, {
        title: "Deadline Past QA Event",
        startsAt: new Date(Date.now() + 10 * 86_400_000).toISOString(),
      });
      // Move the deadline into the past directly (organizer PATCH can't set a
      // deadline before "now" implicitly, but the DB can hold one from before
      // an edit — same effect as time simply passing).
      await prisma.event.update({ where: { id: pastId }, data: { registrationDeadline: new Date(Date.now() - 60_000) } });
      const attendee2 = await newUser(app, "afterdeadline");
      const res = await http(app)
        .post(`/api/v1/events/${pastId}/registrations`)
        .set("Authorization", `Bearer ${attendee2.token}`)
        .send({})
        .expect(400);
      expect(res.body.error.code).toBe("REGISTRATION_CLOSED");
    });
  });

  describe("§23 Multiple prices / tiers", () => {
    it("Student/Standard/VIP tiers: selection is stored unambiguously and the organizer sees which tier was picked", async () => {
      const { eventId, organizerToken } = await createPublishedEvent(app, categoryId, cityId, {
        title: "Tiers QA Event",
        priceType: "PAID",
      });
      const tiers = await http(app)
        .put(`/api/v1/events/${eventId}/price-options`)
        .set("Authorization", `Bearer ${organizerToken}`)
        .send({
          items: [
            { name: "Student", price: 100 },
            { name: "Standard", price: 200 },
            { name: "VIP", price: 500 },
          ],
        })
        .expect(200);
      const vip = tiers.body.find((t: { name: string }) => t.name === "VIP");

      const attendee = await newUser(app, "vipbuyer");
      const withoutTier = await http(app)
        .post(`/api/v1/events/${eventId}/registrations`)
        .set("Authorization", `Bearer ${attendee.token}`)
        .send({})
        .expect(400);
      expect(withoutTier.body.error.code).toBe("VALIDATION_ERROR"); // must choose a tier — no ambiguity

      const registered = await http(app)
        .post(`/api/v1/events/${eventId}/registrations`)
        .set("Authorization", `Bearer ${attendee.token}`)
        .send({ priceOptionId: vip.id })
        .expect(201);
      expect(registered.body.priceOption.name).toBe("VIP");
      expect(registered.body.priceOption.price).toEqual(expect.anything());

      const listForOrganizer = await http(app)
        .get(`/api/v1/events/${eventId}/registrations`)
        .set("Authorization", `Bearer ${organizerToken}`)
        .expect(200);
      const seen = listForOrganizer.body.items.find((r: { id: string }) => r.id === registered.body.id);
      expect(seen.priceOption.name).toBe("VIP"); // organizer can see the selected option
    });

    it("a sold-out tier (capacity) is rejected even if the event overall has room", async () => {
      const { eventId, organizerToken } = await createPublishedEvent(app, categoryId, cityId, {
        title: "Tier Capacity QA Event",
        priceType: "PAID",
        capacity: 100,
      });
      const tiers = await http(app)
        .put(`/api/v1/events/${eventId}/price-options`)
        .set("Authorization", `Bearer ${organizerToken}`)
        .send({ items: [{ name: "Limited", price: 50, capacity: 1 }] })
        .expect(200);
      const tierId = tiers.body[0].id;

      const first = await newUser(app, "tierfirst");
      await http(app)
        .post(`/api/v1/events/${eventId}/registrations`)
        .set("Authorization", `Bearer ${first.token}`)
        .send({ priceOptionId: tierId })
        .expect(201);

      const second = await newUser(app, "tiersecond");
      const res = await http(app)
        .post(`/api/v1/events/${eventId}/registrations`)
        .set("Authorization", `Bearer ${second.token}`)
        .send({ priceOptionId: tierId })
        .expect(409);
      expect(res.body.error.code).toBe("EVENT_CAPACITY_REACHED");
    });
  });

  describe("§24 External payment — Kiro never claims payment success", () => {
    it("the payment URL is only informational; registration status changes only via the organizer's manual confirmation, never automatically", async () => {
      const { eventId, organizerToken } = await createPublishedEvent(app, categoryId, cityId, {
        title: "External Payment QA Event",
        priceType: "PAID",
        price: 400,
        paymentUrl: "https://pay.example.com/qa-external",
      });
      const attendee = await newUser(app, "extpay");

      const created = await http(app)
        .post(`/api/v1/events/${eventId}/registrations`)
        .set("Authorization", `Bearer ${attendee.token}`)
        .send({})
        .expect(201);
      expect(created.body.status).toBe("REGISTERED"); // not auto-CONFIRMED just because the event is paid

      // Simulate "user opened the external payment URL" — there is no
      // endpoint that lets a mere page-view / URL click change registration
      // status; only markPaid (explicit attendee action) and
      // confirmPayment (explicit organizer action) do.
      const stillRegistered = await http(app)
        .get(`/api/v1/events/${eventId}/registrations/me`)
        .set("Authorization", `Bearer ${attendee.token}`)
        .expect(200);
      expect(stillRegistered.body.registration.status).toBe("REGISTERED");

      // No webhook/route exists that flips a *registration* to CONFIRMED
      // without the organizer explicitly calling confirm-payment (the
      // payments module's wayforpay/mono webhooks are for buying listing
      // credits, not event tickets — a different resource entirely).
      await http(app)
        .patch(`/api/v1/registrations/${created.body.id}/mark-paid`)
        .set("Authorization", `Bearer ${attendee.token}`)
        .expect(200);
      const afterClick = await http(app)
        .get(`/api/v1/events/${eventId}/registrations/me`)
        .set("Authorization", `Bearer ${attendee.token}`)
        .expect(200);
      expect(afterClick.body.registration.status).toBe("PAYMENT_PENDING"); // still awaiting organizer confirmation

      const confirmed = await http(app)
        .patch(`/api/v1/events/${eventId}/registrations/${created.body.id}/confirm-payment`)
        .set("Authorization", `Bearer ${organizerToken}`)
        .expect(200);
      expect(confirmed.body.status).toBe("CONFIRMED"); // only reachable via the organizer's own action
    });
  });
});
