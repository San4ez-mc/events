import { createHmac, generateKeyPairSync, sign as signEcdsa } from "node:crypto";
import { ConfigService } from "@nestjs/config";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { SUBSCRIPTION_TIERS } from "@kiro/config";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/bootstrap";
import { PrismaService } from "../src/prisma/prisma.service";
import type { EnvConfig } from "../src/config/env.validation";

const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
// Mono's pubkey endpoint returns only the raw 65-byte EC point, not a full DER key —
// strip the fixed 26-byte SPKI prefix this test's own keypair was just wrapped in.
const publicKeyDer = publicKey.export({ type: "spki", format: "der" });
const rawPoint = publicKeyDer.subarray(publicKeyDer.length - 65);
process.env.MONO_PUBLIC_KEY_BASE64 = rawPoint.toString("base64");

/** §51/§115 Phase 9: platform payment orders, provider adapters, webhooks, credit granting. */
describe("Payments (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const testEmailPrefix = "e2e-payments-";
  let packageId: string;
  let packageCredits: number;

  const wayForPaySecret = process.env.WAYFORPAY_MERCHANT_SECRET ?? "dev-wayforpay-secret";
  const wayForPayAccount = process.env.WAYFORPAY_MERCHANT_ACCOUNT ?? "kiro_dev_merchant";

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    configureApp(app, app.get(ConfigService<EnvConfig, true>));
    await app.init();
    prisma = app.get(PrismaService);

    const pkg = await prisma.creditPackage.findFirstOrThrow({ where: { active: true }, orderBy: { sortOrder: "asc" } });
    packageId = pkg.id;
    packageCredits = pkg.credits;
  });

  afterAll(async () => {
    await prisma.listingCreditLedger.deleteMany({ where: { user: { email: { startsWith: testEmailPrefix } } } });
    await prisma.platformPaymentOrder.deleteMany({ where: { user: { email: { startsWith: testEmailPrefix } } } });
    await prisma.platformSubscription.deleteMany({ where: { user: { email: { startsWith: testEmailPrefix } } } });
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

  async function balanceOf(token: string): Promise<number> {
    const res = await request(app.getHttpServer())
      .get("/api/v1/credits/balance")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    return res.body.balance;
  }

  function wayForPaySignature(fields: (string | number)[]): string {
    return createHmac("md5", wayForPaySecret).update(fields.join(";")).digest("hex");
  }

  it("lists active packages publicly with real prices, never hardcoded", async () => {
    const res = await request(app.getHttpServer()).get("/api/v1/credits/packages").expect(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0]).toHaveProperty("price");
  });

  describe("WayForPay", () => {
    it("creates an order with a correctly-signed checkout redirect", async () => {
      const { token } = await registerUser("WfpBuyer");
      const res = await request(app.getHttpServer())
        .post("/api/v1/payments/orders")
        .set("Authorization", `Bearer ${token}`)
        .send({ packageId, provider: "WAYFORPAY" })
        .expect(201);

      expect(res.body.order.status).toBe("PENDING");
      expect(res.body.order.provider).toBe("WAYFORPAY");
      expect(res.body.checkout.redirectUrl).toContain("secure.wayforpay.com");
      expect(res.body.checkout.redirectUrl).toContain("merchantSignature=");
    });

    it("rejects a webhook with an invalid signature", async () => {
      const { token } = await registerUser("WfpBadSig");
      const created = await request(app.getHttpServer())
        .post("/api/v1/payments/orders")
        .set("Authorization", `Bearer ${token}`)
        .send({ packageId, provider: "WAYFORPAY" })
        .expect(201);
      const orderId = created.body.order.id;
      const amount = Number(created.body.order.amount);

      await request(app.getHttpServer())
        .post("/api/v1/payments/webhooks/wayforpay")
        .send({
          merchantAccount: wayForPayAccount,
          orderReference: orderId,
          amount,
          currency: "UAH",
          transactionStatus: "Approved",
          merchantSignature: "not-the-real-signature",
        })
        .expect(400);

      const order = await prisma.platformPaymentOrder.findUniqueOrThrow({ where: { id: orderId } });
      expect(order.status).toBe("PENDING");
    });

    it("a valid Approved webhook marks the order PAID and grants credits exactly once, even if redelivered", async () => {
      const { token } = await registerUser("WfpHappy");
      const before = await balanceOf(token);

      const created = await request(app.getHttpServer())
        .post("/api/v1/payments/orders")
        .set("Authorization", `Bearer ${token}`)
        .send({ packageId, provider: "WAYFORPAY" })
        .expect(201);
      const orderId = created.body.order.id;
      const amount = Number(created.body.order.amount);

      const payload = {
        merchantAccount: wayForPayAccount,
        orderReference: orderId,
        amount,
        currency: "UAH",
        transactionStatus: "Approved",
      };
      const signature = wayForPaySignature([
        payload.merchantAccount,
        payload.orderReference,
        String(payload.amount),
        payload.currency,
        "",
        "",
        payload.transactionStatus,
        "",
      ]);

      await request(app.getHttpServer())
        .post("/api/v1/payments/webhooks/wayforpay")
        .send({ ...payload, merchantSignature: signature })
        .expect(200);

      const order = await prisma.platformPaymentOrder.findUniqueOrThrow({ where: { id: orderId } });
      expect(order.status).toBe("PAID");
      expect(await balanceOf(token)).toBe(before + packageCredits);

      // Redelivered webhook (providers retry on timeout) — must not double-credit.
      await request(app.getHttpServer())
        .post("/api/v1/payments/webhooks/wayforpay")
        .send({ ...payload, merchantSignature: signature })
        .expect(200);
      expect(await balanceOf(token)).toBe(before + packageCredits);
    });

    it("a Declined webhook marks the order FAILED without granting credits", async () => {
      const { token } = await registerUser("WfpDeclined");
      const before = await balanceOf(token);

      const created = await request(app.getHttpServer())
        .post("/api/v1/payments/orders")
        .set("Authorization", `Bearer ${token}`)
        .send({ packageId, provider: "WAYFORPAY" })
        .expect(201);
      const orderId = created.body.order.id;
      const amount = Number(created.body.order.amount);

      const payload = {
        merchantAccount: wayForPayAccount,
        orderReference: orderId,
        amount,
        currency: "UAH",
        transactionStatus: "Declined",
      };
      const signature = wayForPaySignature([
        payload.merchantAccount,
        payload.orderReference,
        String(payload.amount),
        payload.currency,
        "",
        "",
        payload.transactionStatus,
        "",
      ]);

      await request(app.getHttpServer())
        .post("/api/v1/payments/webhooks/wayforpay")
        .send({ ...payload, merchantSignature: signature })
        .expect(200);

      const order = await prisma.platformPaymentOrder.findUniqueOrThrow({ where: { id: orderId } });
      expect(order.status).toBe("FAILED");
      expect(await balanceOf(token)).toBe(before);
    });
  });

  describe("Mono", () => {
    it("refuses to create a checkout when MONO_TOKEN isn't configured", async () => {
      const { token } = await registerUser("MonoBuyer");
      await request(app.getHttpServer())
        .post("/api/v1/payments/orders")
        .set("Authorization", `Bearer ${token}`)
        .send({ packageId, provider: "MONO" })
        .expect(503);
    });

    it("verifies a real ECDSA-signed webhook and grants credits", async () => {
      const { token, userId } = await registerUser("MonoWebhook");
      const before = await balanceOf(token);

      const order = await prisma.platformPaymentOrder.create({
        data: { userId, packageId, provider: "MONO", amount: 199, currency: "UAH", status: "PENDING" },
      });

      const body = JSON.stringify({ invoiceId: "inv_test_1", status: "success", reference: order.id });
      const signature = signEcdsa("sha256", Buffer.from(body), privateKey).toString("base64");

      await request(app.getHttpServer())
        .post("/api/v1/payments/webhooks/mono")
        .set("Content-Type", "application/json")
        .set("X-Sign", signature)
        .send(body)
        .expect(200);

      const updated = await prisma.platformPaymentOrder.findUniqueOrThrow({ where: { id: order.id } });
      expect(updated.status).toBe("PAID");
      expect(await balanceOf(token)).toBe(before + packageCredits);
    });

    it("rejects a webhook with a bad signature", async () => {
      const { userId } = await registerUser("MonoBadSig");
      const order = await prisma.platformPaymentOrder.create({
        data: { userId, packageId, provider: "MONO", amount: 199, currency: "UAH", status: "PENDING" },
      });
      const body = JSON.stringify({ invoiceId: "inv_test_2", status: "success", reference: order.id });

      await request(app.getHttpServer())
        .post("/api/v1/payments/webhooks/mono")
        .set("Content-Type", "application/json")
        .set("X-Sign", Buffer.from("garbage").toString("base64"))
        .send(body)
        .expect(400);

      const unchanged = await prisma.platformPaymentOrder.findUniqueOrThrow({ where: { id: order.id } });
      expect(unchanged.status).toBe("PENDING");
    });
  });

  describe("Manual IBAN", () => {
    it("creating an order returns bank-transfer instructions with no signature step", async () => {
      const { token } = await registerUser("IbanBuyer");
      const res = await request(app.getHttpServer())
        .post("/api/v1/payments/orders")
        .set("Authorization", `Bearer ${token}`)
        .send({ packageId, provider: "MANUAL_IBAN" })
        .expect(201);

      expect(res.body.checkout.instructions).toContain(res.body.order.id);
      expect(res.body.checkout.redirectUrl).toBeUndefined();
    });

    it("only an admin can confirm it, and only once", async () => {
      const { token } = await registerUser("IbanConfirm");
      const admin = await registerUser("IbanAdmin");
      const before = await balanceOf(token);

      const created = await request(app.getHttpServer())
        .post("/api/v1/payments/orders")
        .set("Authorization", `Bearer ${token}`)
        .send({ packageId, provider: "MANUAL_IBAN" })
        .expect(201);
      const orderId = created.body.order.id;

      await request(app.getHttpServer())
        .patch(`/api/v1/payments/orders/${orderId}/confirm-manual`)
        .set("Authorization", `Bearer ${token}`)
        .expect(403);

      await prisma.user.update({ where: { id: admin.userId }, data: { role: "ADMIN" } });

      await request(app.getHttpServer())
        .patch(`/api/v1/payments/orders/${orderId}/confirm-manual`)
        .set("Authorization", `Bearer ${admin.token}`)
        .expect(200);

      expect(await balanceOf(token)).toBe(before + packageCredits);

      // Idempotent — confirming an already-PAID order again must not double-credit.
      await request(app.getHttpServer())
        .patch(`/api/v1/payments/orders/${orderId}/confirm-manual`)
        .set("Authorization", `Bearer ${admin.token}`)
        .expect(200);
      expect(await balanceOf(token)).toBe(before + packageCredits);
    });
  });

  describe("Subscription orders (web — same mechanism, WayForPay/Mono only, one month at a time)", () => {
    async function mySubscription(token: string) {
      const res = await request(app.getHttpServer()).get("/api/v1/platform-subscriptions/mine").set("Authorization", `Bearer ${token}`).expect(200);
      return res.body as { tier: string | null; status: string | null; expiresAt: string | null; autoRenewing: boolean };
    }

    it("lists tiers publicly with real prices, never hardcoded", async () => {
      const res = await request(app.getHttpServer()).get("/api/v1/platform-subscriptions/tiers").expect(200);
      const pro = res.body.find((t: { tier: string }) => t.tier === "PRO");
      expect(pro.price).toBe(SUBSCRIPTION_TIERS.PRO.price);
      expect(pro.monthlyCredits).toBe(SUBSCRIPTION_TIERS.PRO.monthlyCredits);
    });

    it("rejects an order with neither packageId nor subscriptionTier, or with both", async () => {
      const { token } = await registerUser("SubNeither");
      await request(app.getHttpServer()).post("/api/v1/payments/orders").set("Authorization", `Bearer ${token}`).send({ provider: "WAYFORPAY" }).expect(400);
      await request(app.getHttpServer())
        .post("/api/v1/payments/orders")
        .set("Authorization", `Bearer ${token}`)
        .send({ packageId, subscriptionTier: "STARTER", provider: "WAYFORPAY" })
        .expect(400);
    });

    it("rejects a subscription order via MANUAL_IBAN", async () => {
      const { token } = await registerUser("SubIban");
      await request(app.getHttpServer())
        .post("/api/v1/payments/orders")
        .set("Authorization", `Bearer ${token}`)
        .send({ subscriptionTier: "STARTER", provider: "MANUAL_IBAN" })
        .expect(400);
    });

    it("a paid WayForPay subscription order activates the tier and grants that month's credits, idempotently on redelivery", async () => {
      const { token } = await registerUser("SubWfp");
      const before = await balanceOf(token);

      const created = await request(app.getHttpServer())
        .post("/api/v1/payments/orders")
        .set("Authorization", `Bearer ${token}`)
        .send({ subscriptionTier: "PRO", provider: "WAYFORPAY" })
        .expect(201);
      expect(Number(created.body.order.amount)).toBe(SUBSCRIPTION_TIERS.PRO.price);
      const orderId = created.body.order.id;

      const payload = { merchantAccount: wayForPayAccount, orderReference: orderId, amount: SUBSCRIPTION_TIERS.PRO.price, currency: "UAH", transactionStatus: "Approved" };
      const signature = wayForPaySignature([
        payload.merchantAccount,
        payload.orderReference,
        String(payload.amount),
        payload.currency,
        "",
        "",
        payload.transactionStatus,
        "",
      ]);

      await request(app.getHttpServer()).post("/api/v1/payments/webhooks/wayforpay").send({ ...payload, merchantSignature: signature }).expect(200);

      const order = await prisma.platformPaymentOrder.findUniqueOrThrow({ where: { id: orderId } });
      expect(order.status).toBe("PAID");
      const sub = await mySubscription(token);
      expect(sub.tier).toBe("PRO");
      expect(await balanceOf(token)).toBe(before + SUBSCRIPTION_TIERS.PRO.monthlyCredits);

      // Redelivered webhook must not double-activate or double-grant.
      await request(app.getHttpServer()).post("/api/v1/payments/webhooks/wayforpay").send({ ...payload, merchantSignature: signature }).expect(200);
      expect(await balanceOf(token)).toBe(before + SUBSCRIPTION_TIERS.PRO.monthlyCredits);
      expect(await prisma.platformSubscription.count({ where: { userId: created.body.order.userId } })).toBe(1);
    });

    it("renewing before expiry extends from the current expiry, not from now", async () => {
      const { token, userId } = await registerUser("SubRenew");

      const first = await request(app.getHttpServer())
        .post("/api/v1/payments/orders")
        .set("Authorization", `Bearer ${token}`)
        .send({ subscriptionTier: "STARTER", provider: "WAYFORPAY" })
        .expect(201);
      const firstPayload = { merchantAccount: wayForPayAccount, orderReference: first.body.order.id, amount: SUBSCRIPTION_TIERS.STARTER.price, currency: "UAH", transactionStatus: "Approved" };
      const firstSig = wayForPaySignature([firstPayload.merchantAccount, firstPayload.orderReference, String(firstPayload.amount), firstPayload.currency, "", "", firstPayload.transactionStatus, ""]);
      await request(app.getHttpServer()).post("/api/v1/payments/webhooks/wayforpay").send({ ...firstPayload, merchantSignature: firstSig }).expect(200);
      const afterFirst = await mySubscription(token);

      const second = await request(app.getHttpServer())
        .post("/api/v1/payments/orders")
        .set("Authorization", `Bearer ${token}`)
        .send({ subscriptionTier: "STARTER", provider: "WAYFORPAY" })
        .expect(201);
      const secondPayload = { merchantAccount: wayForPayAccount, orderReference: second.body.order.id, amount: SUBSCRIPTION_TIERS.STARTER.price, currency: "UAH", transactionStatus: "Approved" };
      const secondSig = wayForPaySignature([secondPayload.merchantAccount, secondPayload.orderReference, String(secondPayload.amount), secondPayload.currency, "", "", secondPayload.transactionStatus, ""]);
      await request(app.getHttpServer()).post("/api/v1/payments/webhooks/wayforpay").send({ ...secondPayload, merchantSignature: secondSig }).expect(200);
      const afterSecond = await mySubscription(token);

      const firstExpiry = new Date(afterFirst.expiresAt!).getTime();
      const secondExpiry = new Date(afterSecond.expiresAt!).getTime();
      // ~30 days added on top of the first expiry, not on top of "now" (which would only add ~30 days from a moment already past `firstExpiry`).
      expect(secondExpiry - firstExpiry).toBeGreaterThan(29 * 24 * 60 * 60 * 1000);
      expect(await prisma.platformSubscription.count({ where: { userId } })).toBe(2);
    });

    it("a paid Mono subscription order activates the tier via ECDSA-verified webhook", async () => {
      const { token, userId } = await registerUser("SubMono");
      const before = await balanceOf(token);

      const order = await prisma.platformPaymentOrder.create({
        data: { userId, subscriptionTier: "STARTER", provider: "MONO", amount: SUBSCRIPTION_TIERS.STARTER.price, currency: "UAH" },
      });
      const body = JSON.stringify({ invoiceId: "inv_sub_1", status: "success", reference: order.id });
      const signature = signEcdsa("sha256", Buffer.from(body), privateKey).toString("base64");

      await request(app.getHttpServer())
        .post("/api/v1/payments/webhooks/mono")
        .set("Content-Type", "application/json")
        .set("X-Sign", signature)
        .send(body)
        .expect(200);

      const sub = await mySubscription(token);
      expect(sub.tier).toBe("STARTER");
      expect(await balanceOf(token)).toBe(before + SUBSCRIPTION_TIERS.STARTER.monthlyCredits);
    });
  });
});
