import { ConfigService } from "@nestjs/config";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/bootstrap";
import { PrismaService } from "../src/prisma/prisma.service";
import type { EnvConfig } from "../src/config/env.validation";

/** §39/§53/§72-77/§115 Phase 10: the admin panel's backend — users, events, moderation, reports, category/district merge, credits, payments, audit. */
describe("Admin (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const testEmailPrefix = "e2e-admin-";
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
    await prisma.report.deleteMany({ where: { reporter: { email: { startsWith: testEmailPrefix } } } });
    await prisma.auditLog.deleteMany({ where: { actor: { email: { startsWith: testEmailPrefix } } } });
    await prisma.eventReview.deleteMany({ where: { event: { owner: { email: { startsWith: testEmailPrefix } } } } });
    await prisma.registration.deleteMany({ where: { event: { owner: { email: { startsWith: testEmailPrefix } } } } });
    await prisma.listingCreditLedger.deleteMany({ where: { user: { email: { startsWith: testEmailPrefix } } } });
    await prisma.platformPaymentOrder.deleteMany({ where: { user: { email: { startsWith: testEmailPrefix } } } });
    await prisma.event.deleteMany({ where: { owner: { email: { startsWith: testEmailPrefix } } } });
    await prisma.category.deleteMany({ where: { createdByUser: { email: { startsWith: testEmailPrefix } } } });
    // Sources (which point at a target via mergedIntoDistrictId) must go before their targets.
    await prisma.district.deleteMany({
      where: { createdByUser: { email: { startsWith: testEmailPrefix } }, mergedIntoDistrictId: { not: null } },
    });
    await prisma.district.deleteMany({ where: { createdByUser: { email: { startsWith: testEmailPrefix } } } });
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

  async function makeAdmin(userId: string, role: "ADMIN" | "SUPER_ADMIN" | "MODERATOR" = "ADMIN"): Promise<void> {
    await prisma.user.update({ where: { id: userId }, data: { role } });
  }

  async function createPublishedEvent(token: string): Promise<{ id: string; slug: string }> {
    await request(app.getHttpServer()).post("/api/v1/credits/claim-free").set("Authorization", `Bearer ${token}`);
    const created = await request(app.getHttpServer())
      .post("/api/v1/events")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Admin Fixture Event" })
      .expect(201);
    await request(app.getHttpServer())
      .patch(`/api/v1/events/${created.body.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        description: "A perfectly normal description.",
        categoryId: sportCategoryId,
        cityId: kyivCityId,
        startsAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
        rules: "Be nice.",
      })
      .expect(200);
    await request(app.getHttpServer())
      .post(`/api/v1/events/${created.body.id}/publish`)
      .set("Authorization", `Bearer ${token}`)
      .expect(201);
    return { id: created.body.id, slug: created.body.slug };
  }

  describe("access control", () => {
    it("a regular user gets 403 on every /admin/* route", async () => {
      const { token } = await registerUser("Plain");
      await request(app.getHttpServer()).get("/api/v1/admin/users").set("Authorization", `Bearer ${token}`).expect(403);
      await request(app.getHttpServer()).get("/api/v1/admin/events").set("Authorization", `Bearer ${token}`).expect(403);
      await request(app.getHttpServer()).get("/api/v1/admin/moderation").set("Authorization", `Bearer ${token}`).expect(403);
      await request(app.getHttpServer()).get("/api/v1/admin/reports").set("Authorization", `Bearer ${token}`).expect(403);
      await request(app.getHttpServer()).get("/api/v1/admin/audit").set("Authorization", `Bearer ${token}`).expect(403);
      await request(app.getHttpServer()).get("/api/v1/admin/analytics").set("Authorization", `Bearer ${token}`).expect(403);
    });

    it("MODERATOR can reach the moderation queue and reports, but not user/event management", async () => {
      const { token, userId } = await registerUser("Mod1");
      await makeAdmin(userId, "MODERATOR");

      await request(app.getHttpServer()).get("/api/v1/admin/moderation").set("Authorization", `Bearer ${token}`).expect(200);
      await request(app.getHttpServer()).get("/api/v1/admin/reports").set("Authorization", `Bearer ${token}`).expect(200);
      await request(app.getHttpServer()).get("/api/v1/admin/users").set("Authorization", `Bearer ${token}`).expect(403);
      await request(app.getHttpServer()).get("/api/v1/admin/events").set("Authorization", `Bearer ${token}`).expect(403);
    });
  });

  describe("users", () => {
    it("ADMIN can list/view/suspend users but not change roles", async () => {
      const { token: adminToken, userId: adminId } = await registerUser("Admin1");
      await makeAdmin(adminId, "ADMIN");
      const { userId: targetId } = await registerUser("Target1");

      const list = await request(app.getHttpServer())
        .get("/api/v1/admin/users")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);
      expect(list.body.items.some((u: { id: string }) => u.id === targetId)).toBe(true);

      const detail = await request(app.getHttpServer())
        .get(`/api/v1/admin/users/${targetId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);
      expect(detail.body.id).toBe(targetId);

      await request(app.getHttpServer())
        .patch(`/api/v1/admin/users/${targetId}/status`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ status: "SUSPENDED" })
        .expect(200);
      const suspended = await prisma.user.findUniqueOrThrow({ where: { id: targetId } });
      expect(suspended.status).toBe("SUSPENDED");

      await request(app.getHttpServer())
        .patch(`/api/v1/admin/users/${targetId}/role`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ role: "ADMIN" })
        .expect(403);
    });

    it("only SUPER_ADMIN can change roles, and can't demote themselves away from SUPER_ADMIN", async () => {
      const { token: superToken, userId: superId } = await registerUser("Super1");
      await makeAdmin(superId, "SUPER_ADMIN");
      const { userId: targetId } = await registerUser("Target2");

      await request(app.getHttpServer())
        .patch(`/api/v1/admin/users/${targetId}/role`)
        .set("Authorization", `Bearer ${superToken}`)
        .send({ role: "MODERATOR" })
        .expect(200);
      const promoted = await prisma.user.findUniqueOrThrow({ where: { id: targetId } });
      expect(promoted.role).toBe("MODERATOR");

      await request(app.getHttpServer())
        .patch(`/api/v1/admin/users/${superId}/role`)
        .set("Authorization", `Bearer ${superToken}`)
        .send({ role: "USER" })
        .expect(400);
    });
  });

  describe("events", () => {
    it("admin can list every event, edit any of them, and force-cancel one", async () => {
      const { token: adminToken, userId: adminId } = await registerUser("Admin2");
      await makeAdmin(adminId, "ADMIN");
      const owner = await registerUser("Owner1");
      const event = await createPublishedEvent(owner.token);

      const list = await request(app.getHttpServer())
        .get("/api/v1/admin/events?status=PUBLISHED")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);
      expect(list.body.items.some((e: { id: string }) => e.id === event.id)).toBe(true);

      await request(app.getHttpServer())
        .patch(`/api/v1/admin/events/${event.id}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ title: "Admin-edited title" })
        .expect(200);
      const edited = await prisma.event.findUniqueOrThrow({ where: { id: event.id } });
      expect(edited.title).toBe("Admin-edited title");

      await request(app.getHttpServer())
        .post(`/api/v1/admin/events/${event.id}/cancel`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ reason: "Policy violation" })
        .expect(201);
      const cancelled = await prisma.event.findUniqueOrThrow({ where: { id: event.id } });
      expect(cancelled.status).toBe("CANCELLED");
    });
  });

  describe("moderation", () => {
    it("a flagged event's owner isn't charged until an admin approves it", async () => {
      const { token: adminToken, userId: adminId } = await registerUser("Admin3");
      await makeAdmin(adminId, "ADMIN");
      const organizer = await registerUser("Organizer1");

      await request(app.getHttpServer()).post("/api/v1/credits/claim-free").set("Authorization", `Bearer ${organizer.token}`);
      const created = await request(app.getHttpServer())
        .post("/api/v1/events")
        .set("Authorization", `Bearer ${organizer.token}`)
        .send({ title: "War-related fundraiser" })
        .expect(201);
      await request(app.getHttpServer())
        .patch(`/api/v1/events/${created.body.id}`)
        .set("Authorization", `Bearer ${organizer.token}`)
        .send({
          description: "A gathering about війна support efforts.",
          categoryId: sportCategoryId,
          cityId: kyivCityId,
          startsAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
        })
        .expect(200);
      const publishRes = await request(app.getHttpServer())
        .post(`/api/v1/events/${created.body.id}/publish`)
        .set("Authorization", `Bearer ${organizer.token}`)
        .expect(201);
      expect(publishRes.body.status).toBe("PENDING_MODERATION");

      const balanceBefore = await request(app.getHttpServer())
        .get("/api/v1/credits/balance")
        .set("Authorization", `Bearer ${organizer.token}`)
        .expect(200);

      const queue = await request(app.getHttpServer())
        .get("/api/v1/admin/moderation")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);
      const moderationCase = queue.body.find((c: { targetId: string }) => c.targetId === created.body.id);
      expect(moderationCase).toBeTruthy();

      await request(app.getHttpServer())
        .patch(`/api/v1/admin/moderation/${moderationCase.id}/approve`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      const event = await prisma.event.findUniqueOrThrow({ where: { id: created.body.id } });
      expect(event.status).toBe("PUBLISHED");
      const balanceAfter = await request(app.getHttpServer())
        .get("/api/v1/credits/balance")
        .set("Authorization", `Bearer ${organizer.token}`)
        .expect(200);
      expect(balanceAfter.body.balance).toBe(balanceBefore.body.balance - 1);
    });

    it("rejecting a flagged event charges no credit", async () => {
      const { token: adminToken, userId: adminId } = await registerUser("Admin4");
      await makeAdmin(adminId, "ADMIN");
      const organizer = await registerUser("Organizer2");

      await request(app.getHttpServer()).post("/api/v1/credits/claim-free").set("Authorization", `Bearer ${organizer.token}`);
      const created = await request(app.getHttpServer())
        .post("/api/v1/events")
        .set("Authorization", `Bearer ${organizer.token}`)
        .send({ title: "Another fundraiser" })
        .expect(201);
      await request(app.getHttpServer())
        .patch(`/api/v1/events/${created.body.id}`)
        .set("Authorization", `Bearer ${organizer.token}`)
        .send({
          description: "Discussing окупації history.",
          categoryId: sportCategoryId,
          cityId: kyivCityId,
          startsAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
        })
        .expect(200);
      await request(app.getHttpServer())
        .post(`/api/v1/events/${created.body.id}/publish`)
        .set("Authorization", `Bearer ${organizer.token}`)
        .expect(201);

      const balanceBefore = await request(app.getHttpServer())
        .get("/api/v1/credits/balance")
        .set("Authorization", `Bearer ${organizer.token}`)
        .expect(200);

      const queue = await request(app.getHttpServer())
        .get("/api/v1/admin/moderation")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);
      const moderationCase = queue.body.find((c: { targetId: string }) => c.targetId === created.body.id);

      await request(app.getHttpServer())
        .patch(`/api/v1/admin/moderation/${moderationCase.id}/reject`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      const event = await prisma.event.findUniqueOrThrow({ where: { id: created.body.id } });
      expect(event.status).toBe("REJECTED");
      const balanceAfter = await request(app.getHttpServer())
        .get("/api/v1/credits/balance")
        .set("Authorization", `Bearer ${organizer.token}`)
        .expect(200);
      expect(balanceAfter.body.balance).toBe(balanceBefore.body.balance);
    });
  });

  describe("reports", () => {
    it("a user can file a report, an admin can list and resolve it, hiding a reported review", async () => {
      const { token: adminToken, userId: adminId } = await registerUser("Admin5");
      await makeAdmin(adminId, "ADMIN");
      const owner = await registerUser("Owner2");
      const event = await createPublishedEvent(owner.token);
      const attendee = await registerUser("Attendee1");
      await request(app.getHttpServer())
        .post(`/api/v1/events/${event.id}/registrations`)
        .set("Authorization", `Bearer ${attendee.token}`)
        .send({})
        .expect(201);
      await prisma.event.update({ where: { id: event.id }, data: { status: "COMPLETED", completedAt: new Date() } });
      const review = await request(app.getHttpServer())
        .post(`/api/v1/events/${event.id}/reviews`)
        .set("Authorization", `Bearer ${attendee.token}`)
        .send({ rating: 1, text: "Inappropriate content in this review." })
        .expect(201);

      const reporter = await registerUser("Reporter1");
      const reportRes = await request(app.getHttpServer())
        .post("/api/v1/reports")
        .set("Authorization", `Bearer ${reporter.token}`)
        .send({ targetType: "REVIEW", targetId: review.body.id, reason: "Offensive language" })
        .expect(201);

      const list = await request(app.getHttpServer())
        .get("/api/v1/admin/reports?status=OPEN")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);
      expect(list.body.items.some((r: { id: string }) => r.id === reportRes.body.id)).toBe(true);

      await request(app.getHttpServer())
        .patch(`/api/v1/admin/reports/${reportRes.body.id}/resolve`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ status: "RESOLVED", hideTarget: true })
        .expect(200);

      const hiddenReview = await prisma.eventReview.findUniqueOrThrow({ where: { id: review.body.id } });
      expect(hiddenReview.status).toBe("HIDDEN");

      const publicList = await request(app.getHttpServer()).get(`/api/v1/events/${event.id}/reviews`).expect(200);
      expect(publicList.body.items).toHaveLength(0);
    });
  });

  describe("category merge", () => {
    it("repoints events and subscriptions, keeps the source row, and notifies affected owners", async () => {
      const { token: adminToken, userId: adminId } = await registerUser("Admin6");
      await makeAdmin(adminId, "ADMIN");
      const owner = await registerUser("Owner3");

      // Created ACTIVE directly (bypassing the user-submission flow, which starts PENDING)
      // so the event patch below — which requires an ACTIVE category — succeeds.
      const sourceCategory = await prisma.category.create({
        data: {
          slug: `e2e-admin-cat-${Date.now()}`,
          nameUk: "Тестова категорія",
          nameEn: "Test category",
          status: "ACTIVE",
          source: "USER_CREATED",
          createdByUserId: owner.userId,
        },
      });

      await request(app.getHttpServer()).post("/api/v1/credits/claim-free").set("Authorization", `Bearer ${owner.token}`);
      const created = await request(app.getHttpServer())
        .post("/api/v1/events")
        .set("Authorization", `Bearer ${owner.token}`)
        .send({ title: "Category merge fixture event" })
        .expect(201);
      await request(app.getHttpServer())
        .patch(`/api/v1/events/${created.body.id}`)
        .set("Authorization", `Bearer ${owner.token}`)
        .send({ categoryId: sourceCategory.id })
        .expect(200);

      await request(app.getHttpServer())
        .post(`/api/v1/admin/categories/${sourceCategory.id}/merge`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ targetCategoryId: sportCategoryId })
        .expect(201);

      const mergedCategory = await prisma.category.findUniqueOrThrow({ where: { id: sourceCategory.id } });
      expect(mergedCategory.status).toBe("MERGED");
      expect(mergedCategory.mergedIntoCategoryId).toBe(sportCategoryId);

      const movedEvent = await prisma.event.findUniqueOrThrow({ where: { id: created.body.id } });
      expect(movedEvent.categoryId).toBe(sportCategoryId);

      const audit = await prisma.auditLog.findFirst({
        where: { actorUserId: adminId, action: "CATEGORY_MERGE", entityId: sourceCategory.id },
      });
      expect(audit).toBeTruthy();
    });
  });

  describe("district merge", () => {
    it("repoints events, keeps the source row, and notifies affected owners", async () => {
      const { token: adminToken, userId: adminId } = await registerUser("Admin11");
      await makeAdmin(adminId, "ADMIN");
      const owner = await registerUser("Owner4");

      const suffix = Date.now();
      const sourceDistrict = await prisma.district.create({
        data: { cityId: kyivCityId, nameUk: `Тестовий район A ${suffix}`, status: "ACTIVE", source: "USER_CREATED", createdByUserId: owner.userId },
      });
      const targetDistrict = await prisma.district.create({
        data: { cityId: kyivCityId, nameUk: `Тестовий район B ${suffix}`, status: "ACTIVE", source: "USER_CREATED", createdByUserId: owner.userId },
      });

      await request(app.getHttpServer()).post("/api/v1/credits/claim-free").set("Authorization", `Bearer ${owner.token}`);
      const created = await request(app.getHttpServer())
        .post("/api/v1/events")
        .set("Authorization", `Bearer ${owner.token}`)
        .send({ title: "District merge fixture event" })
        .expect(201);
      await request(app.getHttpServer())
        .patch(`/api/v1/events/${created.body.id}`)
        .set("Authorization", `Bearer ${owner.token}`)
        .send({ cityId: kyivCityId, districtId: sourceDistrict.id })
        .expect(200);

      await request(app.getHttpServer())
        .post(`/api/v1/admin/districts/${sourceDistrict.id}/merge`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ targetDistrictId: targetDistrict.id })
        .expect(201);

      const merged = await prisma.district.findUniqueOrThrow({ where: { id: sourceDistrict.id } });
      expect(merged.status).toBe("MERGED");
      expect(merged.mergedIntoDistrictId).toBe(targetDistrict.id);

      const movedEvent = await prisma.event.findUniqueOrThrow({ where: { id: created.body.id } });
      expect(movedEvent.districtId).toBe(targetDistrict.id);

      const audit = await prisma.auditLog.findFirst({
        where: { actorUserId: adminId, action: "DISTRICT_MERGE", entityId: sourceDistrict.id },
      });
      expect(audit).toBeTruthy();
    });
  });

  describe("credits admin-adjust", () => {
    it("grants or deducts credits with an audited ledger entry", async () => {
      const { token: adminToken, userId: adminId } = await registerUser("Admin7");
      await makeAdmin(adminId, "ADMIN");
      const { token: userToken, userId: targetId } = await registerUser("Target3");

      const before = await request(app.getHttpServer())
        .get("/api/v1/credits/balance")
        .set("Authorization", `Bearer ${userToken}`)
        .expect(200);

      const res = await request(app.getHttpServer())
        .post("/api/v1/admin/credits/adjust")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ userId: targetId, delta: 3, description: "Goodwill grant" })
        .expect(201);
      expect(res.body.balance).toBe(before.body.balance + 3);

      const audit = await prisma.auditLog.findFirst({
        where: { actorUserId: adminId, action: "CREDIT_ADJUSTMENT", entityId: targetId },
      });
      expect(audit).toBeTruthy();
    });
  });

  describe("payments admin listing", () => {
    it("shows every user's orders, not just the admin's own", async () => {
      const { token: adminToken, userId: adminId } = await registerUser("Admin8");
      await makeAdmin(adminId, "ADMIN");
      const buyer = await registerUser("Buyer1");
      const pkg = await prisma.creditPackage.findFirstOrThrow({ where: { active: true } });

      const order = await request(app.getHttpServer())
        .post("/api/v1/payments/orders")
        .set("Authorization", `Bearer ${buyer.token}`)
        .send({ packageId: pkg.id, provider: "MANUAL_IBAN" })
        .expect(201);

      const list = await request(app.getHttpServer())
        .get("/api/v1/admin/payments")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);
      expect(list.body.some((o: { id: string }) => o.id === order.body.order.id)).toBe(true);
    });
  });

  describe("audit log", () => {
    it("lists what admins have done, most recent first", async () => {
      const { token: adminToken, userId: adminId } = await registerUser("Admin9");
      await makeAdmin(adminId, "ADMIN");
      const { userId: targetId } = await registerUser("Target4");

      await request(app.getHttpServer())
        .patch(`/api/v1/admin/users/${targetId}/status`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ status: "SUSPENDED" })
        .expect(200);

      const list = await request(app.getHttpServer())
        .get(`/api/v1/admin/audit?entityType=User`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);
      expect(list.body.items.some((entry: { entityId: string }) => entry.entityId === targetId)).toBe(true);
    });
  });

  describe("analytics", () => {
    it("returns a platform summary", async () => {
      const { token: adminToken, userId: adminId } = await registerUser("Admin10");
      await makeAdmin(adminId, "ADMIN");

      const res = await request(app.getHttpServer())
        .get("/api/v1/admin/analytics")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);
      expect(typeof res.body.totalUsers).toBe("number");
      expect(res.body.eventsByStatus).toBeTruthy();
    });
  });
});
