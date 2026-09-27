import type { INestApplication } from "@nestjs/common";
import sharp from "sharp";
import { MAX_EVENT_MEDIA_FILES } from "@kiro/config";
import { PrismaService } from "../../src/prisma/prisma.service";
import { bootstrapApp, cleanupQaData, createDraftEvent, createPublishedEvent, http, newUser } from "./qa-helpers";

jest.setTimeout(120_000); // this shared local Postgres/embedded env runs several QA auditors concurrently; the default 30s per-test timeout is too tight under that contention (see docs/qa/QA_events.md).

/**
 * QA acceptance sections 8 (Event Landing Page), 9 (Event Media), 10 (Location).
 *
 * §9 note (BLOCKED): media upload writes through StorageService to an S3/MinIO
 * bucket at S3_ENDPOINT (see .env.test). That endpoint is not reachable in
 * this local environment (confirmed: `curl` to it returns connection refused),
 * so every code path that reaches `storage.putObject` cannot be exercised
 * here. What CAN be proven without storage — because the checks run before
 * any storage call — is exercised below: the 10-file cap, invalid file type
 * (magic-byte sniffing), and the oversized-file rejection. Actual successful
 * upload (1/5/10 photos), broken-image handling, delete, and mobile display
 * are marked BLOCKED in docs/qa/QA_events.md.
 */
describe("QA §8/§9/§10 — landing page, media limits, location (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let categoryId: string;
  let cityId: string;
  let districtId: string | undefined;

  beforeAll(async () => {
    const boot = await bootstrapApp();
    app = boot.app;
    prisma = boot.prisma;
    categoryId = (await prisma.category.findUniqueOrThrow({ where: { slug: "sport" } })).id;
    cityId = (await prisma.city.findUniqueOrThrow({ where: { slug: "kyiv" } })).id;
    const district = await prisma.district.findFirst({ where: { cityId, status: "ACTIVE" } });
    districtId = district?.id;
  });

  afterAll(async () => {
    await cleanupQaData(prisma);
    await app.close();
  });

  describe("§8 Event Landing Page — maximal data set", () => {
    it("exposes every documented field on the public slug page", async () => {
      const { eventId, slug, organizerToken } = await createPublishedEvent(app, categoryId, cityId, {
        title: "Max Data QA Event",
        capacity: 50,
        registrationDeadline: new Date(Date.now() + 6 * 86_400_000).toISOString(),
        priceType: "PAID",
        price: 250,
      });

      await http(app)
        .put(`/api/v1/events/${eventId}/faq`)
        .set("Authorization", `Bearer ${organizerToken}`)
        .send({ items: [{ question: "Q1?", answer: "A1." }] })
        .expect(200);
      await http(app)
        .patch(`/api/v1/events/${eventId}`)
        .set("Authorization", `Bearer ${organizerToken}`)
        // districtId is a "significant" field on an already-published event
        // (EventsService.SIGNIFICANT_PUBLISHED_FIELDS) — changing it requires
        // explicit notifyParticipants:true, same as startsAt/address/onlineUrl.
        .send({ rules: "Be respectful.", districtId, notifyParticipants: true })
        .expect(200);

      const page = await http(app).get(`/api/v1/events/slug/${slug}`).expect(200);
      const body = page.body;

      expect(body.title).toBe("Max Data QA Event");
      expect(body.description).toEqual(expect.any(String));
      expect(body.category).toBeTruthy();
      expect(body.startsAt).toEqual(expect.any(String));
      expect(body.rules).toBe("Be respectful.");
      expect(body.faqItems).toHaveLength(1);
      expect(body.organizer).toBeTruthy();
      expect(body.organizer.eventsCount).toBeGreaterThanOrEqual(1);
      expect(body.organizer.rating).toBeDefined(); // organizer rating surfaced (null/number both acceptable pre-any-reviews)
      expect(body.price).toEqual(expect.anything());
      expect(body.paymentUrl).toEqual(expect.any(String));
      expect(body.capacity).toBe(50);
      expect(body.registrationDeadline).toEqual(expect.any(String));
      expect(Array.isArray(body.participants)).toBe(true);
      expect(body.reviewSummary).toEqual({ average: null, count: 0 });
      expect(body.slug).toBe(slug); // the direct/shareable URL
      // §10 — anonymous visitor sees the district-level "locked" address, not the exact one.
      expect(body.addressLocked).toBe(true);
      expect(body.addressText).toBeNull();
    });

    it("landing page media array reflects at most what was actually uploaded (no phantom entries)", async () => {
      const { slug } = await createPublishedEvent(app, categoryId, cityId, { title: "Media Array QA Event" });
      const page = await http(app).get(`/api/v1/events/slug/${slug}`).expect(200);
      expect(Array.isArray(page.body.media)).toBe(true);
      expect(page.body.media).toHaveLength(0);
    });
  });

  describe("§9 Event Media — validation before storage", () => {
    it("BLOCKED: MinIO/S3 is not reachable locally — records the connection failure instead of a fabricated PASS", async () => {
      const owner = await newUser(app, "media-blocked");
      const eventId = await createDraftEvent(app, owner.token, "Media Blocked Probe Event");
      const tinyJpeg = await sharp({ create: { width: 10, height: 10, channels: 3, background: "red" } }).jpeg().toBuffer();

      const res = await http(app)
        .post(`/api/v1/events/${eventId}/media`)
        .set("Authorization", `Bearer ${owner.token}`)
        .attach("file", tinyJpeg, "probe.jpg");

      // Whatever the exact status, this must NOT be a 201 in this environment —
      // if it ever is 201, MinIO has become available and §9's BLOCKED items
      // should be re-run for real instead of relying on this probe.
      // eslint-disable-next-line jest/no-conditional-expect
      expect(res.status).not.toBe(201);
    }, 120_000);

    it("rejects the 11th media file before ever touching storage (cap check runs first)", async () => {
      const owner = await newUser(app, "media-cap");
      const eventId = await createDraftEvent(app, owner.token, "Media Cap QA Event");

      // Seed MAX_EVENT_MEDIA_FILES rows directly — bypasses storage entirely,
      // which is legitimate here because we're proving the *count* gate, not
      // the upload pipeline (that part is BLOCKED, see above).
      await prisma.eventMedia.createMany({
        data: Array.from({ length: MAX_EVENT_MEDIA_FILES }, (_, i) => ({
          eventId,
          type: "IMAGE" as const,
          originalUrl: `https://example.com/seed-${i}.jpg`,
          displayUrl: `https://example.com/seed-${i}.jpg`,
          thumbnailUrl: `https://example.com/seed-${i}.jpg`,
          sortOrder: i,
          moderationStatus: "APPROVED" as const,
        })),
      });

      const tinyJpeg = await sharp({ create: { width: 10, height: 10, channels: 3, background: "blue" } }).jpeg().toBuffer();
      const res = await http(app)
        .post(`/api/v1/events/${eventId}/media`)
        .set("Authorization", `Bearer ${owner.token}`)
        .attach("file", tinyJpeg, "eleventh.jpg")
        .expect(400);
      expect(res.body.error.code).toBe("MEDIA_LIMIT_REACHED");

      const count = await prisma.eventMedia.count({ where: { eventId } });
      expect(count).toBe(MAX_EVENT_MEDIA_FILES); // still exactly 10 — the 11th never got created
    });

    it("rejects a file whose real bytes aren't an allowed image/video type, before storage (§88)", async () => {
      const owner = await newUser(app, "media-invalid");
      const eventId = await createDraftEvent(app, owner.token, "Invalid File QA Event");
      const notAnImage = Buffer.from("plain text pretending to be a photo");

      const res = await http(app)
        .post(`/api/v1/events/${eventId}/media`)
        .set("Authorization", `Bearer ${owner.token}`)
        .attach("file", notAnImage, "fake.jpg")
        .expect(400);
      expect(res.body.error.code).toBe("INVALID_FILE_TYPE");
    });

    it("rejects an oversized image before storage (imageMaxBytes = 15MB)", async () => {
      const owner = await newUser(app, "media-oversized");
      const eventId = await createDraftEvent(app, owner.token, "Oversized File QA Event");

      const smallJpeg = await sharp({ create: { width: 4, height: 4, channels: 3, background: "green" } }).jpeg().toBuffer();
      const oversized = Buffer.concat([smallJpeg, Buffer.alloc(16 * 1024 * 1024, 0)]);

      const res = await http(app)
        .post(`/api/v1/events/${eventId}/media`)
        .set("Authorization", `Bearer ${owner.token}`)
        .attach("file", oversized, "huge.jpg")
        .expect(400);
      expect(res.body.error.code).toBe("FILE_TOO_LARGE");
    }, 120_000);

    it("a non-owner cannot upload media to someone else's event", async () => {
      const { eventId } = await createPublishedEvent(app, categoryId, cityId, { title: "Not Yours Media Event" });
      const stranger = await newUser(app, "media-stranger");
      const tinyJpeg = await sharp({ create: { width: 10, height: 10, channels: 3, background: "red" } }).jpeg().toBuffer();
      await http(app)
        .post(`/api/v1/events/${eventId}/media`)
        .set("Authorization", `Bearer ${stranger.token}`)
        .attach("file", tinyJpeg, "photo.jpg")
        .expect(403);
    });
  });

  describe("§10 Location — offline / online, address gating, Google Maps key hygiene", () => {
    it("OFFLINE event stores city/district/address and exposes lat/lng only to the organizer / registered users", async () => {
      const owner = await newUser(app, "offline-loc");
      const eventId = await createDraftEvent(app, owner.token, "Offline Location QA Event");
      await http(app)
        .patch(`/api/v1/events/${eventId}`)
        .set("Authorization", `Bearer ${owner.token}`)
        .send({
          description: "Offline location description.",
          categoryId,
          format: "OFFLINE",
          cityId,
          districtId,
          addressText: "вул. Хрещатик, 1",
          latitude: 50.4501,
          longitude: 30.5234,
          startsAt: new Date(Date.now() + 4 * 86_400_000).toISOString(),
        })
        .expect(200);
      const published = await http(app)
        .post(`/api/v1/events/${eventId}/publish`)
        .set("Authorization", `Bearer ${owner.token}`)
        .expect(201);
      const slug = (await prisma.event.findUniqueOrThrow({ where: { id: published.body.id } })).slug;

      const anonymous = await http(app).get(`/api/v1/events/slug/${slug}`).expect(200);
      expect(anonymous.body.addressText).toBeNull();
      expect(anonymous.body.latitude).toBeNull();
      expect(anonymous.body.addressLocked).toBe(true);

      const asOwner = await http(app).get(`/api/v1/events/slug/${slug}`).set("Authorization", `Bearer ${owner.token}`).expect(200);
      expect(asOwner.body.addressText).toBe("вул. Хрещатик, 1");
      expect(Number(asOwner.body.latitude)).toBeCloseTo(50.4501, 2);
      expect(asOwner.body.addressLocked).toBe(false);
    });

    it("ONLINE event requires no city/address and exposes onlineUrl instead", async () => {
      const owner = await newUser(app, "online-loc");
      const eventId = await createDraftEvent(app, owner.token, "Online Location QA Event");
      await http(app)
        .patch(`/api/v1/events/${eventId}`)
        .set("Authorization", `Bearer ${owner.token}`)
        .send({
          description: "Online event description.",
          categoryId,
          format: "ONLINE",
          onlineUrl: "https://meet.example.com/qa-online-room",
          startsAt: new Date(Date.now() + 4 * 86_400_000).toISOString(),
        })
        .expect(200);
      const published = await http(app)
        .post(`/api/v1/events/${eventId}/publish`)
        .set("Authorization", `Bearer ${owner.token}`)
        .expect(201);

      expect(published.body.format).toBe("ONLINE");
      expect(published.body.cityId).toBeNull();
    });

    it("an OFFLINE event without a city cannot be published (proves the user is never forced to fall back to their own current location — it's a hard validation instead)", async () => {
      const owner = await newUser(app, "offline-nocity");
      const eventId = await createDraftEvent(app, owner.token, "Offline No City QA Event");
      await http(app)
        .patch(`/api/v1/events/${eventId}`)
        .set("Authorization", `Bearer ${owner.token}`)
        .send({
          description: "Missing city on purpose.",
          categoryId,
          format: "OFFLINE",
          startsAt: new Date(Date.now() + 4 * 86_400_000).toISOString(),
        })
        .expect(200);

      const res = await http(app)
        .post(`/api/v1/events/${eventId}/publish`)
        .set("Authorization", `Bearer ${owner.token}`)
        .expect(400);
      expect(res.body.error.details._).toContain("cityId");
    });

    it("Google Places proxy never leaks the raw API key, and no event response contains a maps API key field", async () => {
      const owner = await newUser(app, "maps-key");
      const res = await http(app)
        .get("/api/v1/places/autocomplete")
        .query({ q: "Хрещатик" })
        .set("Authorization", `Bearer ${owner.token}`);
      const raw = JSON.stringify(res.body);
      expect(raw).not.toMatch(/AIza[0-9A-Za-z_-]{30,}/); // typical Google API key shape
      expect(raw.toLowerCase()).not.toContain("apikey");

      const { slug } = await createPublishedEvent(app, categoryId, cityId, { title: "Maps Key Hygiene Event" });
      const page = await http(app).get(`/api/v1/events/slug/${slug}`).expect(200);
      expect(JSON.stringify(page.body).toLowerCase()).not.toContain("apikey");
    });
  });
});
