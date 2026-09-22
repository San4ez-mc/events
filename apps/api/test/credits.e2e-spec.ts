import { ConfigService } from "@nestjs/config";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/bootstrap";
import { PrismaService } from "../src/prisma/prisma.service";
import type { EnvConfig } from "../src/config/env.validation";

describe("Credits (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const testEmailPrefix = "e2e-credits-";
  let token: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app, app.get(ConfigService<EnvConfig, true>));
    await app.init();
    prisma = app.get(PrismaService);

    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ email: `${testEmailPrefix}${Date.now()}@example.com`, password: "Str0ngPass", name: "Credits Tester" })
      .expect(201);
    token = res.body.accessToken;
  });

  afterAll(async () => {
    await prisma.listingCreditLedger.deleteMany({ where: { user: { email: { startsWith: testEmailPrefix } } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: testEmailPrefix } } });
    await app.close();
  });

  it("GET /credits/packages is public and returns the seeded packages (§50 — prices from the DB, never hardcoded)", async () => {
    const res = await request(app.getHttpServer()).get("/api/v1/credits/packages").expect(200);
    expect(res.body.length).toBeGreaterThanOrEqual(3);
    expect(res.body.every((p: { active: boolean }) => p.active)).toBe(true);
  });

  it("starts at a zero balance", async () => {
    const res = await request(app.getHttpServer())
      .get("/api/v1/credits/balance")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(res.body.balance).toBe(0);
  });

  it("grants the configured free-credit amount exactly once (§49 idempotency)", async () => {
    const first = await request(app.getHttpServer())
      .post("/api/v1/credits/claim-free")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(first.body.granted).toBe(true);
    expect(first.body.balance).toBeGreaterThan(0);
    const grantedAmount = first.body.balance;

    const second = await request(app.getHttpServer())
      .post("/api/v1/credits/claim-free")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(second.body.granted).toBe(false);
    expect(second.body.balance).toBe(grantedAmount);

    const balance = await request(app.getHttpServer())
      .get("/api/v1/credits/balance")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(balance.body.balance).toBe(grantedAmount);
  });

  it("requires authentication for balance/ledger/claim-free", async () => {
    await request(app.getHttpServer()).get("/api/v1/credits/balance").expect(401);
    await request(app.getHttpServer()).get("/api/v1/credits/ledger").expect(401);
    await request(app.getHttpServer()).post("/api/v1/credits/claim-free").expect(401);
  });
});
