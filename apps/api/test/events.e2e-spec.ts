import { ConfigService } from "@nestjs/config";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/bootstrap";
import { PrismaService } from "../src/prisma/prisma.service";
import type { EnvConfig } from "../src/config/env.validation";

describe("Events (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const testEmailPrefix = "e2e-events-";

  let ownerToken: string;
  let ownerId: string;
  let strangerToken: string;
  let sportCategoryId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app, app.get(ConfigService<EnvConfig, true>));
    await app.init();
    prisma = app.get(PrismaService);

    const ownerRes = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ email: `${testEmailPrefix}owner-${Date.now()}@example.com`, password: "Str0ngPass", name: "Owner" })
      .expect(201);
    ownerToken = ownerRes.body.accessToken;
    ownerId = ownerRes.body.user.id;

    const strangerRes = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ email: `${testEmailPrefix}stranger-${Date.now()}@example.com`, password: "Str0ngPass", name: "Stranger" })
      .expect(201);
    strangerToken = strangerRes.body.accessToken;

    const sport = await prisma.category.findUnique({ where: { slug: "sport" } });
    sportCategoryId = sport!.id;
  });

  afterAll(async () => {
    await prisma.event.deleteMany({ where: { owner: { email: { startsWith: testEmailPrefix } } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: testEmailPrefix } } });
    await app.close();
  });

  it("POST /events creates a minimal draft and activates organizer status (§10)", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/events")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ title: "Настільний теніс у парку" })
      .expect(201);

    expect(res.body.status).toBe("DRAFT");
    expect(res.body.title).toBe("Настільний теніс у парку");
    expect(res.body.slug).toEqual(expect.any(String));
    expect(res.body.categoryId).toBeNull();

    const owner = await prisma.user.findUnique({ where: { id: ownerId } });
    expect(owner?.organizerActivatedAt).not.toBeNull();
  });

  it("PATCH /events/:id fills in more fields and validates category/city references", async () => {
    const created = await request(app.getHttpServer())
      .post("/api/v1/events")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ title: "Update Test Event" })
      .expect(201);

    const bad = await request(app.getHttpServer())
      .patch(`/api/v1/events/${created.body.id}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ categoryId: "00000000-0000-0000-0000-000000000000" })
      .expect(400);
    expect(bad.body.error.code).toBe("VALIDATION_ERROR");

    const good = await request(app.getHttpServer())
      .patch(`/api/v1/events/${created.body.id}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ categoryId: sportCategoryId, format: "ONLINE", onlineUrl: "https://meet.example.com/x" })
      .expect(200);

    expect(good.body.categoryId).toBe(sportCategoryId);
    expect(good.body.format).toBe("ONLINE");
  });

  it("regenerates the slug when the title changes while still a draft", async () => {
    const created = await request(app.getHttpServer())
      .post("/api/v1/events")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ title: "Original Title" })
      .expect(201);
    const originalSlug = created.body.slug;

    const updated = await request(app.getHttpServer())
      .patch(`/api/v1/events/${created.body.id}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ title: "Renamed Title" })
      .expect(200);

    expect(updated.body.slug).not.toBe(originalSlug);
  });

  it("GET /events/mine only lists the requester's own events", async () => {
    await request(app.getHttpServer())
      .post("/api/v1/events")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ title: "Owner Event For Listing" })
      .expect(201);

    const mine = await request(app.getHttpServer())
      .get("/api/v1/events/mine")
      .set("Authorization", `Bearer ${ownerToken}`)
      .expect(200);
    expect(mine.body.items.length).toBeGreaterThan(0);

    const strangerMine = await request(app.getHttpServer())
      .get("/api/v1/events/mine")
      .set("Authorization", `Bearer ${strangerToken}`)
      .expect(200);
    expect(strangerMine.body.items).toHaveLength(0);
  });

  it("GET /events/:id and PATCH /events/:id are forbidden for a non-owner", async () => {
    const created = await request(app.getHttpServer())
      .post("/api/v1/events")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ title: "Private To Owner" })
      .expect(201);

    const getRes = await request(app.getHttpServer())
      .get(`/api/v1/events/${created.body.id}`)
      .set("Authorization", `Bearer ${strangerToken}`)
      .expect(403);
    expect(getRes.body.error.code).toBe("FORBIDDEN");

    await request(app.getHttpServer())
      .patch(`/api/v1/events/${created.body.id}`)
      .set("Authorization", `Bearer ${strangerToken}`)
      .send({ title: "Hijacked" })
      .expect(403);
  });

  describe("GET /events/slug/:slug (public preview, §115 Phase 1 acceptance)", () => {
    it("lets the owner preview their own draft without publishing it", async () => {
      const created = await request(app.getHttpServer())
        .post("/api/v1/events")
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ title: "Draft Preview Test" })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/events/slug/${created.body.slug}`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .expect(200);
      expect(res.body.id).toBe(created.body.id);
    });

    it("hides an unpublished draft from a stranger and from anonymous visitors (as 404, not 403)", async () => {
      const created = await request(app.getHttpServer())
        .post("/api/v1/events")
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ title: "Hidden Draft" })
        .expect(201);

      const anon = await request(app.getHttpServer())
        .get(`/api/v1/events/slug/${created.body.slug}`)
        .expect(404);
      expect(anon.body.error.code).toBe("NOT_FOUND");

      const stranger = await request(app.getHttpServer())
        .get(`/api/v1/events/slug/${created.body.slug}`)
        .set("Authorization", `Bearer ${strangerToken}`)
        .expect(404);
      expect(stranger.body.error.code).toBe("NOT_FOUND");
    });

    it("shows a published event to anyone, including anonymous visitors", async () => {
      const created = await request(app.getHttpServer())
        .post("/api/v1/events")
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ title: "Published Preview Test" })
        .expect(201);
      // No publish endpoint yet (Phase 2 — needs credits) — flip status
      // directly to test the visibility rule this endpoint is responsible for.
      await prisma.event.update({ where: { id: created.body.id }, data: { status: "PUBLISHED" } });

      const res = await request(app.getHttpServer())
        .get(`/api/v1/events/slug/${created.body.slug}`)
        .expect(200);
      expect(res.body.id).toBe(created.body.id);
    });
  });

  describe("significant-change confirmation on a published event (§78)", () => {
    it("rejects a date/location change without notifyParticipants=true", async () => {
      const created = await request(app.getHttpServer())
        .post("/api/v1/events")
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ title: "Published Event To Edit" })
        .expect(201);
      await prisma.event.update({ where: { id: created.body.id }, data: { status: "PUBLISHED" } });

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/events/${created.body.id}`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ startsAt: new Date(Date.now() + 86_400_000).toISOString() })
        .expect(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("allows the same change once notifyParticipants=true is set", async () => {
      const created = await request(app.getHttpServer())
        .post("/api/v1/events")
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ title: "Published Event To Edit 2" })
        .expect(201);
      await prisma.event.update({ where: { id: created.body.id }, data: { status: "PUBLISHED" } });

      const newDate = new Date(Date.now() + 86_400_000).toISOString();
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/events/${created.body.id}`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ startsAt: newDate, notifyParticipants: true })
        .expect(200);
      expect(new Date(res.body.startsAt).toISOString()).toBe(newDate);
    });
  });
});
