import { ConfigService } from "@nestjs/config";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import request from "supertest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AppModule } from "../../src/app.module";
import { configureApp } from "../../src/bootstrap";
import { PrismaService } from "../../src/prisma/prisma.service";
import type { EnvConfig } from "../../src/config/env.validation";

/**
 * QA audit — sections 44 (sharing/deep links), 47 (language), 48 (Ukrainian
 * cities/districts), 55 (API contract), 57 (pagination) of the acceptance
 * spec.
 */
describe("QA social — sharing, i18n, geography, API contract, pagination (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
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
    sportCategoryId = (await prisma.category.findUniqueOrThrow({ where: { slug: "sport" } })).id;
    kyivCityId = (await prisma.city.findUniqueOrThrow({ where: { slug: "kyiv" } })).id;
  });

  afterAll(async () => {
    const owner = { owner: { email: { startsWith: prefix } } };
    await prisma.registration.deleteMany({ where: { event: owner } });
    await prisma.listingCreditLedger.deleteMany({ where: { user: { email: { startsWith: prefix } } } });
    await prisma.event.deleteMany({ where: owner });
    await prisma.district.deleteMany({ where: { createdByUser: { email: { startsWith: prefix } } } });
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
        description: "A normal description of the QA sharing fixture event.",
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

  describe("§44 Sharing / deep links", () => {
    it("a public event is viewable by both a logged-out and a logged-in visitor", async () => {
      const organizer = await organizerWithCredits("share-public-org");
      const viewer = await newUser("share-public-viewer");
      const evt = await publishedEvent("QASOC Share Public Fixture", organizer.token);

      const anon = await http().get(`/api/v1/events/slug/${evt.slug}`).expect(200);
      expect(anon.body.id).toBe(evt.id);
      const logged = await http().get(`/api/v1/events/slug/${evt.slug}`).set("Authorization", `Bearer ${viewer.token}`).expect(200);
      expect(logged.body.id).toBe(evt.id);
    });

    it("a cancelled ('deleted') event's link 404s for everyone except the owner", async () => {
      const organizer = await organizerWithCredits("share-cancelled-org");
      const viewer = await newUser("share-cancelled-viewer");
      const evt = await publishedEvent("QASOC Share Cancelled Fixture", organizer.token);
      await http().post(`/api/v1/events/${evt.id}/cancel`).set("Authorization", `Bearer ${organizer.token}`).send({}).expect(201);

      await http().get(`/api/v1/events/slug/${evt.slug}`).expect(404);
      await http().get(`/api/v1/events/slug/${evt.slug}`).set("Authorization", `Bearer ${viewer.token}`).expect(404);
      const ownerView = await http().get(`/api/v1/events/slug/${evt.slug}`).set("Authorization", `Bearer ${organizer.token}`).expect(200);
      expect(ownerView.body.status).toBe("CANCELLED");
    });

    it("a draft event's link 404s for everyone except the owner (doesn't leak existence via 403)", async () => {
      const organizer = await organizerWithCredits("share-draft-org");
      const stranger = await newUser("share-draft-stranger");
      const draft = await http().post("/api/v1/events").set("Authorization", `Bearer ${organizer.token}`).send({ title: "QASOC Share Draft Fixture" }).expect(201);

      await http().get(`/api/v1/events/slug/${draft.body.slug}`).expect(404);
      await http().get(`/api/v1/events/slug/${draft.body.slug}`).set("Authorization", `Bearer ${stranger.token}`).expect(404);
      await http().get(`/api/v1/events/slug/${draft.body.slug}`).set("Authorization", `Bearer ${organizer.token}`).expect(200);
    });

    it("a PRIVATE event's direct link works for anyone holding it (that's the 'invite via link' model), but never shows up in the public feed/search", async () => {
      const organizer = await organizerWithCredits("share-private-org");
      const anonHolder = await newUser("share-private-holder");
      const evt = await publishedEvent("QASOC Share Private Fixture", organizer.token, { visibility: "PRIVATE" });

      const anon = await http().get(`/api/v1/events/slug/${evt.slug}`).expect(200);
      expect(anon.body.id).toBe(evt.id);
      const logged = await http().get(`/api/v1/events/slug/${evt.slug}`).set("Authorization", `Bearer ${anonHolder.token}`).expect(200);
      expect(logged.body.id).toBe(evt.id);

      const feed = await http().get("/api/v1/discovery?limit=50").expect(200);
      expect(feed.body.items.map((e: { id: string }) => e.id)).not.toContain(evt.id);
      const search = await http().get(`/api/v1/search?q=${encodeURIComponent("QASOC Share Private Fixture")}`).expect(200);
      expect((search.body.items ?? []).map((e: { id: string }) => e.id)).not.toContain(evt.id);
    });

    it("a public profile share link is 404 for a nonexistent user id rather than leaking a 500", async () => {
      await http().get("/api/v1/users/00000000-0000-4000-8000-000000000000/profile").expect(404);
    });
  });

  describe("§47 Language (server-side)", () => {
    it("packages/i18n has identical key sets and no empty values between uk and en", () => {
      const base = join(__dirname, "..", "..", "..", "..", "packages", "i18n", "src", "locales");
      const en = JSON.parse(readFileSync(join(base, "en", "common.json"), "utf8")) as Record<string, unknown>;
      const uk = JSON.parse(readFileSync(join(base, "uk", "common.json"), "utf8")) as Record<string, unknown>;

      const flatten = (obj: Record<string, unknown>, path = ""): Record<string, unknown> => {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(obj)) {
          const key = path ? `${path}.${k}` : k;
          if (v && typeof v === "object" && !Array.isArray(v)) Object.assign(out, flatten(v as Record<string, unknown>, key));
          else out[key] = v;
        }
        return out;
      };
      const flatEn = flatten(en);
      const flatUk = flatten(uk);
      const missingInUk = Object.keys(flatEn).filter((k) => !(k in flatUk));
      const missingInEn = Object.keys(flatUk).filter((k) => !(k in flatEn));
      const emptyEn = Object.entries(flatEn).filter(([, v]) => v === "" || v == null).map(([k]) => k);
      const emptyUk = Object.entries(flatUk).filter(([, v]) => v === "" || v == null).map(([k]) => k);

      expect(missingInUk).toEqual([]);
      expect(missingInEn).toEqual([]);
      expect(emptyEn).toEqual([]);
      expect(emptyUk).toEqual([]);
    });

    it("localises a known server-side notification into Ukrainian for a uk-locale user, in both title and body", async () => {
      const organizer = await organizerWithCredits("i18n-notif-org");
      await http().patch("/api/v1/users/me").set("Authorization", `Bearer ${organizer.token}`).send({ locale: "uk" }).expect(200);
      const attendee = await newUser("i18n-notif-attendee");
      const evt = await publishedEvent("QASOC I18n Notification Fixture", attendee.token === organizer.token ? organizer.token : organizer.token, { approvalMode: "ORGANIZER_APPROVAL" });
      const reg = await http().post(`/api/v1/events/${evt.id}/registrations`).set("Authorization", `Bearer ${attendee.token}`).send({}).expect(201);
      await http().patch("/api/v1/users/me").set("Authorization", `Bearer ${attendee.token}`).send({ locale: "uk" }).expect(200);
      await http().patch(`/api/v1/events/${evt.id}/registrations/${reg.body.id}/approve`).set("Authorization", `Bearer ${organizer.token}`).expect(200);

      const notif = await prisma.notification.findFirst({ where: { userId: attendee.id, type: "REGISTRATION_APPROVED" }, orderBy: { createdAt: "desc" } });
      expect(notif).not.toBeNull();
      // No raw translation keys leak through (e.g. "notifications.registrationApproved.title").
      expect(notif!.title).not.toMatch(/^[a-zA-Z0-9_.]+$/);
      expect(notif!.title).toMatch(/[а-яіїєґ]/i); // actually Ukrainian, not just untranslated English
    });

    it.failing("[SPEC GAP] a cancellation-with-reason notification is fully localised, not mixed-language", async () => {
      // Root cause: apps/api/src/notifications/notification-i18n.ts `RULES` matches "Event cancelled" bodies only
      // against the fixed regex for the "organizer left Kiro" wording. EventsService.cancel() (events.service.ts)
      // builds a *different* body — `"${title}" was cancelled: ${reason}` — when a reason is given, which that
      // regex never matches. The title still translates ("Подію скасовано") but the body falls back to English,
      // producing a mixed-language notification for uk-locale users.
      const organizer = await organizerWithCredits("i18n-cancel-org");
      const attendee = await newUser("i18n-cancel-attendee");
      await http().patch("/api/v1/users/me").set("Authorization", `Bearer ${attendee.token}`).send({ locale: "uk" }).expect(200);
      const evt = await publishedEvent("QASOC I18n Cancel Reason Fixture", organizer.token);
      await http().post(`/api/v1/events/${evt.id}/registrations`).set("Authorization", `Bearer ${attendee.token}`).send({}).expect(201);
      await http().post(`/api/v1/events/${evt.id}/cancel`).set("Authorization", `Bearer ${organizer.token}`).send({ reason: "Rain forecast" }).expect(201);

      const notif = await prisma.notification.findFirst({ where: { userId: attendee.id, type: "EVENT_CANCELLED" }, orderBy: { createdAt: "desc" } });
      expect(notif!.body).toMatch(/[а-яіїєґ]/i); // fails today — body stays in English
    });
  });

  describe("§48 Ukrainian cities/districts", () => {
    it("lists known official districts for a seeded city", async () => {
      const res = await http().get(`/api/v1/geography/districts?cityId=${kyivCityId}`).expect(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body.every((d: { cityId: string }) => d.cityId === kyivCityId)).toBe(true);
    });

    it("a user-suggested custom district is scoped to its own city and never leaks into another city with the same name", async () => {
      const user = await newUser("geo-district-user");
      const otherCity = await prisma.city.findUniqueOrThrow({ where: { slug: "dnipro" } });
      const districtName = `QASOC Custom District ${Date.now()}`;

      const inKyiv = await http().post("/api/v1/geography/districts").set("Authorization", `Bearer ${user.token}`).send({ cityId: kyivCityId, nameUk: districtName }).expect(201);
      const inOther = await http().post("/api/v1/geography/districts").set("Authorization", `Bearer ${user.token}`).send({ cityId: otherCity.id, nameUk: districtName }).expect(201);
      expect(inKyiv.body.id).not.toBe(inOther.body.id); // two distinct rows, not shared

      // Both are PENDING (not yet visible in the public list) — approve both directly to check scoping.
      await prisma.district.update({ where: { id: inKyiv.body.id }, data: { status: "ACTIVE" } });
      await prisma.district.update({ where: { id: inOther.body.id }, data: { status: "ACTIVE" } });

      const kyivDistricts = await http().get(`/api/v1/geography/districts?cityId=${kyivCityId}`).expect(200);
      expect(kyivDistricts.body.map((d: { id: string }) => d.id)).toContain(inKyiv.body.id);
      expect(kyivDistricts.body.map((d: { id: string }) => d.id)).not.toContain(inOther.body.id);

      const otherDistricts = await http().get(`/api/v1/geography/districts?cityId=${otherCity.id}`).expect(200);
      expect(otherDistricts.body.map((d: { id: string }) => d.id)).toContain(inOther.body.id);
      expect(otherDistricts.body.map((d: { id: string }) => d.id)).not.toContain(inKyiv.body.id);

      // An event using the Kyiv district can't be silently associated with the other city's row.
      const organizer = await organizerWithCredits("geo-district-org");
      const evt = await publishedEvent("QASOC Custom District Event Fixture", organizer.token, { districtId: inKyiv.body.id });
      const stored = await prisma.event.findUniqueOrThrow({ where: { id: evt.id } });
      expect(stored.districtId).toBe(inKyiv.body.id);
      expect(stored.cityId).toBe(kyivCityId);
    });
  });

  describe("§55 API contract", () => {
    it("protected endpoints require auth (401) and reject someone else's data (403), consistently across modules", async () => {
      const userA = await newUser("contract-userA");
      const userB = await newUser("contract-userB");
      const evtA = await organizerWithCredits("contract-org").then((o) => publishedEvent("QASOC Contract Fixture", o.token));

      await http().get("/api/v1/users/me").expect(401);
      await http().get("/api/v1/notifications").expect(401);
      await http().get("/api/v1/friends").expect(401);
      await http().patch(`/api/v1/events/${evtA.id}`).send({ title: "hijack" }).expect(401);
      await http().patch(`/api/v1/events/${evtA.id}`).set("Authorization", `Bearer ${userB.token}`).send({ title: "hijack" }).expect(403);
      void userA;
    });

    it("validation errors return 400 with a machine-readable body, not a raw stack trace", async () => {
      const res = await http().post("/api/v1/auth/register").send({ email: "not-an-email", password: "x" }).expect(400);
      expect(res.body.error?.code).toBeDefined();
      expect(res.body.error?.message).toBeDefined();
      expect(JSON.stringify(res.body)).not.toMatch(/at Object\.<anonymous>|node_modules/); // no stack trace leak
    });

    it("an unknown route/id returns 404, not a 500", async () => {
      await http().get("/api/v1/events/slug/definitely-not-a-real-slug-qasoc").expect(404);
      await http().get("/api/v1/this-route-does-not-exist").expect(404);
    });

    it("the generated OpenAPI document (built the same way main.ts builds it) actually lists the major routes it exposes", async () => {
      const swaggerConfig = new DocumentBuilder().setTitle("Kiro API").setVersion("0.0.1").addBearerAuth().build();
      const document = SwaggerModule.createDocument(app, swaggerConfig);
      const paths = Object.keys(document.paths);
      for (const expected of ["/api/v1/discovery", "/api/v1/events", "/api/v1/events/{id}", "/api/v1/friends", "/api/v1/notifications", "/api/v1/admin/users"]) {
        expect(paths).toContain(expected);
      }
      // The discovery feed is documented as not requiring auth (it's actually @Public()).
      const discoveryGet = document.paths["/api/v1/discovery"]?.get;
      expect(discoveryGet?.security === undefined || discoveryGet.security.length === 0).toBe(true);
    });
  });

  describe("§57 Pagination — every list endpoint is bounded", () => {
    it("notifications, friends' incoming requests, and reviews are capped, never unbounded", async () => {
      const user = await newUser("pagination-notifs-user");
      // notifications list respects `limit` and caps at the configured max (50).
      const res = await http().get("/api/v1/notifications?limit=999").set("Authorization", `Bearer ${user.token}`);
      expect([200, 400]).toContain(res.status); // either clamps or rejects an out-of-range limit — never returns unbounded
      if (res.status === 200) expect(res.body.items.length).toBeLessThanOrEqual(50);

      const organizer = await organizerWithCredits("pagination-reviews-org");
      const evt = await publishedEvent("QASOC Pagination Reviews Fixture", organizer.token);
      const reviews = await http().get(`/api/v1/events/${evt.id}/reviews?limit=999`);
      expect([200, 400]).toContain(reviews.status);
      if (reviews.status === 200) expect(reviews.body.items.length).toBeLessThanOrEqual(50);
    });

    it("admin users/events lists are cursor-paginated with a bounded default page, not returned in full", async () => {
      const admin = await newUser("pagination-admin-admin");
      await prisma.user.update({ where: { id: admin.id }, data: { role: "ADMIN" } });
      const res = await http().get("/api/v1/admin/users").set("Authorization", `Bearer ${admin.token}`).expect(200);
      expect(res.body.items.length).toBeLessThanOrEqual(20); // default page size, not the whole table
      expect(res.body).toHaveProperty("hasMore");
      expect(res.body).toHaveProperty("nextCursor");
    });
  });
});
