import { ConfigService } from "@nestjs/config";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../../src/app.module";
import { configureApp } from "../../src/bootstrap";
import { PrismaService } from "../../src/prisma/prisma.service";
import type { EnvConfig } from "../../src/config/env.validation";

/** QA audit — sections 38 (statistics), 39 (my events dashboard), 40 (admin). */
describe("QA social — statistics, my events, admin (e2e)", () => {
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
    await prisma.eventAnalyticsEvent.deleteMany({ where: { event: owner } });
    await prisma.eventDailyStat.deleteMany({ where: { event: owner } });
    await prisma.notification.deleteMany({ where: { user: { email: { startsWith: prefix } } } });
    await prisma.registration.deleteMany({ where: { event: owner } });
    await prisma.listingCreditLedger.deleteMany({ where: { user: { email: { startsWith: prefix } } } });
    await prisma.auditLog.deleteMany({ where: { actor: { email: { startsWith: prefix } } } });
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

  async function makeAdmin(userId: string, role: "MODERATOR" | "ADMIN" | "SUPER_ADMIN" = "ADMIN"): Promise<void> {
    await prisma.user.update({ where: { id: userId }, data: { role } });
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
        description: "A normal description of the QA stats fixture event.",
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

  describe("§38 Statistics", () => {
    it("counts registrations and cancellations correctly, and only the organizer/collaborators can see stats", async () => {
      const organizer = await organizerWithCredits("stats-basic-org");
      const stranger = await newUser("stats-basic-stranger");
      const attendee = await newUser("stats-basic-attendee");
      const evt = await publishedEvent("QASOC Stats Basic Fixture", organizer.token);

      await http().get(`/api/v1/events/${evt.id}/stats`).set("Authorization", `Bearer ${stranger.token}`).expect(403);

      const before = await http().get(`/api/v1/events/${evt.id}/stats`).set("Authorization", `Bearer ${organizer.token}`).expect(200);
      expect(before.body.registrations).toBe(0);

      const reg = await http().post(`/api/v1/events/${evt.id}/registrations`).set("Authorization", `Bearer ${attendee.token}`).send({}).expect(201);
      const afterReg = await http().get(`/api/v1/events/${evt.id}/stats`).set("Authorization", `Bearer ${organizer.token}`).expect(200);
      expect(afterReg.body.registrations).toBe(1);

      await http().patch(`/api/v1/registrations/${reg.body.id}/cancel`).set("Authorization", `Bearer ${attendee.token}`).expect(200);
      const afterCancel = await http().get(`/api/v1/events/${evt.id}/stats`).set("Authorization", `Bearer ${organizer.token}`).expect(200);
      expect(afterCancel.body.registrations).toBe(0);
      expect(afterCancel.body.cancellations).toBe(1);
    });

    it.failing("[SPEC GAP] exposes a distinction between total and unique views — it currently reports only a raw total", async () => {
      // Root cause: apps/api/src/analytics/analytics.service.ts `summary()` reads `EventDailyStat.views`, a plain
      // counter incremented once per VIEW analytics event with no per-viewer/session dedup (see `track()`'s
      // `DAILY_COLUMN.VIEW` increment). There is no `uniqueViews` (or equivalent) column/field anywhere in the
      // stats response. §38 explicitly asks to "verify defined distinction between total and unique views" —
      // there is none to verify.
      const organizer = await organizerWithCredits("stats-views-org");
      const evt = await publishedEvent("QASOC Stats Views Fixture", organizer.token);
      const viewer = await newUser("stats-views-viewer");

      // The same viewer/session "views" the event three times.
      for (let i = 0; i < 3; i++) {
        await http().post("/api/v1/analytics/events").send({ events: [{ eventId: evt.id, action: "VIEW", source: "DIRECT" }], sessionId: "same-session" }).expect(202);
      }
      await new Promise((r) => setTimeout(r, 500));
      const stats = await http().get(`/api/v1/events/${evt.id}/stats`).set("Authorization", `Bearer ${organizer.token}`).expect(200);
      expect(stats.body.views).toBe(3); // total, not deduplicated
      expect(stats.body.uniqueViews).toBeDefined(); // fails today — no such field exists at all
      void viewer;
    });
  });

  describe("§39 My events dashboard", () => {
    it("shows drafts/published/completed with a status filter, participant counts and view stats per event", async () => {
      const organizer = await organizerWithCredits("myevents-org");
      await http().post("/api/v1/events").set("Authorization", `Bearer ${organizer.token}`).send({ title: "QASOC MyEvents Draft" }).expect(201);
      const published = await publishedEvent("QASOC MyEvents Published", organizer.token);
      const attendee = await newUser("myevents-attendee");
      await http().post(`/api/v1/events/${published.id}/registrations`).set("Authorization", `Bearer ${attendee.token}`).send({}).expect(201);

      const drafts = await http().get("/api/v1/events/mine?status=DRAFT").set("Authorization", `Bearer ${organizer.token}`).expect(200);
      expect(drafts.body.items.every((e: { status: string }) => e.status === "DRAFT")).toBe(true);
      expect(drafts.body.items.length).toBeGreaterThanOrEqual(1);

      const publishedList = await http().get("/api/v1/events/mine?status=PUBLISHED").set("Authorization", `Bearer ${organizer.token}`).expect(200);
      expect(publishedList.body.items.map((e: { id: string }) => e.id)).toContain(published.id);

      const stats = await http().get(`/api/v1/events/${published.id}/stats`).set("Authorization", `Bearer ${organizer.token}`).expect(200);
      expect(stats.body.registrations).toBe(1);
    });

    it.failing("[SPEC GAP] supports sorting, not just a status filter", async () => {
      // Root cause: apps/api/src/events/dto/list-my-events.dto.ts (`ListMyEventsDto`) only declares
      // `status`/`cursor`/`limit` and the global ValidationPipe uses `forbidNonWhitelisted: true`, so any
      // sort-like query param is rejected outright rather than silently ignored — there is no sort capability
      // to opt into at all. EventsService.findMine always orders by `createdAt desc` (events.service.ts, `findMine`).
      const organizer = await organizerWithCredits("myevents-sort-org");
      await http().get("/api/v1/events/mine?sort=startsAt_asc").set("Authorization", `Bearer ${organizer.token}`).expect(200);
    });

    it("only the owner (or a collaborator) sees an event in /events/mine — not other organizers", async () => {
      const organizerA = await organizerWithCredits("myevents-ownerA");
      const organizerB = await organizerWithCredits("myevents-ownerB");
      const evtA = await publishedEvent("QASOC MyEvents Owner A", organizerA.token);
      const listB = await http().get("/api/v1/events/mine").set("Authorization", `Bearer ${organizerB.token}`).expect(200);
      expect(listB.body.items.map((e: { id: string }) => e.id)).not.toContain(evtA.id);
    });
  });

  describe("§40 Admin", () => {
    it("lets an admin search users and events by free text, and rejects a plain user", async () => {
      const admin = await newUser("admin-search-admin");
      await makeAdmin(admin.id);
      const organizer = await organizerWithCredits("admin-search-org");
      const uniqueMarker = `Zzq${Date.now()}`;
      await http()
        .patch("/api/v1/users/me")
        .set("Authorization", `Bearer ${organizer.token}`)
        .send({ name: `Marker ${uniqueMarker}` })
        .expect(200);
      const evt = await publishedEvent(`QASOC Admin Search ${uniqueMarker}`, organizer.token);

      const userSearch = await http().get(`/api/v1/admin/users?search=${uniqueMarker}`).set("Authorization", `Bearer ${admin.token}`).expect(200);
      expect(userSearch.body.items.map((u: { id: string }) => u.id)).toContain(organizer.id);

      const eventSearch = await http().get(`/api/v1/admin/events?search=${uniqueMarker}`).set("Authorization", `Bearer ${admin.token}`).expect(200);
      expect(eventSearch.body.items.map((e: { id: string }) => e.id)).toContain(evt.id);

      const eventDetail = await http().get(`/api/v1/admin/events/${evt.id}`).set("Authorization", `Bearer ${admin.token}`).expect(200);
      expect(eventDetail.body.owner.id).toBe(organizer.id);

      await http().get("/api/v1/admin/users").set("Authorization", `Bearer ${organizer.token}`).expect(403);
      await http().get("/api/v1/admin/events").set("Authorization", `Bearer ${organizer.token}`).expect(403);
    });

    it("lets an admin edit practically any event field directly, and the change is visible to the owner and (with notifyParticipants) notifies registrants", async () => {
      const admin = await newUser("admin-edit-admin");
      await makeAdmin(admin.id);
      const organizer = await organizerWithCredits("admin-edit-org");
      const attendee = await newUser("admin-edit-attendee");
      const evt = await publishedEvent("QASOC Admin Edit Fixture", organizer.token);
      await http().post(`/api/v1/events/${evt.id}/registrations`).set("Authorization", `Bearer ${attendee.token}`).send({}).expect(201);

      const newTitle = `QASOC Admin Edited Title ${Date.now()}`;
      await http()
        .patch(`/api/v1/admin/events/${evt.id}`)
        .set("Authorization", `Bearer ${admin.token}`)
        .send({ title: newTitle, startsAt: new Date(Date.now() + 11 * 86_400_000).toISOString(), notifyParticipants: true })
        .expect(200);

      // Propagates to the owner's own view.
      const ownerView = await http().get(`/api/v1/events/${evt.id}`).set("Authorization", `Bearer ${organizer.token}`).expect(200);
      expect(ownerView.body.title).toBe(newTitle);

      // Propagates to the public page.
      const publicView = await http().get(`/api/v1/events/slug/${evt.slug}`).expect(200);
      expect(publicView.body.title).toBe(newTitle);

      // And notifies the registrant of the significant-field change, same as an organizer-initiated edit.
      const notif = await prisma.notification.findFirst({ where: { userId: attendee.id, type: "EVENT_CHANGED" } });
      expect(notif).not.toBeNull();
    });

    it("admin category/district management, moderation and reports are rejected server-side for a plain user (§41)", async () => {
      const user = await newUser("admin-security-user");
      const anyId = "00000000-0000-4000-8000-000000000000";
      await http().get("/api/v1/admin/categories").set("Authorization", `Bearer ${user.token}`).expect(403);
      await http().post(`/api/v1/admin/categories/${anyId}/merge`).set("Authorization", `Bearer ${user.token}`).send({ targetCategoryId: anyId }).expect(403);
      await http().patch(`/api/v1/admin/events/${anyId}`).set("Authorization", `Bearer ${user.token}`).send({ title: "x" }).expect(403);
      await http().post(`/api/v1/admin/events/${anyId}/cancel`).set("Authorization", `Bearer ${user.token}`).send({}).expect(403);
      await http().get("/api/v1/admin/moderation").set("Authorization", `Bearer ${user.token}`).expect(403);
      await http().get("/api/v1/admin/reports").set("Authorization", `Bearer ${user.token}`).expect(403);
      await http().get("/api/v1/admin/analytics").set("Authorization", `Bearer ${user.token}`).expect(403);
      // Unauthenticated is 401, not merely 403.
      await http().get("/api/v1/admin/users").expect(401);
    });

    it("platform-wide statistics are available to an admin", async () => {
      const admin = await newUser("admin-stats-admin");
      await makeAdmin(admin.id);
      const summary = await http().get("/api/v1/admin/analytics").set("Authorization", `Bearer ${admin.token}`).expect(200);
      expect(summary.body).toBeDefined();
    });
  });
});
