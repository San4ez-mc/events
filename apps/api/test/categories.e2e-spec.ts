import { ConfigService } from "@nestjs/config";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/bootstrap";
import { PrismaService } from "../src/prisma/prisma.service";
import type { EnvConfig } from "../src/config/env.validation";

/** §16: category tree is max depth 2 (parent -> child), enforced server-side. */
describe("Categories (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let accessToken: string;
  const testEmailPrefix = "e2e-categories-";

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app, app.get(ConfigService<EnvConfig, true>));
    await app.init();
    prisma = app.get(PrismaService);

    const email = `${testEmailPrefix}${Date.now()}@example.com`;
    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ email, password: "Str0ngPass", name: "Category Tester" })
      .expect(201);
    accessToken = res.body.accessToken;
  });

  afterAll(async () => {
    await prisma.category.deleteMany({ where: { source: "USER_CREATED" } });
    await prisma.user.deleteMany({ where: { email: { startsWith: testEmailPrefix } } });
    await app.close();
  });

  it("GET /categories returns a nested tree with the seeded top-level categories", async () => {
    const res = await request(app.getHttpServer()).get("/api/v1/categories").expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    const sport = res.body.find((c: { slug: string }) => c.slug === "sport");
    expect(sport).toBeDefined();
    expect(sport.children.length).toBeGreaterThan(0);
    // Every top-level category has no parent, and every returned node has a children array.
    for (const category of res.body) {
      expect(category.parentId).toBeNull();
      expect(Array.isArray(category.children)).toBe(true);
    }
  });

  it("POST /categories creates a top-level PENDING category owned by the requester", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/categories")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ nameUk: "E2E Top Level" })
      .expect(201);

    expect(res.body.status).toBe("PENDING");
    expect(res.body.source).toBe("USER_CREATED");
    expect(res.body.parentId).toBeNull();
  });

  it("POST /categories allows a depth-1 child under an existing top-level category", async () => {
    const tree = await request(app.getHttpServer()).get("/api/v1/categories").expect(200);
    const sportId = tree.body.find((c: { slug: string }) => c.slug === "sport").id;

    const res = await request(app.getHttpServer())
      .post("/api/v1/categories")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ nameUk: "E2E Child", parentId: sportId })
      .expect(201);

    expect(res.body.parentId).toBe(sportId);
  });

  it("POST /categories rejects a depth-2 child (parent already has a parent)", async () => {
    const tree = await request(app.getHttpServer()).get("/api/v1/categories").expect(200);
    const sport = tree.body.find((c: { slug: string }) => c.slug === "sport");
    const existingChildId = sport.children[0].id;

    const res = await request(app.getHttpServer())
      .post("/api/v1/categories")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ nameUk: "E2E Too Deep", parentId: existingChildId })
      .expect(400);

    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("POST /categories requires authentication", async () => {
    await request(app.getHttpServer())
      .post("/api/v1/categories")
      .send({ nameUk: "No Auth" })
      .expect(401);
  });
});
