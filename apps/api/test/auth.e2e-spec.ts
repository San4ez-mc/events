import { ConfigService } from "@nestjs/config";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/bootstrap";
import { PrismaService } from "../src/prisma/prisma.service";
import type { EnvConfig } from "../src/config/env.validation";

/**
 * Exercises the critical auth flows required by §97: register, login,
 * refresh rotation + reuse detection (§9), and the auth-required-by-default
 * guard (§63). Runs against the real kiro_test PostgreSQL database — no
 * mocked Prisma — because the guarantees that matter here (unique email
 * constraint, token rotation via a real transaction) are exactly the things
 * a mock would paper over.
 */
describe("Auth (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const testEmailPrefix = "e2e-auth-";

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app, app.get(ConfigService<EnvConfig, true>));
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    // Clean up only what this suite created — never a blanket table wipe.
    await prisma.user.deleteMany({ where: { email: { startsWith: testEmailPrefix } } });
    await app.close();
  });

  function uniqueEmail(): string {
    return `${testEmailPrefix}${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  }

  describe("POST /api/v1/auth/register", () => {
    it("creates a user and returns tokens", async () => {
      const email = uniqueEmail();
      const res = await request(app.getHttpServer())
        .post("/api/v1/auth/register")
        .send({ email, password: "Str0ngPass", name: "E2E User" })
        .expect(201);

      expect(res.body.user.email).toBe(email);
      expect(res.body.user.role).toBe("USER");
      expect(res.body.accessToken).toEqual(expect.any(String));
      expect(res.body.refreshToken).toEqual(expect.any(String));
      // Never leak the hash.
      expect(res.body.user.passwordHash).toBeUndefined();
    });

    it("rejects a duplicate email with EMAIL_ALREADY_REGISTERED", async () => {
      const email = uniqueEmail();
      await request(app.getHttpServer())
        .post("/api/v1/auth/register")
        .send({ email, password: "Str0ngPass", name: "First" })
        .expect(201);

      const res = await request(app.getHttpServer())
        .post("/api/v1/auth/register")
        .send({ email, password: "Str0ngPass", name: "Second" })
        .expect(409);

      expect(res.body.error.code).toBe("EMAIL_ALREADY_REGISTERED");
    });

    it("rejects a weak password with VALIDATION_ERROR", async () => {
      const res = await request(app.getHttpServer())
        .post("/api/v1/auth/register")
        .send({ email: uniqueEmail(), password: "short", name: "Weak" })
        .expect(400);

      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("POST /api/v1/auth/login", () => {
    it("logs in with correct credentials", async () => {
      const email = uniqueEmail();
      await request(app.getHttpServer())
        .post("/api/v1/auth/register")
        .send({ email, password: "Str0ngPass", name: "Login Test" })
        .expect(201);

      const res = await request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send({ email, password: "Str0ngPass" })
        .expect(200);

      expect(res.body.accessToken).toEqual(expect.any(String));
    });

    it("rejects wrong password with INVALID_CREDENTIALS (not a 500, not account enumeration)", async () => {
      const email = uniqueEmail();
      await request(app.getHttpServer())
        .post("/api/v1/auth/register")
        .send({ email, password: "Str0ngPass", name: "Wrong Pass" })
        .expect(201);

      const res = await request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send({ email, password: "WrongPassword1" })
        .expect(401);

      expect(res.body.error.code).toBe("INVALID_CREDENTIALS");
    });

    it("rejects an unknown email with the same INVALID_CREDENTIALS code (no account enumeration)", async () => {
      const res = await request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send({ email: uniqueEmail(), password: "Whatever1" })
        .expect(401);

      expect(res.body.error.code).toBe("INVALID_CREDENTIALS");
    });
  });

  describe("refresh token rotation (§9)", () => {
    async function registerMobile() {
      const email = uniqueEmail();
      const res = await request(app.getHttpServer())
        .post("/api/v1/auth/register")
        .send({ email, password: "Str0ngPass", name: "Refresh Test" })
        .expect(201);
      return res.body.refreshToken as string;
    }

    it("issues a new token pair and invalidates the old one", async () => {
      const refreshToken = await registerMobile();

      const first = await request(app.getHttpServer())
        .post("/api/v1/auth/refresh")
        .send({ refreshToken })
        .expect(200);
      expect(first.body.refreshToken).not.toBe(refreshToken);

      // Reusing the original (now-rotated-out) token must fail.
      const reuse = await request(app.getHttpServer())
        .post("/api/v1/auth/refresh")
        .send({ refreshToken })
        .expect(401);
      expect(reuse.body.error.code).toBe("REFRESH_TOKEN_REUSED");
    });

    it("revokes the whole token family on reuse, so even the newest token stops working", async () => {
      const refreshToken = await registerMobile();

      const rotated = await request(app.getHttpServer())
        .post("/api/v1/auth/refresh")
        .send({ refreshToken })
        .expect(200);

      // Trigger reuse detection on the original token...
      await request(app.getHttpServer())
        .post("/api/v1/auth/refresh")
        .send({ refreshToken })
        .expect(401);

      // ...which must also burn the token that was legitimately issued after it.
      const afterTheft = await request(app.getHttpServer())
        .post("/api/v1/auth/refresh")
        .send({ refreshToken: rotated.body.refreshToken })
        .expect(401);
      expect(afterTheft.body.error.code).toBe("REFRESH_TOKEN_REUSED");
    });
  });

  describe("auth-required-by-default (§63)", () => {
    it("rejects an unauthenticated request to a protected route", async () => {
      const res = await request(app.getHttpServer()).get("/api/v1/users/me").expect(401);
      expect(res.body.error.code).toBe("AUTH_REQUIRED");
    });

    it("allows an authenticated request with a valid access token", async () => {
      const email = uniqueEmail();
      const registerRes = await request(app.getHttpServer())
        .post("/api/v1/auth/register")
        .send({ email, password: "Str0ngPass", name: "Protected Route" })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get("/api/v1/users/me")
        .set("Authorization", `Bearer ${registerRes.body.accessToken}`)
        .expect(200);

      expect(res.body.email).toBe(email);
    });
  });
});
