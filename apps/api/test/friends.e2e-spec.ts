import { ConfigService } from "@nestjs/config";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/bootstrap";
import { PrismaService } from "../src/prisma/prisma.service";
import type { EnvConfig } from "../src/config/env.validation";

/** §34/§35, §115 Phase 6: friend requests, friendships, and blocks. */
describe("Friends (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const testEmailPrefix = "e2e-friends-";

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app, app.get(ConfigService<EnvConfig, true>));
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { user: { email: { startsWith: testEmailPrefix } } } });
    await prisma.userBlock.deleteMany({ where: { blocker: { email: { startsWith: testEmailPrefix } } } });
    await prisma.friendship.deleteMany({ where: { requester: { email: { startsWith: testEmailPrefix } } } });
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

  it("full lifecycle: request -> notified -> accept -> notified -> listed as friends -> unfriend", async () => {
    const a = await registerUser("A");
    const b = await registerUser("B");

    const sent = await request(app.getHttpServer())
      .post("/api/v1/friends/requests")
      .set("Authorization", `Bearer ${a.token}`)
      .send({ addresseeId: b.userId })
      .expect(201);
    expect(sent.body.status).toBe("PENDING");

    const bNotification = await prisma.notification.findFirst({ where: { userId: b.userId, type: "FRIEND_REQUEST" } });
    expect(bNotification).not.toBeNull();

    const incoming = await request(app.getHttpServer())
      .get("/api/v1/friends/requests/incoming")
      .set("Authorization", `Bearer ${b.token}`)
      .expect(200);
    expect(incoming.body.some((r: { id: string }) => r.id === sent.body.id)).toBe(true);

    await request(app.getHttpServer())
      .patch(`/api/v1/friends/requests/${sent.body.id}/accept`)
      .set("Authorization", `Bearer ${b.token}`)
      .expect(200);

    const aNotification = await prisma.notification.findFirst({ where: { userId: a.userId, type: "FRIEND_ACCEPTED" } });
    expect(aNotification).not.toBeNull();

    const aFriends = await request(app.getHttpServer())
      .get("/api/v1/friends")
      .set("Authorization", `Bearer ${a.token}`)
      .expect(200);
    expect(aFriends.body.some((f: { id: string }) => f.id === b.userId)).toBe(true);

    const status = await request(app.getHttpServer())
      .get(`/api/v1/friends/status/${b.userId}`)
      .set("Authorization", `Bearer ${a.token}`)
      .expect(200);
    expect(status.body.status).toBe("FRIENDS");

    await request(app.getHttpServer())
      .delete(`/api/v1/friends/${sent.body.id}`)
      .set("Authorization", `Bearer ${a.token}`)
      .expect(204);

    const afterUnfriend = await request(app.getHttpServer())
      .get("/api/v1/friends")
      .set("Authorization", `Bearer ${a.token}`)
      .expect(200);
    expect(afterUnfriend.body.some((f: { id: string }) => f.id === b.userId)).toBe(false);
  });

  it("reject sets REJECTED, and a fresh request afterwards is allowed", async () => {
    const a = await registerUser("A");
    const b = await registerUser("B");

    const sent = await request(app.getHttpServer())
      .post("/api/v1/friends/requests")
      .set("Authorization", `Bearer ${a.token}`)
      .send({ addresseeId: b.userId })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/api/v1/friends/requests/${sent.body.id}/reject`)
      .set("Authorization", `Bearer ${b.token}`)
      .expect(200);

    const retry = await request(app.getHttpServer())
      .post("/api/v1/friends/requests")
      .set("Authorization", `Bearer ${a.token}`)
      .send({ addresseeId: b.userId })
      .expect(201);
    expect(retry.body.status).toBe("PENDING");
  });

  it("requester can cancel their own pending request", async () => {
    const a = await registerUser("A");
    const b = await registerUser("B");

    const sent = await request(app.getHttpServer())
      .post("/api/v1/friends/requests")
      .set("Authorization", `Bearer ${a.token}`)
      .send({ addresseeId: b.userId })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/api/v1/friends/requests/${sent.body.id}/cancel`)
      .set("Authorization", `Bearer ${a.token}`)
      .expect(200);

    const status = await request(app.getHttpServer())
      .get(`/api/v1/friends/status/${b.userId}`)
      .set("Authorization", `Bearer ${a.token}`)
      .expect(200);
    expect(status.body.status).toBe("NONE");
  });

  it("rejects duplicate requests while one is pending or already friends", async () => {
    const a = await registerUser("A");
    const b = await registerUser("B");

    await request(app.getHttpServer())
      .post("/api/v1/friends/requests")
      .set("Authorization", `Bearer ${a.token}`)
      .send({ addresseeId: b.userId })
      .expect(201);

    const duplicate = await request(app.getHttpServer())
      .post("/api/v1/friends/requests")
      .set("Authorization", `Bearer ${a.token}`)
      .send({ addresseeId: b.userId })
      .expect(409);
    expect(duplicate.body.error.code).toBe("FRIEND_REQUEST_ALREADY_EXISTS");

    // The reverse direction is the same unordered pair — also blocked.
    const reverse = await request(app.getHttpServer())
      .post("/api/v1/friends/requests")
      .set("Authorization", `Bearer ${b.token}`)
      .send({ addresseeId: a.userId })
      .expect(409);
    expect(reverse.body.error.code).toBe("FRIEND_REQUEST_ALREADY_EXISTS");
  });

  it("rejects self-requests", async () => {
    const a = await registerUser("A");
    await request(app.getHttpServer())
      .post("/api/v1/friends/requests")
      .set("Authorization", `Bearer ${a.token}`)
      .send({ addresseeId: a.userId })
      .expect(400);
  });

  it("only the addressee can accept or reject a request", async () => {
    const a = await registerUser("A");
    const b = await registerUser("B");
    const stranger = await registerUser("Stranger");

    const sent = await request(app.getHttpServer())
      .post("/api/v1/friends/requests")
      .set("Authorization", `Bearer ${a.token}`)
      .send({ addresseeId: b.userId })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/api/v1/friends/requests/${sent.body.id}/accept`)
      .set("Authorization", `Bearer ${stranger.token}`)
      .expect(403);
  });

  it("blocking cancels an existing friendship and prevents new requests", async () => {
    const a = await registerUser("A");
    const b = await registerUser("B");

    const sent = await request(app.getHttpServer())
      .post("/api/v1/friends/requests")
      .set("Authorization", `Bearer ${a.token}`)
      .send({ addresseeId: b.userId })
      .expect(201);
    await request(app.getHttpServer())
      .patch(`/api/v1/friends/requests/${sent.body.id}/accept`)
      .set("Authorization", `Bearer ${b.token}`)
      .expect(200);

    await request(app.getHttpServer())
      .post("/api/v1/friends/blocks")
      .set("Authorization", `Bearer ${b.token}`)
      .send({ userId: a.userId })
      .expect(204);

    const status = await request(app.getHttpServer())
      .get(`/api/v1/friends/status/${b.userId}`)
      .set("Authorization", `Bearer ${a.token}`)
      .expect(200);
    expect(status.body.status).toBe("BLOCKED_ME");

    const blockedRequest = await request(app.getHttpServer())
      .post("/api/v1/friends/requests")
      .set("Authorization", `Bearer ${a.token}`)
      .send({ addresseeId: b.userId })
      .expect(403);
    expect(blockedRequest.body.error.code).toBe("USER_BLOCKED");

    const blockedList = await request(app.getHttpServer())
      .get("/api/v1/friends/blocks")
      .set("Authorization", `Bearer ${b.token}`)
      .expect(200);
    expect(blockedList.body.some((u: { id: string }) => u.id === a.userId)).toBe(true);

    await request(app.getHttpServer())
      .delete(`/api/v1/friends/blocks/${a.userId}`)
      .set("Authorization", `Bearer ${b.token}`)
      .expect(204);

    const afterUnblock = await request(app.getHttpServer())
      .post("/api/v1/friends/requests")
      .set("Authorization", `Bearer ${a.token}`)
      .send({ addresseeId: b.userId })
      .expect(201);
    expect(afterUnblock.body.status).toBe("PENDING");
  });

  it("requires authentication", async () => {
    await request(app.getHttpServer()).get("/api/v1/friends").expect(401);
    await request(app.getHttpServer()).post("/api/v1/friends/requests").send({ addresseeId: "x" }).expect(401);
  });
});
