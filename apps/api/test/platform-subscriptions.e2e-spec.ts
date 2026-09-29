import { ConfigService } from "@nestjs/config";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/bootstrap";
import { PrismaService } from "../src/prisma/prisma.service";
import type { EnvConfig } from "../src/config/env.validation";
import { GooglePlayVerifier, type PlayPurchaseState } from "../src/platform-subscriptions/google-play.verifier";

/**
 * Organizer subscriptions (STARTER/PRO). The call to Google Play is replaced with a stub verifier —
 * what's under test is our own logic: applying purchase state, monthly credit grants (idempotent per
 * period), the denormalized User fields, and the admin override tool.
 */
describe("Platform subscriptions (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const prefix = "e2e-subs-";

  let nextState: PlayPurchaseState = {
    expiryTime: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    acknowledged: true,
    autoRenewing: true,
    state: "SUBSCRIPTION_STATE_ACTIVE",
  };

  const stub: Pick<GooglePlayVerifier, "getSubscription"> = {
    async getSubscription(): Promise<PlayPurchaseState> {
      return nextState;
    },
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(GooglePlayVerifier)
      .useValue(stub)
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app, app.get(ConfigService<EnvConfig, true>));
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.listingCreditLedger.deleteMany({ where: { user: { email: { startsWith: prefix } } } });
    await prisma.platformSubscription.deleteMany({ where: { user: { email: { startsWith: prefix } } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: prefix } } });
    await app.close();
  });

  async function registerUser(namePrefix = "User"): Promise<{ token: string; userId: string }> {
    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({
        email: `${prefix}${namePrefix}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
        password: "Str0ngPass",
        name: `${namePrefix} Tester`,
      })
      .expect(201);
    return { token: res.body.accessToken, userId: res.body.user.id };
  }

  async function balanceOf(token: string): Promise<number> {
    const res = await request(app.getHttpServer()).get("/api/v1/credits/balance").set("Authorization", `Bearer ${token}`).expect(200);
    return res.body.balance;
  }

  it("a fresh user has no subscription", async () => {
    const { token } = await registerUser("Fresh");
    const res = await request(app.getHttpServer()).get("/api/v1/platform-subscriptions/mine").set("Authorization", `Bearer ${token}`).expect(200);
    expect(res.body.tier).toBeNull();
  });

  it("verifying a purchase activates the plan and grants that month's credits exactly once", async () => {
    const { token, userId } = await registerUser("Buyer");
    const before = await balanceOf(token);
    nextState = { expiryTime: new Date(Date.now() + 30 * 86_400_000).toISOString(), acknowledged: true, autoRenewing: true, state: "SUBSCRIPTION_STATE_ACTIVE" };

    const res = await request(app.getHttpServer())
      .post("/api/v1/platform-subscriptions/verify")
      .set("Authorization", `Bearer ${token}`)
      .send({ purchaseToken: "tok_starter_purchase_1", productId: "organizer_starter_monthly" })
      .expect(201);
    expect(res.body.tier).toBe("STARTER");
    expect(res.body.status).toBe("ACTIVE");

    expect(await balanceOf(token)).toBe(before + 5);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.subscriptionTier).toBe("STARTER");

    // Re-verifying the same token this period must not double-grant.
    await request(app.getHttpServer())
      .post("/api/v1/platform-subscriptions/verify")
      .set("Authorization", `Bearer ${token}`)
      .send({ purchaseToken: "tok_starter_purchase_1", productId: "organizer_starter_monthly" })
      .expect(201);
    expect(await balanceOf(token)).toBe(before + 5);
  });

  it("an expired/canceled Play state clears the plan", async () => {
    const { token, userId } = await registerUser("Lapsed");
    nextState = { expiryTime: new Date(Date.now() - 86_400_000).toISOString(), acknowledged: true, autoRenewing: false, state: "SUBSCRIPTION_STATE_ACTIVE" };
    await request(app.getHttpServer())
      .post("/api/v1/platform-subscriptions/verify")
      .set("Authorization", `Bearer ${token}`)
      .send({ purchaseToken: "tok_lapsed_1", productId: "organizer_pro_monthly" })
      .expect(201);

    nextState = { ...nextState, state: "SUBSCRIPTION_STATE_CANCELED" };
    const res = await request(app.getHttpServer())
      .post("/api/v1/platform-subscriptions/verify")
      .set("Authorization", `Bearer ${token}`)
      .send({ purchaseToken: "tok_lapsed_1", productId: "organizer_pro_monthly" })
      .expect(201);
    expect(res.body.tier).toBeNull();

    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.subscriptionTier).toBeNull();
  });

  it("rejects an unknown product id", async () => {
    const { token } = await registerUser("BadProduct");
    await request(app.getHttpServer())
      .post("/api/v1/platform-subscriptions/verify")
      .set("Authorization", `Bearer ${token}`)
      .send({ purchaseToken: "tok_whatever_long_enough", productId: "not_a_real_product" })
      .expect(400);
  });

  describe("admin override", () => {
    it("only an admin can set a user's plan by hand", async () => {
      const target = await registerUser("Target");
      const stranger = await registerUser("Stranger");

      await request(app.getHttpServer())
        .put(`/api/v1/admin/users/${target.userId}/subscription`)
        .set("Authorization", `Bearer ${stranger.token}`)
        .send({ tier: "PRO" })
        .expect(403);
    });

    it("an admin can grant and then revoke a plan", async () => {
      const target = await registerUser("AdminTarget");
      const admin = await registerUser("Admin");
      await prisma.user.update({ where: { id: admin.userId }, data: { role: "ADMIN" } });

      const granted = await request(app.getHttpServer())
        .put(`/api/v1/admin/users/${target.userId}/subscription`)
        .set("Authorization", `Bearer ${admin.token}`)
        .send({ tier: "PRO" })
        .expect(200);
      expect(granted.body.tier).toBe("PRO");

      const mine = await request(app.getHttpServer()).get("/api/v1/platform-subscriptions/mine").set("Authorization", `Bearer ${target.token}`).expect(200);
      expect(mine.body.tier).toBe("PRO");

      const revoked = await request(app.getHttpServer())
        .put(`/api/v1/admin/users/${target.userId}/subscription`)
        .set("Authorization", `Bearer ${admin.token}`)
        .send({ tier: null })
        .expect(200);
      expect(revoked.body.tier).toBeNull();
    });
  });
});
