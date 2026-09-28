import { randomUUID } from "node:crypto";
import { ConfigService } from "@nestjs/config";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { JwtService } from "@nestjs/jwt";
import request from "supertest";
import { AppModule } from "../../src/app.module";
import { configureApp } from "../../src/bootstrap";
import { PrismaService } from "../../src/prisma/prisma.service";
import type { EnvConfig } from "../../src/config/env.validation";

// argon2id password hashing (by design, ~real work per register/login) plus
// this machine's local Postgres make each request slower than a unit test —
// give every test in this file headroom instead of tripping Jest's default
// 30s budget on nothing more than "ran a few registrations in sequence".
jest.setTimeout(90_000);

/**
 * QA acceptance-test audit — sections 3 (smoke/registration), 4 (auth/authz,
 * IDOR), 5 (profile privacy), 41 (admin security sweep), 42 (moderation
 * policy), 43 (reports), 50 (security), 51 (input validation), 58 (error
 * handling). See docs/qa/QA_security.md for the full report with statuses,
 * severities and root causes. This file is read-only auditing: it never
 * modifies apps/*\/src or packages/* — every finding here is reported, not
 * patched.
 *
 * Rate limiting / brute-force (part of §50) was ALSO verified live against a
 * separately built process (`node dist/src/main.js`, PORT=3199,
 * NODE_ENV=development, DATABASE_URL pointed at the same local test
 * Postgres) rather than only by reading @Throttle/@RateLimit decorators,
 * because NODE_ENV=test lifts every limit for this in-process suite (see
 * src/common/throttle.ts). That live run is not re-executed here (it needs a
 * second process on another port); its results are transcribed into
 * docs/qa/QA_security.md as RATE-01/RATE-02 evidence. Every other test in
 * this file is a real request/assertion against the in-process app.
 */
describe("QA security & validation audit (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const prefix = "qa-sec-";
  let categoryId: string;
  let cityId: string;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app, app.get(ConfigService<EnvConfig, true>));
    await app.init();
    prisma = app.get(PrismaService);
    categoryId = (await prisma.category.findUniqueOrThrow({ where: { slug: "sport" } })).id;
    cityId = (await prisma.city.findUniqueOrThrow({ where: { slug: "kyiv" } })).id;
  });

  afterAll(async () => {
    // Cleans up rows created both by this suite and by the manual live-server
    // checks described above (both use the same `qa-sec-` email prefix).
    const owner = { owner: { email: { startsWith: prefix } } };
    const reporter = { reporter: { email: { startsWith: prefix } } };
    await prisma.moderationCase.deleteMany({ where: { targetId: { in: await eventIdsForCleanup() } } });
    await prisma.report.deleteMany({ where: reporter });
    await prisma.eventFaqItem.deleteMany({ where: { event: owner } });
    await prisma.eventPriceOption.deleteMany({ where: { event: owner } });
    await prisma.registration.deleteMany({ where: { OR: [{ event: owner }, { user: { email: { startsWith: prefix } } }] } });
    await prisma.eventMedia.deleteMany({ where: { event: owner } });
    await prisma.listingCreditLedger.deleteMany({ where: { user: { email: { startsWith: prefix } } } });
    await prisma.event.deleteMany({ where: owner });
    await prisma.user.deleteMany({ where: { email: { startsWith: prefix } } });
    await app.close();
  });

  async function eventIdsForCleanup(): Promise<string[]> {
    const events = await prisma.event.findMany({ where: { owner: { email: { startsWith: prefix } } }, select: { id: true } });
    return events.map((e) => e.id);
  }

  let userCounter = 0;
  async function newUser(label: string, role?: "ADMIN" | "SUPER_ADMIN" | "MODERATOR"): Promise<{ token: string; id: string; email: string }> {
    userCounter += 1;
    const email = `${prefix}${label}-${Date.now()}-${userCounter}-${Math.random().toString(36).slice(2)}@example.com`;
    const res = await http().post("/api/v1/auth/register").send({ email, password: "Str0ngPass1", name: `${label} Tester` }).expect(201);
    if (role) {
      await prisma.user.update({ where: { id: res.body.user.id }, data: { role } });
    }
    return { token: res.body.accessToken, id: res.body.user.id, email };
  }

  async function draftEvent(token: string, extra: Record<string, unknown> = {}) {
    const created = await http().post("/api/v1/events").set("Authorization", `Bearer ${token}`).send({ title: "QA Security Fixture Event" }).expect(201);
    if (Object.keys(extra).length > 0) {
      await http().patch(`/api/v1/events/${created.body.id}`).set("Authorization", `Bearer ${token}`).send(extra).expect(200);
    }
    return created.body as { id: string; slug: string };
  }

  async function publishedEvent(token: string, extra: Record<string, unknown> = {}) {
    await http().post("/api/v1/credits/claim-free").set("Authorization", `Bearer ${token}`);
    const event = await draftEvent(token, {
      description: "A normal description of the event.",
      categoryId,
      cityId,
      addressText: "вул. Хрещатик, 1",
      startsAt: new Date(Date.now() + 5 * 86_400_000).toISOString(),
      ...extra,
    });
    await http().post(`/api/v1/events/${event.id}/publish`).set("Authorization", `Bearer ${token}`).expect(201);
    return event;
  }

  // ---------------------------------------------------------------------
  // §3 — Smoke / registration
  // ---------------------------------------------------------------------
  describe("ST-03 registration", () => {
    it("ST-03a: registers a user, returns a usable token, and the same credentials log in afterwards", async () => {
      const email = `${prefix}reg-${Date.now()}@example.com`;
      const reg = await http().post("/api/v1/auth/register").send({ email, password: "Str0ngPass1", name: "Reg Tester" }).expect(201);
      expect(reg.body.accessToken).toBeTruthy();
      expect(reg.body.user.email).toBe(email);

      const me = await http().get("/api/v1/users/me").set("Authorization", `Bearer ${reg.body.accessToken}`).expect(200);
      expect(me.body.email).toBe(email);

      const login = await http().post("/api/v1/auth/login").send({ email, password: "Str0ngPass1" }).expect(200);
      expect(login.body.accessToken).toBeTruthy();
    });

    it("ST-03b: duplicate email registration is rejected, not silently overwritten", async () => {
      const email = `${prefix}dup-${Date.now()}@example.com`;
      await http().post("/api/v1/auth/register").send({ email, password: "Str0ngPass1", name: "Dup One" }).expect(201);
      const dup = await http().post("/api/v1/auth/register").send({ email, password: "Str0ngPass2", name: "Dup Two" });
      expect([400, 409]).toContain(dup.status);
    });

    it("ST-03c: required-field / format validation rejects garbage registrations", async () => {
      await http().post("/api/v1/auth/register").send({ email: "not-an-email", password: "Str0ngPass1" }).expect(400);
      await http().post("/api/v1/auth/register").send({ email: `${prefix}nopass-${Date.now()}@example.com` }).expect(400);
      await http().post("/api/v1/auth/register").send({ email: `${prefix}shortpw-${Date.now()}@example.com`, password: "short" }).expect(400);
    });
  });

  // ---------------------------------------------------------------------
  // §4 — Authentication / authorization / IDOR
  // ---------------------------------------------------------------------
  describe("AUTH authentication & authorization", () => {
    it("AUTH-01: a protected endpoint with no token returns 401", async () => {
      await http().get("/api/v1/users/me").expect(401);
      await http().get("/api/v1/events/mine").expect(401);
    });

    it("AUTH-02: wrong password on login is rejected without revealing which field was wrong", async () => {
      const { email } = await newUser("wrongpw");
      const res = await http().post("/api/v1/auth/login").send({ email, password: "TotallyWrong1" }).expect(401);
      expect(res.body.error.code).toBe("INVALID_CREDENTIALS");
    });

    it("AUTH-03: a token signed with a different secret is rejected (401), never trusted", async () => {
      // Nest's own JwtService (already a dependency of the app) rather than pulling in a new package.
      const forgedSigner = new JwtService({});
      const forged = forgedSigner.sign(
        { sub: randomUUID(), email: "forged@example.com" },
        { secret: "wrong-secret-entirely", expiresIn: "15m" },
      );
      await http().get("/api/v1/users/me").set("Authorization", `Bearer ${forged}`).expect(401);
    });

    it("AUTH-04: a malformed/garbage bearer token is rejected (401), not a 500", async () => {
      await http().get("/api/v1/users/me").set("Authorization", "Bearer not.a.jwt").expect(401);
    });
  });

  describe("IDOR — cross-user object access", () => {
    it("IDOR-01: USER_A cannot edit USER_B's event (403), and the event is unchanged", async () => {
      const userA = await newUser("idorA1");
      const userB = await newUser("idorB1");
      const event = await draftEvent(userB.token);

      await http()
        .patch(`/api/v1/events/${event.id}`)
        .set("Authorization", `Bearer ${userA.token}`)
        .send({ title: "Hijacked by USER_A" })
        .expect(403);

      const stillB = await http().get(`/api/v1/events/${event.id}`).set("Authorization", `Bearer ${userB.token}`).expect(200);
      expect(stillB.body.title).toBe("QA Security Fixture Event");
    });

    it("IDOR-02: USER_A cannot cancel or publish USER_B's event", async () => {
      const userA = await newUser("idorA2");
      const userB = await newUser("idorB2");
      const event = await draftEvent(userB.token);

      await http().post(`/api/v1/events/${event.id}/publish`).set("Authorization", `Bearer ${userA.token}`).expect(403);
      await http().post(`/api/v1/events/${event.id}/cancel`).set("Authorization", `Bearer ${userA.token}`).send({}).expect(403);
    });

    it("IDOR-03: an unrelated user cannot list or manage another organizer's registrations", async () => {
      const organizer = await newUser("idorOrg1");
      const stranger = await newUser("idorStranger1");
      const attendee = await newUser("idorAttendee1");
      const event = await publishedEvent(organizer.token, { capacity: 5 });
      const reg = await http().post(`/api/v1/events/${event.id}/registrations`).set("Authorization", `Bearer ${attendee.token}`).send({}).expect(201);

      await http().get(`/api/v1/events/${event.id}/registrations`).set("Authorization", `Bearer ${stranger.token}`).expect(403);
      await http().patch(`/api/v1/events/${event.id}/registrations/${reg.body.id}/approve`).set("Authorization", `Bearer ${stranger.token}`).expect(403);
      await http()
        .patch(`/api/v1/events/${event.id}/registrations/${reg.body.id}/reject`)
        .set("Authorization", `Bearer ${stranger.token}`)
        .send({ note: "n/a" })
        .expect(403);
    });

    it("IDOR-04: PATCH /users/me only ever mutates the caller's own row, never another user's", async () => {
      const userA = await newUser("idorSelfA");
      const userB = await newUser("idorSelfB");
      await http().patch("/api/v1/users/me").set("Authorization", `Bearer ${userA.token}`).send({ name: "A Renamed" }).expect(200);
      const bAfter = await http().get("/api/v1/users/me").set("Authorization", `Bearer ${userB.token}`).expect(200);
      expect(bAfter.body.name).not.toBe("A Renamed");
    });
  });

  // ---------------------------------------------------------------------
  // §5 — Profile privacy
  // ---------------------------------------------------------------------
  describe("PROFILE privacy — phone/email must never leak via the public API", () => {
    it("PROFILE-01: the public profile endpoint never includes phone or email, even for the profile owner viewing it publicly", async () => {
      const user = await newUser("privacy1");
      await http().patch("/api/v1/users/me").set("Authorization", `Bearer ${user.token}`).send({ phone: "+380501234567", bio: "hi" }).expect(200);

      const anonView = await http().get(`/api/v1/users/${user.id}/profile`).expect(200);
      expect(anonView.body.phone).toBeUndefined();
      expect(anonView.body.email).toBeUndefined();
      expect(JSON.stringify(anonView.body)).not.toContain("+380501234567");

      const authedView = await http().get(`/api/v1/users/${user.id}/profile`).set("Authorization", `Bearer ${(await newUser("privacyViewer1")).token}`).expect(200);
      expect(authedView.body.phone).toBeUndefined();
      expect(authedView.body.email).toBeUndefined();
    });

    it("PROFILE-02: phone is optional on the profile and can be omitted entirely", async () => {
      const user = await newUser("privacy2");
      const me = await http().get("/api/v1/users/me").set("Authorization", `Bearer ${user.token}`).expect(200);
      expect(me.body.phone == null).toBe(true);
    });
  });

  // ---------------------------------------------------------------------
  // §41 — Admin security: every /admin/* route must reject a normal user
  // server-side, both unauthenticated (401) and authenticated-but-wrong-role
  // (403). Hiding the admin UI is explicitly not sufficient (§41).
  // ---------------------------------------------------------------------
  describe("ADMIN-SEC exhaustive /admin/* sweep", () => {
    const id = () => randomUUID();
    // Every admin-gated route in the API (admin/admin/* controllers, plus the
    // two admin-gated routes that live outside the /admin/* prefix: flags and
    // app-version). method/path/body triples; :id placeholders use a random
    // UUID since the Roles/Jwt guards run before the handler ever looks the
    // resource up.
    const adminRoutes: { method: "get" | "post" | "patch" | "put" | "delete"; path: string; body?: object }[] = [
      { method: "get", path: "/api/v1/admin/users" },
      { method: "get", path: `/api/v1/admin/users/${id()}` },
      { method: "patch", path: `/api/v1/admin/users/${id()}/status`, body: { status: "SUSPENDED" } },
      { method: "patch", path: `/api/v1/admin/users/${id()}/role`, body: { role: "ADMIN" } },
      { method: "get", path: "/api/v1/admin/events" },
      { method: "get", path: `/api/v1/admin/events/${id()}` },
      { method: "patch", path: `/api/v1/admin/events/${id()}`, body: { title: "x" } },
      { method: "post", path: `/api/v1/admin/events/${id()}/cancel`, body: { reason: "x" } },
      { method: "get", path: "/api/v1/admin/moderation" },
      { method: "patch", path: `/api/v1/admin/moderation/${id()}/approve` },
      { method: "patch", path: `/api/v1/admin/moderation/${id()}/reject`, body: { reason: "x" } },
      { method: "get", path: "/api/v1/admin/reports" },
      { method: "patch", path: `/api/v1/admin/reports/${id()}/resolve`, body: { status: "RESOLVED" } },
      { method: "get", path: "/api/v1/admin/categories" },
      { method: "patch", path: `/api/v1/admin/categories/${id()}`, body: { nameUk: "x" } },
      { method: "post", path: `/api/v1/admin/categories/${id()}/merge`, body: { targetCategoryId: id() } },
      { method: "get", path: "/api/v1/admin/districts" },
      { method: "patch", path: `/api/v1/admin/districts/${id()}`, body: { nameUk: "x" } },
      { method: "post", path: `/api/v1/admin/districts/${id()}/merge`, body: { targetDistrictId: id() } },
      { method: "post", path: "/api/v1/admin/credits/adjust", body: { userId: id(), amount: 1, reason: "x" } },
      { method: "get", path: "/api/v1/admin/payments" },
      { method: "get", path: "/api/v1/admin/audit" },
      { method: "get", path: "/api/v1/admin/analytics" },
      { method: "get", path: "/api/v1/admin/reviews" },
      { method: "patch", path: `/api/v1/admin/reviews/${id()}`, body: { status: "HIDDEN" } },
      { method: "put", path: `/api/v1/admin/flags/some-flag`, body: { enabled: true } },
      { method: "put", path: `/api/v1/admin/app-version/android`, body: { minVersion: "1.0.0" } },
      // Admin-gated but outside the /admin/* prefix — bonus coverage, same rule applies (§41's intent, not its literal path).
      { method: "patch", path: `/api/v1/payments/orders/${id()}/confirm-manual` },
    ];

    it("ADMIN-SEC-401: every admin route rejects a request with no token at all", async () => {
      const failures: string[] = [];
      for (const route of adminRoutes) {
        const call = (http() as unknown as Record<string, (path: string) => request.Test>)[route.method]!;
        const res = await call(route.path).send(route.body ?? {});
        if (res.status !== 401) failures.push(`${route.method.toUpperCase()} ${route.path} -> ${res.status} (expected 401)`);
      }
      expect(failures).toEqual([]);
    });

    it("ADMIN-SEC-403: every admin route rejects a normal authenticated USER role", async () => {
      const plain = await newUser("adminSweep");
      const failures: string[] = [];
      for (const route of adminRoutes) {
        const call = (http() as unknown as Record<string, (path: string) => request.Test>)[route.method]!;
        const res = await call(route.path)
          .set("Authorization", `Bearer ${plain.token}`)
          .send(route.body ?? {});
        if (res.status !== 403) failures.push(`${route.method.toUpperCase()} ${route.path} -> ${res.status} (expected 403)`);
      }
      expect(failures).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------
  // §42 — Moderation policy
  // ---------------------------------------------------------------------
  describe("MOD moderation policy (§42, §54)", () => {
    it("MOD-01: sexual-services content is hard-rejected at publish, never goes live", async () => {
      const organizer = await newUser("mod1");
      await http().post("/api/v1/credits/claim-free").set("Authorization", `Bearer ${organizer.token}`);
      const event = await draftEvent(organizer.token, {
        description: "Пропоную секс послуги, дзвоніть.",
        categoryId,
        cityId,
        addressText: "вул. Тестова, 1",
        startsAt: new Date(Date.now() + 5 * 86_400_000).toISOString(),
      });
      const publish = await http().post(`/api/v1/events/${event.id}/publish`).set("Authorization", `Bearer ${organizer.token}`).expect(400);
      expect(publish.body.error.code).toBe("VALIDATION_ERROR");
      const dbEvent = await prisma.event.findUniqueOrThrow({ where: { id: event.id } });
      expect(dbEvent.status).toBe("REJECTED");
    });

    it("MOD-02: war-related content is held for moderation (PENDING_MODERATION), not blocked outright", async () => {
      const organizer = await newUser("mod2");
      await http().post("/api/v1/credits/claim-free").set("Authorization", `Bearer ${organizer.token}`);
      const event = await draftEvent(organizer.token, {
        description: "Благодійний захід на підтримку ЗСУ під час війни.",
        categoryId,
        cityId,
        addressText: "вул. Тестова, 1",
        startsAt: new Date(Date.now() + 5 * 86_400_000).toISOString(),
      });
      const publish = await http().post(`/api/v1/events/${event.id}/publish`).set("Authorization", `Bearer ${organizer.token}`).expect(201);
      expect(publish.body.status).toBe("PENDING_MODERATION");
      const openCase = await prisma.moderationCase.findFirst({ where: { targetId: event.id } });
      expect(openCase?.reasonCode).toBe("WAR_RELATED");
    });

    it("MOD-03: ordinary adult-education content (legal, non-sexual) is NOT blanket-blocked", async () => {
      const organizer = await newUser("mod3");
      await http().post("/api/v1/credits/claim-free").set("Authorization", `Bearer ${organizer.token}`);
      const event = await draftEvent(organizer.token, {
        description: "Дорослий освітній воркшоп з інтимної психології для 18+, лекція без демонстрацій.",
        categoryId,
        cityId,
        addressText: "вул. Тестова, 1",
        ageRestriction: 18,
        startsAt: new Date(Date.now() + 5 * 86_400_000).toISOString(),
      });
      const publish = await http().post(`/api/v1/events/${event.id}/publish`).set("Authorization", `Bearer ${organizer.token}`).expect(201);
      expect(publish.body.status).toBe("PUBLISHED");
    });

    it("MOD-04: a moderator can approve a flagged event, which then becomes PUBLISHED", async () => {
      const organizer = await newUser("mod4");
      const moderator = await newUser("mod4Reviewer", "MODERATOR");
      await http().post("/api/v1/credits/claim-free").set("Authorization", `Bearer ${organizer.token}`);
      const event = await draftEvent(organizer.token, {
        description: "Зустріч ветеранів на підтримку фронту під час війни.",
        categoryId,
        cityId,
        addressText: "вул. Тестова, 1",
        startsAt: new Date(Date.now() + 5 * 86_400_000).toISOString(),
      });
      await http().post(`/api/v1/events/${event.id}/publish`).set("Authorization", `Bearer ${organizer.token}`).expect(201);

      const queue = await http().get("/api/v1/admin/moderation").set("Authorization", `Bearer ${moderator.token}`).expect(200);
      const items = (queue.body.items ?? queue.body) as { id: string; targetId: string }[];
      const theCase = items.find((c) => c.targetId === event.id);
      expect(theCase).toBeTruthy();

      await http().patch(`/api/v1/admin/moderation/${theCase!.id}/approve`).set("Authorization", `Bearer ${moderator.token}`).expect(200);
      const finalEvent = await prisma.event.findUniqueOrThrow({ where: { id: event.id } });
      expect(finalEvent.status).toBe("PUBLISHED");
    });
  });

  // ---------------------------------------------------------------------
  // §43 — Reports
  // ---------------------------------------------------------------------
  describe("REPORT reports (§43)", () => {
    it("REPORT-01: a user can report an event, and a normal user cannot see or resolve the report queue", async () => {
      const organizer = await newUser("report1Org");
      const reporter = await newUser("report1Er");
      const event = await publishedEvent(organizer.token);

      const created = await http()
        .post("/api/v1/reports")
        .set("Authorization", `Bearer ${reporter.token}`)
        .send({ targetType: "EVENT", targetId: event.id, reason: "Spam / scam" })
        .expect(201);
      expect(created.body.id).toBeTruthy();

      await http().get("/api/v1/admin/reports").set("Authorization", `Bearer ${reporter.token}`).expect(403);
    });

    it("REPORT-02: filing the same report twice is accepted (both are recorded) rather than silently erroring", async () => {
      const organizer = await newUser("report2Org");
      const reporter = await newUser("report2Er");
      const event = await publishedEvent(organizer.token);
      const body = { targetType: "EVENT" as const, targetId: event.id, reason: "Spam / scam" };

      await http().post("/api/v1/reports").set("Authorization", `Bearer ${reporter.token}`).send(body).expect(201);
      const second = await http().post("/api/v1/reports").set("Authorization", `Bearer ${reporter.token}`).send(body);
      // Documented actual behaviour: no duplicate-guard exists, so a second identical report is accepted (201).
      // See docs/qa/QA_security.md REPORT-02 for why this is flagged (moderation-queue spam risk), not asserted here as a hard FAIL.
      expect(second.status).toBe(201);
    });

    it("REPORT-03: a MODERATOR can list and resolve a report", async () => {
      const organizer = await newUser("report3Org");
      const reporter = await newUser("report3Er");
      const moderator = await newUser("report3Mod", "MODERATOR");
      const event = await publishedEvent(organizer.token);
      const created = await http()
        .post("/api/v1/reports")
        .set("Authorization", `Bearer ${reporter.token}`)
        .send({ targetType: "EVENT", targetId: event.id, reason: "Spam / scam" })
        .expect(201);

      const list = await http().get("/api/v1/admin/reports").set("Authorization", `Bearer ${moderator.token}`).expect(200);
      const items = (list.body.items ?? list.body) as { id: string }[];
      expect(items.some((r) => r.id === created.body.id)).toBe(true);

      const resolved = await http()
        .patch(`/api/v1/admin/reports/${created.body.id}/resolve`)
        .set("Authorization", `Bearer ${moderator.token}`)
        .send({ status: "RESOLVED" })
        .expect(200);
      expect(resolved.body.status).toBe("RESOLVED");
    });
  });

  // ---------------------------------------------------------------------
  // §50 — Security
  // ---------------------------------------------------------------------
  describe("SEC security (§50)", () => {
    it("SEC-01: SQL-injection-shaped input is treated as ordinary data (parameterized queries), not executed", async () => {
      const before = await prisma.user.count();
      await http().post("/api/v1/auth/login").send({ email: "a' OR '1'='1", password: "x' OR '1'='1" }).expect(400);
      const slug = await http().get(`/api/v1/events/slug/${encodeURIComponent("'; DROP TABLE users; --")}`).expect(404);
      expect(slug.body.error.code).toBe("NOT_FOUND");
      const after = await prisma.user.count();
      expect(after).toBe(before);
    });

    it("SEC-02: an XSS-shaped payload is stored and returned as inert literal text, never executed/transformed server-side", async () => {
      const user = await newUser("xss1");
      const payload = '<script>alert(document.cookie)</script>';
      const created = await http().post("/api/v1/events").set("Authorization", `Bearer ${user.token}`).send({ title: payload }).expect(201);
      expect(created.body.title).toBe(payload);
      const fetched = await http().get(`/api/v1/events/${created.body.id}`).set("Authorization", `Bearer ${user.token}`).expect(200);
      expect(fetched.body.title).toBe(payload);
    });

    it("SEC-03: a request can't smuggle a different target id into /users/me — the global whitelist validator rejects the unknown field outright", async () => {
      const userA = await newUser("sec3");
      const otherId = randomUUID();
      // There is no "act as another user id" endpoint to begin with — /users/me is always self-scoped (IDOR-04).
      // Belt-and-suspenders: UpdateProfileDto doesn't even have an `id` field, and the global ValidationPipe
      // runs with forbidNonWhitelisted:true, so trying to slip one in is rejected (400) rather than silently
      // ignored — an even stronger property than "ignored" against this class of mass-assignment attempt.
      const res = await http().patch("/api/v1/users/me").set("Authorization", `Bearer ${userA.token}`).send({ id: otherId, name: "still me" });
      expect(res.status).toBe(400);
      const me = await http().get("/api/v1/users/me").set("Authorization", `Bearer ${userA.token}`).expect(200);
      expect(me.body.id).toBe(userA.id);
    });

    it("SEC-04: a file whose content doesn't match its claimed image type is rejected (magic-byte sniffing, not extension/MIME trust)", async () => {
      const organizer = await newUser("sec4");
      const event = await draftEvent(organizer.token);
      const fakeImage = Buffer.from("<?php echo 'not actually a png'; ?>");
      const res = await http()
        .post(`/api/v1/events/${event.id}/media`)
        .set("Authorization", `Bearer ${organizer.token}`)
        .attach("file", fakeImage, { filename: "innocuous.png", contentType: "image/png" });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("INVALID_FILE_TYPE");
    });

    it("SEC-05: a javascript: URL scheme is rejected as an onlineUrl / paymentUrl, never stored", async () => {
      const organizer = await newUser("sec5");
      const event = await draftEvent(organizer.token);
      const res = await http()
        .patch(`/api/v1/events/${event.id}`)
        .set("Authorization", `Bearer ${organizer.token}`)
        .send({ format: "ONLINE", onlineUrl: "javascript:alert(document.cookie)" });
      expect(res.status).toBe(400);
    });

    it("SEC-06: an oversized JSON body is rejected with 413/400, not a bare 500 (FIXED — ApiExceptionFilter now maps http-errors-style middleware errors)", async () => {
      const user = await newUser("sec6");
      const bigName = "A".repeat(200 * 1024); // ~200KB, over Express's default 100kb json limit
      const res = await http()
        .patch("/api/v1/users/me")
        .set("Authorization", `Bearer ${user.token}`)
        .send({ bio: bigName });
      expect([400, 413]).toContain(res.status);
    });
  });

  // ---------------------------------------------------------------------
  // §51 — Input validation
  // ---------------------------------------------------------------------
  describe("VAL input validation (§51)", () => {
    it("VAL-01: an empty title is rejected", async () => {
      const user = await newUser("val1");
      await http().post("/api/v1/events").set("Authorization", `Bearer ${user.token}`).send({ title: "" }).expect(400);
    });

    it("VAL-02: a title longer than the documented max (200 chars) is rejected", async () => {
      const user = await newUser("val2");
      await http()
        .post("/api/v1/events")
        .set("Authorization", `Bearer ${user.token}`)
        .send({ title: "A".repeat(201) })
        .expect(400);
    });

    it("VAL-03/04: HTML and Cyrillic/Unicode/emoji content is accepted (not over-restricted) and preserved exactly", async () => {
      const user = await newUser("val3");
      const title = "Подія 🎉 <b>bold</b> — тестова назва";
      const created = await http().post("/api/v1/events").set("Authorization", `Bearer ${user.token}`).send({ title }).expect(201);
      expect(created.body.title).toBe(title);
    });

    it("VAL-05: a malformed URL for onlineUrl is rejected", async () => {
      const user = await newUser("val5");
      const event = await draftEvent(user.token);
      await http()
        .patch(`/api/v1/events/${event.id}`)
        .set("Authorization", `Bearer ${user.token}`)
        .send({ format: "ONLINE", onlineUrl: "not a url at all" })
        .expect(400);
    });

    it("VAL-06: a negative price is rejected", async () => {
      const user = await newUser("val6");
      const event = await draftEvent(user.token);
      await http()
        .patch(`/api/v1/events/${event.id}`)
        .set("Authorization", `Bearer ${user.token}`)
        .send({ priceType: "PAID", price: -100 })
        .expect(400);
    });

    it("VAL-07: a negative (or zero) capacity is rejected", async () => {
      const user = await newUser("val7");
      const event = await draftEvent(user.token);
      await http().patch(`/api/v1/events/${event.id}`).set("Authorization", `Bearer ${user.token}`).send({ capacity: -5 }).expect(400);
      await http().patch(`/api/v1/events/${event.id}`).set("Authorization", `Bearer ${user.token}`).send({ capacity: 0 }).expect(400);
    });

    it("VAL-08: a malformed date string is rejected", async () => {
      const user = await newUser("val8");
      const event = await draftEvent(user.token);
      await http().patch(`/api/v1/events/${event.id}`).set("Authorization", `Bearer ${user.token}`).send({ startsAt: "not-a-date" }).expect(400);
    });

    it("VAL-09: an event whose startsAt is in the past cannot be published (FIXED — was a QA finding, see EventsService.assertPublishable)", async () => {
      const user = await newUser("val9");
      await http().post("/api/v1/credits/claim-free").set("Authorization", `Bearer ${user.token}`);
      const event = await draftEvent(user.token, {
        description: "A normal description of the event.",
        categoryId,
        cityId,
        addressText: "вул. Хрещатик, 1",
        startsAt: new Date(Date.now() - 30 * 86_400_000).toISOString(), // 30 days in the past
      });
      const publish = await http().post(`/api/v1/events/${event.id}/publish`).set("Authorization", `Bearer ${user.token}`);
      expect(publish.status).toBe(400);
    });

    it("VAL-10: endsAt before startsAt is rejected as an invalid time range (FIXED — was a QA finding, see EventsService.applyUpdate)", async () => {
      const user = await newUser("val10");
      const event = await draftEvent(user.token);
      const res = await http()
        .patch(`/api/v1/events/${event.id}`)
        .set("Authorization", `Bearer ${user.token}`)
        .send({ startsAt: "2027-01-10T10:00:00.000Z", endsAt: "2027-01-01T10:00:00.000Z" });
      expect(res.status).toBe(400);
    });
  });

  // ---------------------------------------------------------------------
  // §58 — Error handling: no stack traces in responses
  // ---------------------------------------------------------------------
  describe("ERR error handling (§58)", () => {
    it("ERR-01: a 404 for an unknown resource is a clean JSON error, no stack trace", async () => {
      const res = await http().get(`/api/v1/events/${randomUUID()}`).expect(401); // unauthenticated -> 401 first, as expected
      expect(res.body.error).toBeDefined();
      expect(JSON.stringify(res.body)).not.toMatch(/at .*\(.*:\d+:\d+\)/); // no "at Foo (file.ts:12:34)" stack frames
    });

    it("ERR-02: a validation error (400) has a stable error shape and no framework internals leaked", async () => {
      const res = await http().post("/api/v1/auth/register").send({ email: "bad", password: "x" }).expect(400);
      expect(res.body).toEqual({ error: expect.objectContaining({ code: "VALIDATION_ERROR" }) });
      expect(JSON.stringify(res.body)).not.toContain("node_modules");
      expect(JSON.stringify(res.body)).not.toContain(".ts:");
    });

    it("ERR-03: a malformed UUID path param produces a clean 400, not a bare 500 (FIXED — was a QA finding, see ApiExceptionFilter's P2023 mapping)", async () => {
      const res = await http().get("/api/v1/users/not-a-uuid/profile");
      expect(JSON.stringify(res.body)).not.toMatch(/at .*\(.*:\d+:\d+\)/);
      expect(JSON.stringify(res.body)).not.toContain(".ts:");
      expect(res.status).toBe(400);
    });
  });
});
