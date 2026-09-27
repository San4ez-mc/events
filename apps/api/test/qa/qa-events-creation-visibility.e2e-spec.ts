import type { INestApplication } from "@nestjs/common";
import { PrismaService } from "../../src/prisma/prisma.service";
import { bootstrapApp, cleanupQaData, createDraftEvent, createPublishedEvent, feedDateBracket, http, newUser } from "./qa-helpers";

jest.setTimeout(120_000); // this shared local Postgres/embedded env runs several QA auditors concurrently; the default 30s per-test timeout is too tight under that contention (see docs/qa/QA_events.md).

/**
 * QA acceptance sections 12 (Event Creation), 13 (Visibility), 25 (Event Copy).
 * See docs/qa/QA_events.md for the full report; this file proves the
 * assertions with real HTTP requests against an in-process Nest app.
 */
describe("QA §12/§13/§25 — creation, visibility, copy (e2e)", () => {
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

  describe("§12 Event Creation — minimal form", () => {
    it("creates a draft with only a title (rest of the form is optional/advanced)", async () => {
      const owner = await newUser(app, "creator");
      const res = await http(app)
        .post("/api/v1/events")
        .set("Authorization", `Bearer ${owner.token}`)
        .send({ title: "Minimal QA Event" })
        .expect(201);

      expect(res.body.title).toBe("Minimal QA Event");
      expect(res.body.status).toBe("DRAFT");
      // No category/city/startsAt required to create the draft — proves the form doesn't force advanced fields up front.
      expect(res.body.categoryId ?? null).toBeNull();
    });

    it("publish is blocked until the minimum required fields (§69) are filled in", async () => {
      const owner = await newUser(app, "creator2");
      const eventId = await createDraftEvent(app, owner.token, "Incomplete QA Event");

      const res = await http(app)
        .post(`/api/v1/events/${eventId}/publish`)
        .set("Authorization", `Bearer ${owner.token}`)
        .expect(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
      expect(res.body.error.details._).toEqual(
        expect.arrayContaining(["categoryId", "startsAt", "description"]),
      );
    });

    it("first event creation activates organizer functionality without changing the user's role (§10 — 'not a separate type')", async () => {
      const user = await newUser(app, "becomes-organizer");
      const before = await http(app).get("/api/v1/users/me").set("Authorization", `Bearer ${user.token}`).expect(200);
      expect(before.body.role).toBe("USER");

      await createDraftEvent(app, user.token, "First Event Makes Organizer");

      const after = await http(app).get("/api/v1/users/me").set("Authorization", `Bearer ${user.token}`).expect(200);
      expect(after.body.role).toBe("USER"); // role unchanged — organizer is a capability, not a role
    });
  });

  describe("§12 Event Creation — advanced fields (multiple prices, FAQ, rules, payment URL, custom fields)", () => {
    it("stores rules, FAQ, price tiers and a payment URL via their dedicated endpoints", async () => {
      const owner = await newUser(app, "advanced");
      const eventId = await createDraftEvent(app, owner.token, "Advanced Fields Event");

      await http(app)
        .patch(`/api/v1/events/${eventId}`)
        .set("Authorization", `Bearer ${owner.token}`)
        .send({
          description: "Advanced fields QA description.",
          categoryId,
          cityId,
          startsAt: new Date(Date.now() + 5 * 86_400_000).toISOString(),
          priceType: "PAID",
          paymentUrl: "https://pay.example.com/qa",
          rules: "No smoking. Bring your own mat.",
        })
        .expect(200);

      const faqRes = await http(app)
        .put(`/api/v1/events/${eventId}/faq`)
        .set("Authorization", `Bearer ${owner.token}`)
        .send({ items: [{ question: "Where do I park?", answer: "Street parking is free after 18:00." }] })
        .expect(200);
      expect(faqRes.body).toHaveLength(1);

      const priceRes = await http(app)
        .put(`/api/v1/events/${eventId}/price-options`)
        .set("Authorization", `Bearer ${owner.token}`)
        .send({
          items: [
            { name: "Student", price: 100 },
            { name: "Standard", price: 200 },
            { name: "VIP", price: 500 },
          ],
        })
        .expect(200);
      expect(priceRes.body).toHaveLength(3);
      expect(priceRes.body.map((p: { name: string }) => p.name)).toEqual(["Student", "Standard", "VIP"]);

      const fieldsRes = await http(app)
        .put(`/api/v1/events/${eventId}/registrations/fields`)
        .set("Authorization", `Bearer ${owner.token}`)
        .send({ fields: [{ label: "T-shirt size", type: "SELECT", required: false, options: ["S", "M", "L"], sortOrder: 0 }] })
        .expect(200);
      expect(fieldsRes.body).toHaveLength(1);

      const full = await http(app).get(`/api/v1/events/${eventId}`).set("Authorization", `Bearer ${owner.token}`).expect(200);
      expect(full.body.rules).toBe("No smoking. Bring your own mat.");
      expect(full.body.paymentUrl).toBe("https://pay.example.com/qa");
      expect(full.body.faqItems).toHaveLength(1);
      expect(full.body.priceOptions).toHaveLength(3);
      expect(full.body.registrationFields).toHaveLength(1);
    });

    it("rejects a negative price and a negative/zero capacity server-side (§51)", async () => {
      const owner = await newUser(app, "negvals");
      const eventId = await createDraftEvent(app, owner.token, "Negative values event");

      const negPrice = await http(app)
        .patch(`/api/v1/events/${eventId}`)
        .set("Authorization", `Bearer ${owner.token}`)
        .send({ priceType: "PAID", price: -50 })
        .expect(400);
      expect(negPrice.body.error.code).toBe("VALIDATION_ERROR");

      const negCapacity = await http(app)
        .patch(`/api/v1/events/${eventId}`)
        .set("Authorization", `Bearer ${owner.token}`)
        .send({ capacity: -1 })
        .expect(400);
      expect(negCapacity.body.error.code).toBe("VALIDATION_ERROR");

      const zeroCapacity = await http(app)
        .patch(`/api/v1/events/${eventId}`)
        .set("Authorization", `Bearer ${owner.token}`)
        .send({ capacity: 0 })
        .expect(400);
      expect(zeroCapacity.body.error.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("§13 Visibility — PUBLIC / PRIVATE, direct URL", () => {
    it("PUBLIC events are visible to anonymous visitors via the public slug URL", async () => {
      const { slug } = await createPublishedEvent(app, categoryId, cityId, { visibility: "PUBLIC", title: "Public QA Event" });
      const res = await http(app).get(`/api/v1/events/slug/${slug}`).expect(200);
      expect(res.body.title).toBe("Public QA Event");
    });

    it("PUBLIC events appear in the discovery feed", async () => {
      const { eventId, startsAt } = await createPublishedEvent(app, categoryId, cityId, { visibility: "PUBLIC", title: "Discoverable QA Event" });
      // Bracket dateFrom/dateTo tightly around this event's own startsAt so
      // the check is deterministic even while other auditors concurrently
      // write to the same shared events table (see feedDateBracket's doc comment).
      const feed = await http(app).get("/api/v1/discovery").query({ limit: 50, ...feedDateBracket(startsAt) }).expect(200);
      const ids = (feed.body.items as { id: string }[]).map((i) => i.id);
      expect(ids).toContain(eventId);
    });

    it("PRIVATE events are reachable by direct URL but are NOT exposed in the discovery feed", async () => {
      const { eventId, slug, startsAt } = await createPublishedEvent(app, categoryId, cityId, {
        visibility: "PRIVATE",
        title: "Private QA Event",
      });

      const direct = await http(app).get(`/api/v1/events/slug/${slug}`).expect(200);
      expect(direct.body.id).toBe(eventId);

      const feed = await http(app).get("/api/v1/discovery").query({ limit: 50, ...feedDateBracket(startsAt) }).expect(200);
      const ids = (feed.body.items as { id: string }[]).map((i) => i.id);
      expect(ids).not.toContain(eventId);
    });

    it("DRAFT (unpublished) events return 404 to a stranger via slug, and are not leaked as 403 (§10)", async () => {
      const owner = await newUser(app, "draftowner");
      const eventId = await createDraftEvent(app, owner.token, "Never Published QA Event");
      const draft = await prisma.event.findUniqueOrThrow({ where: { id: eventId } });

      await http(app).get(`/api/v1/events/slug/${draft.slug}`).expect(404);

      const stranger = await newUser(app, "stranger");
      await http(app)
        .get(`/api/v1/events/slug/${draft.slug}`)
        .set("Authorization", `Bearer ${stranger.token}`)
        .expect(404);
    });
  });

  describe("§25 Event Copy — no participants/stats/photos copied", () => {
    it("duplicates content but starts a fresh DRAFT with no participants, no stats, and a new id/slug", async () => {
      const { eventId, organizerToken } = await createPublishedEvent(app, categoryId, cityId, {
        title: "Original To Duplicate",
        capacity: 10,
      });
      const attendee = await newUser(app, "attendee-for-copy");
      await http(app)
        .post(`/api/v1/events/${eventId}/registrations`)
        .set("Authorization", `Bearer ${attendee.token}`)
        .send({})
        .expect(201);

      const dup = await http(app)
        .post(`/api/v1/events/${eventId}/duplicate`)
        .set("Authorization", `Bearer ${organizerToken}`)
        .expect(201);

      expect(dup.body.id).not.toBe(eventId);
      expect(dup.body.slug).not.toBe((await prisma.event.findUniqueOrThrow({ where: { id: eventId } })).slug);
      expect(dup.body.status).toBe("DRAFT");
      expect(dup.body.title).toBe("Original To Duplicate");
      expect(dup.body.capacity).toBe(10);

      const dupRegistrationCount = await prisma.registration.count({ where: { eventId: dup.body.id } });
      expect(dupRegistrationCount).toBe(0);

      const stats = await http(app)
        .get(`/api/v1/events/${dup.body.id}/stats`)
        .set("Authorization", `Bearer ${organizerToken}`)
        .expect(200);
      expect(stats.body.registrations).toBe(0);
      expect(stats.body.confirmed).toBe(0);
    });

    it("a non-owner cannot duplicate someone else's event (authorization)", async () => {
      const { eventId } = await createPublishedEvent(app, categoryId, cityId, { title: "Not Yours To Duplicate" });
      const stranger = await newUser(app, "dup-stranger");
      await http(app)
        .post(`/api/v1/events/${eventId}/duplicate`)
        .set("Authorization", `Bearer ${stranger.token}`)
        .expect(403);
    });
  });
});
