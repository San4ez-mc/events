import { ConfigService } from "@nestjs/config";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import sharp from "sharp";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/bootstrap";
import { PrismaService } from "../src/prisma/prisma.service";
import type { EnvConfig } from "../src/config/env.validation";
import { MAX_EVENT_MEDIA_FILES } from "@kiro/config";

describe("Event media (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const testEmailPrefix = "e2e-media-";

  let ownerToken: string;
  let strangerToken: string;
  let eventId: string;
  let testJpeg: Buffer;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app, app.get(ConfigService<EnvConfig, true>));
    await app.init();
    prisma = app.get(PrismaService);

    testJpeg = await sharp({
      create: { width: 800, height: 1200, channels: 3, background: { r: 200, g: 100, b: 50 } },
    })
      .jpeg()
      .toBuffer();

    const ownerRes = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ email: `${testEmailPrefix}owner-${Date.now()}@example.com`, password: "Str0ngPass", name: "Owner" })
      .expect(201);
    ownerToken = ownerRes.body.accessToken;

    const strangerRes = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ email: `${testEmailPrefix}stranger-${Date.now()}@example.com`, password: "Str0ngPass", name: "Stranger" })
      .expect(201);
    strangerToken = strangerRes.body.accessToken;

    const eventRes = await request(app.getHttpServer())
      .post("/api/v1/events")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ title: "Media E2E Event" })
      .expect(201);
    eventId = eventRes.body.id;
  });

  afterAll(async () => {
    await prisma.event.deleteMany({ where: { owner: { email: { startsWith: testEmailPrefix } } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: testEmailPrefix } } });
    await app.close();
  });

  it("uploads an image, generating display + thumbnail derivatives without cropping the original", async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/events/${eventId}/media`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .attach("file", testJpeg, "photo.jpg")
      .expect(201);

    expect(res.body.type).toBe("IMAGE");
    expect(res.body.width).toBe(800);
    expect(res.body.height).toBe(1200);
    expect(res.body.originalUrl).toEqual(expect.any(String));
    expect(res.body.displayUrl).not.toBe(res.body.originalUrl);
    expect(res.body.thumbnailUrl).not.toBe(res.body.displayUrl);
    expect(res.body.sortOrder).toBe(0);
  });

  it("rejects an upload from a non-owner", async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/events/${eventId}/media`)
      .set("Authorization", `Bearer ${strangerToken}`)
      .attach("file", testJpeg, "photo.jpg")
      .expect(403);
  });

  it("rejects content whose real bytes don't match an allowed image/video type (§88)", async () => {
    const fakeImage = Buffer.from("this is not actually an image, just text pretending to be one");
    const res = await request(app.getHttpServer())
      .post(`/api/v1/events/${eventId}/media`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .attach("file", fakeImage, "photo.jpg")
      .expect(400);
    expect(res.body.error.code).toBe("INVALID_FILE_TYPE");
  });

  it("enforces the 10-file-per-event cap", async () => {
    // One was already uploaded in the first test — top up to the cap.
    const already = await prisma.eventMedia.count({ where: { eventId } });
    for (let i = already; i < MAX_EVENT_MEDIA_FILES; i++) {
      await request(app.getHttpServer())
        .post(`/api/v1/events/${eventId}/media`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .attach("file", testJpeg, `photo-${i}.jpg`)
        .expect(201);
    }

    const res = await request(app.getHttpServer())
      .post(`/api/v1/events/${eventId}/media`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .attach("file", testJpeg, "one-too-many.jpg")
      .expect(400);
    expect(res.body.error.code).toBe("MEDIA_LIMIT_REACHED");
  }, 30_000);

  it("updates a media item's focal point", async () => {
    const media = await prisma.eventMedia.findFirst({ where: { eventId } });
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/events/${eventId}/media/${media!.id}/focal-point`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ focalX: 0.3, focalY: 0.7 })
      .expect(200);
    expect(Number(res.body.focalX)).toBeCloseTo(0.3);
    expect(Number(res.body.focalY)).toBeCloseTo(0.7);
  });

  it("reorders media and rejects a set that doesn't match the event's actual media", async () => {
    const media = await prisma.eventMedia.findMany({ where: { eventId }, orderBy: { sortOrder: "asc" } });
    const reversedIds = media.map((m) => m.id).reverse();

    const res = await request(app.getHttpServer())
      .patch(`/api/v1/events/${eventId}/media/reorder`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ mediaIds: reversedIds })
      .expect(200);
    expect(res.body[0].id).toBe(reversedIds[0]);

    await request(app.getHttpServer())
      .patch(`/api/v1/events/${eventId}/media/reorder`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ mediaIds: [reversedIds[0]] }) // wrong set — missing items
      .expect(400);
  });

  it("deletes a media item", async () => {
    const media = await prisma.eventMedia.findFirst({ where: { eventId } });
    await request(app.getHttpServer())
      .delete(`/api/v1/events/${eventId}/media/${media!.id}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .expect(204);

    const stillThere = await prisma.eventMedia.findUnique({ where: { id: media!.id } });
    expect(stillThere).toBeNull();
  });
});
