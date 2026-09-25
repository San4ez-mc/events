import { ConfigService } from "@nestjs/config";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/bootstrap";
import { PrismaService } from "../src/prisma/prisma.service";
import type { EnvConfig } from "../src/config/env.validation";
import { GoogleTokenVerifier, type GoogleIdentity } from "../src/auth/google-token.verifier";
import { ApiException } from "../src/common/exceptions/api.exception";

/**
 * §9 Google sign-in. The call to Google is replaced with a stub verifier
 * (tokens named "good:<email>[:unverified]" or anything else = invalid); what
 * is under test is OUR logic: account creation, linking by email, refusal of
 * unverified emails and blocked users.
 */
describe("Google sign-in (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const prefix = "e2e-google-";

  const stub: Pick<GoogleTokenVerifier, "verify"> = {
    async verify(idToken: string): Promise<GoogleIdentity> {
      const [kind, email, flag] = idToken.split(":");
      if (kind !== "good" || !email) throw new ApiException("INVALID_GOOGLE_TOKEN", "Invalid Google token", 401);
      return { email, emailVerified: flag !== "unverified", name: "Google Person", picture: "https://example.com/p.png" };
    },
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(GoogleTokenVerifier)
      .useValue(stub)
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app, app.get(ConfigService<EnvConfig, true>));
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { startsWith: prefix } } });
    await app.close();
  });

  const post = (idToken: string) => request(app.getHttpServer()).post("/api/v1/auth/google").send({ idToken });
  const token = (email: string, flag = "") => `good:${email}${flag ? `:${flag}` : ""}:padding-to-pass-length-validation`;

  it("creates a verified account on first sign-in and returns tokens", async () => {
    const email = `${prefix}new-${Date.now()}@example.com`;
    const res = await post(token(email)).expect(200);
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.user.email).toBe(email);

    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(user.emailVerifiedAt).not.toBeNull();
    expect(user.name).toBe("Google Person");
  });

  it("signs an existing account in again without creating a duplicate", async () => {
    const email = `${prefix}again-${Date.now()}@example.com`;
    await post(token(email)).expect(200);
    await post(token(email)).expect(200);
    expect(await prisma.user.count({ where: { email } })).toBe(1);
  });

  it("links to an existing password account with the same email and verifies it", async () => {
    const email = `${prefix}link-${Date.now()}@example.com`;
    await request(app.getHttpServer()).post("/api/v1/auth/register").send({ email, password: "Passw0rd!Test1", name: "Pw" }).expect(201);

    await post(token(email)).expect(200);
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(user.emailVerifiedAt).not.toBeNull();
    expect(user.name).toBe("Pw");
  });

  it("refuses a Google identity whose email is not verified", async () => {
    const email = `${prefix}unv-${Date.now()}@example.com`;
    await post(token(email, "unverified")).expect(401);
    expect(await prisma.user.count({ where: { email } })).toBe(0);
  });

  it("refuses an invalid token", async () => {
    const res = await post("bad-token-that-is-long-enough-to-pass-validation").expect(401);
    expect(res.body.error.code).toBe("INVALID_GOOGLE_TOKEN");
  });

  it("refuses a blocked account", async () => {
    const email = `${prefix}blocked-${Date.now()}@example.com`;
    await post(token(email)).expect(200);
    await prisma.user.update({ where: { email }, data: { status: "BLOCKED" } });
    await post(token(email)).expect(403);
  });
});
