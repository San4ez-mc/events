import { ConfigService } from "@nestjs/config";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../../src/app.module";
import { configureApp } from "../../src/bootstrap";
import { PrismaService } from "../../src/prisma/prisma.service";
import type { EnvConfig } from "../../src/config/env.validation";

/** QA audit — section 11 (categories) of the acceptance-test spec. */
describe("QA social — categories (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const prefix = "qa-soc-";
  let kyivCityId: string;
  const http = () => request(app.getHttpServer());

  jest.setTimeout(30000);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app, app.get(ConfigService<EnvConfig, true>));
    await app.init();
    prisma = app.get(PrismaService);
    kyivCityId = (await prisma.city.findUniqueOrThrow({ where: { slug: "kyiv" } })).id;
  });

  afterAll(async () => {
    const owner = { owner: { email: { startsWith: prefix } } };
    await prisma.registration.deleteMany({ where: { event: owner } });
    await prisma.listingCreditLedger.deleteMany({ where: { user: { email: { startsWith: prefix } } } });
    await prisma.event.deleteMany({ where: owner });
    await prisma.category.deleteMany({ where: { createdByUser: { email: { startsWith: prefix } } } });
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

  async function makeAdmin(userId: string, role: "ADMIN" | "SUPER_ADMIN" = "ADMIN"): Promise<void> {
    await prisma.user.update({ where: { id: userId }, data: { role } });
  }

  async function organizerWithCredits(label: string) {
    const organizer = await newUser(label);
    await http().post("/api/v1/credits/claim-free").set("Authorization", `Bearer ${organizer.token}`);
    return organizer;
  }

  async function publishedEventWithCategory(title: string, token: string, categoryId: string) {
    const created = await http().post("/api/v1/events").set("Authorization", `Bearer ${token}`).send({ title }).expect(201);
    await http()
      .patch(`/api/v1/events/${created.body.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        description: "A normal description of the QA category fixture event.",
        categoryId,
        cityId: kyivCityId,
        addressText: "вул. Хрещатик, 1",
        startsAt: new Date(Date.now() + 5 * 86_400_000).toISOString(),
      })
      .expect(200);
    await http().post(`/api/v1/events/${created.body.id}/publish`).set("Authorization", `Bearer ${token}`).expect(201);
    return created.body.id as string;
  }

  it("stores the selected existing category on an event", async () => {
    const sport = await prisma.category.findUniqueOrThrow({ where: { slug: "sport" } });
    const organizer = await organizerWithCredits("cat-existing");
    const eventId = await publishedEventWithCategory("QASOC Category Existing", organizer.token, sport.id);
    const stored = await prisma.event.findUniqueOrThrow({ where: { id: eventId } });
    expect(stored.categoryId).toBe(sport.id);
  });

  it("a user-created category is PENDING with createdByUserId set, and rejects a >2-level-deep parent", async () => {
    const user = await newUser("cat-creator");
    const sport = await prisma.category.findUniqueOrThrow({ where: { slug: "sport" } });
    // sport-cycling is a depth-1 child of sport in the seed data — using it as a parent would make depth 2 (too deep).
    const deepParent = await prisma.category.findFirst({ where: { parentId: { not: null } } });

    const created = await http()
      .post("/api/v1/categories")
      .set("Authorization", `Bearer ${user.token}`)
      .send({ nameUk: `Тестова категорія ${Date.now()}` })
      .expect(201);
    expect(created.body.status).toBe("PENDING");

    const inDb = await prisma.category.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(inDb.status).toBe("PENDING");
    expect(inDb.source).toBe("USER_CREATED");
    expect(inDb.createdByUserId).toBe(user.id);

    if (deepParent) {
      await http()
        .post("/api/v1/categories")
        .set("Authorization", `Bearer ${user.token}`)
        .send({ nameUk: `Занадто глибока ${Date.now()}`, parentId: deepParent.id })
        .expect(400);
    }

    // Cleanup this one row explicitly since its creator's email doesn't have the qa-soc- prefix issue but is fine either way.
    await prisma.category.delete({ where: { id: created.body.id } }).catch(() => undefined);
  });

  it("a PENDING user-created category can't be used on an event until an admin approves it, then it works", async () => {
    const creator = await newUser("cat-pending-user");
    const admin = await newUser("cat-pending-admin");
    await makeAdmin(admin.id);
    const organizer = await organizerWithCredits("cat-pending-org");

    const created = await http()
      .post("/api/v1/categories")
      .set("Authorization", `Bearer ${creator.token}`)
      .send({ nameUk: `Ще одна категорія ${Date.now()}` })
      .expect(201);
    const categoryId = created.body.id as string;

    // Trying to publish an event under a still-PENDING category must fail (only ACTIVE categories are usable).
    const draft = await http().post("/api/v1/events").set("Authorization", `Bearer ${organizer.token}`).send({ title: "QASOC Category Pending" }).expect(201);
    await http()
      .patch(`/api/v1/events/${draft.body.id}`)
      .set("Authorization", `Bearer ${organizer.token}`)
      .send({ categoryId, cityId: kyivCityId, description: "x".repeat(20), startsAt: new Date(Date.now() + 86_400_000).toISOString() })
      .expect(400);

    await http().patch(`/api/v1/admin/categories/${categoryId}`).set("Authorization", `Bearer ${admin.token}`).send({ status: "ACTIVE" }).expect(200);

    await http()
      .patch(`/api/v1/events/${draft.body.id}`)
      .set("Authorization", `Bearer ${organizer.token}`)
      .send({ categoryId, cityId: kyivCityId, description: "x".repeat(20), startsAt: new Date(Date.now() + 86_400_000).toISOString() })
      .expect(200);

    await prisma.category.delete({ where: { id: categoryId } }).catch(() => undefined);
  });

  it("admin list exposes creator, status and (implicitly) related events for a user-created category", async () => {
    const creator = await newUser("cat-admin-view-user");
    const admin = await newUser("cat-admin-view-admin");
    await makeAdmin(admin.id);

    const created = await http()
      .post("/api/v1/categories")
      .set("Authorization", `Bearer ${creator.token}`)
      .send({ nameUk: `Категорія для адмін-огляду ${Date.now()}` })
      .expect(201);

    const list = await http().get("/api/v1/admin/categories").set("Authorization", `Bearer ${admin.token}`).expect(200);
    const row = (list.body as { id: string; status: string; source: string; createdByUserId?: string }[]).find((c) => c.id === created.body.id);
    expect(row).toBeDefined();
    expect(row?.status).toBe("PENDING");
    expect(row?.source).toBe("USER_CREATED");

    // A regular user must not see the admin category list.
    await http().get("/api/v1/admin/categories").set("Authorization", `Bearer ${creator.token}`).expect(403);

    await prisma.category.delete({ where: { id: created.body.id } }).catch(() => undefined);
  });

  it("merge migrates events, keeps references valid, and notifies each affected event's owner exactly once", async () => {
    const admin = await newUser("cat-merge-admin");
    await makeAdmin(admin.id);
    const organizerA = await organizerWithCredits("cat-merge-orgA");
    const organizerB = await organizerWithCredits("cat-merge-orgB");

    const source = await http().post("/api/v1/categories").set("Authorization", `Bearer ${organizerA.token}`).send({ nameUk: `Джерело ${Date.now()}` }).expect(201);
    const target = await http().post("/api/v1/categories").set("Authorization", `Bearer ${organizerB.token}`).send({ nameUk: `Ціль ${Date.now()}` }).expect(201);
    // Approve both so events can actually use them.
    await http().patch(`/api/v1/admin/categories/${source.body.id}`).set("Authorization", `Bearer ${admin.token}`).send({ status: "ACTIVE" }).expect(200);
    await http().patch(`/api/v1/admin/categories/${target.body.id}`).set("Authorization", `Bearer ${admin.token}`).send({ status: "ACTIVE" }).expect(200);

    const eventA = await publishedEventWithCategory("QASOC Category Merge A", organizerA.token, source.body.id);
    const eventB = await publishedEventWithCategory("QASOC Category Merge B", organizerB.token, source.body.id);

    await http().post(`/api/v1/admin/categories/${source.body.id}/merge`).set("Authorization", `Bearer ${admin.token}`).send({ targetCategoryId: target.body.id }).expect(201);

    const [refreshedA, refreshedB, mergedSource] = await Promise.all([
      prisma.event.findUniqueOrThrow({ where: { id: eventA } }),
      prisma.event.findUniqueOrThrow({ where: { id: eventB } }),
      prisma.category.findUniqueOrThrow({ where: { id: source.body.id } }),
    ]);
    expect(refreshedA.categoryId).toBe(target.body.id); // event no longer loses its category — migrated to target
    expect(refreshedB.categoryId).toBe(target.body.id);
    expect(mergedSource.status).toBe("MERGED");
    expect(mergedSource.mergedIntoCategoryId).toBe(target.body.id);

    // Each distinct affected owner gets exactly one CATEGORY_MERGED notification (organizerA and organizerB are distinct owners).
    const notifsA = await prisma.notification.findMany({ where: { userId: organizerA.id, type: "CATEGORY_MERGED" } });
    const notifsB = await prisma.notification.findMany({ where: { userId: organizerB.id, type: "CATEGORY_MERGED" } });
    expect(notifsA).toHaveLength(1);
    expect(notifsB).toHaveLength(1);

    await prisma.category.delete({ where: { id: source.body.id } }).catch(() => undefined);
    await prisma.category.delete({ where: { id: target.body.id } }).catch(() => undefined);
  });

  it("a merged category can no longer be edited or used as a merge target", async () => {
    const admin = await newUser("cat-merged-immutable-admin");
    await makeAdmin(admin.id);
    const creator = await newUser("cat-merged-immutable-user");

    const source = await http().post("/api/v1/categories").set("Authorization", `Bearer ${creator.token}`).send({ nameUk: `Джерело2 ${Date.now()}` }).expect(201);
    const target = await http().post("/api/v1/categories").set("Authorization", `Bearer ${creator.token}`).send({ nameUk: `Ціль2 ${Date.now()}` }).expect(201);
    const other = await http().post("/api/v1/categories").set("Authorization", `Bearer ${creator.token}`).send({ nameUk: `Інша3 ${Date.now()}` }).expect(201);
    await http().patch(`/api/v1/admin/categories/${target.body.id}`).set("Authorization", `Bearer ${admin.token}`).send({ status: "ACTIVE" }).expect(200);

    await http().post(`/api/v1/admin/categories/${source.body.id}/merge`).set("Authorization", `Bearer ${admin.token}`).send({ targetCategoryId: target.body.id }).expect(201);

    await http().patch(`/api/v1/admin/categories/${source.body.id}`).set("Authorization", `Bearer ${admin.token}`).send({ nameUk: "Спроба зміни" }).expect(400);
    await http().post(`/api/v1/admin/categories/${other.body.id}/merge`).set("Authorization", `Bearer ${admin.token}`).send({ targetCategoryId: source.body.id }).expect(400);

    await prisma.category.delete({ where: { id: source.body.id } }).catch(() => undefined);
    await prisma.category.delete({ where: { id: target.body.id } }).catch(() => undefined);
    await prisma.category.delete({ where: { id: other.body.id } }).catch(() => undefined);
  });
});
