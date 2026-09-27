import { ConfigService } from "@nestjs/config";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { AppModule } from "../../src/app.module";
import { configureApp } from "../../src/bootstrap";
import { PrismaService } from "../../src/prisma/prisma.service";
import type { EnvConfig } from "../../src/config/env.validation";

/**
 * QA audit — section 56 (performance). Seeds a larger dataset directly via
 * Prisma `createMany` (bypassing the API, per the task's instructions) with
 * the `qa-perf-` prefix, measures latency of the major read paths, and
 * deletes everything it created in `afterAll`.
 *
 * Scale note: the task asked for 5,000 events / 5,000 users / 20,000
 * registrations. That volume is used here for users/events/registrations
 * (bulk `createMany`, which is fast). See the report for the resulting
 * numbers and for the N+1/unbounded-query findings from reading the
 * services directly (DiscoveryService, SocialProofService, SearchService,
 * AdminEventsService, AdminUsersService).
 */
describe("QA social — performance (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const prefix = "qa-perf-";
  const http = () => request(app.getHttpServer());
  const timings: Record<string, number> = {};

  jest.setTimeout(600000);

  const EVENT_COUNT = 5000;
  const USER_COUNT = 5000;
  const REGISTRATIONS_PER_EVENT = 4; // 5000 * 4 = 20,000 registrations

  let kyivCityId: string;
  let categoryIds: string[];
  let organizerId: string; // the "organizer dashboard" fixture owner

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app, app.get(ConfigService<EnvConfig, true>));
    await app.init();
    prisma = app.get(PrismaService);

    kyivCityId = (await prisma.city.findUniqueOrThrow({ where: { slug: "kyiv" } })).id;
    categoryIds = (await prisma.category.findMany({ where: { status: "ACTIVE" }, take: 10, select: { id: true } })).map((c) => c.id);

    // --- Seed users ---
    const userRows = Array.from({ length: USER_COUNT }, (_, i) => ({
      id: randomUUID(),
      email: `${prefix}user-${i}@example.com`,
      passwordHash: "not-a-real-hash",
      name: `Perf User ${i}`,
      emailVerifiedAt: new Date(),
    }));
    const t0 = Date.now();
    await prisma.user.createMany({ data: userRows });
    const userIds = userRows.map((u) => u.id);
    organizerId = userIds[0]!;

    // --- Seed events, owned round-robin by the seeded users, spread over the next 90 days ---
    const eventRows = Array.from({ length: EVENT_COUNT }, (_, i) => {
      const startsAt = new Date(Date.now() + (i % 90) * 86_400_000 + 3_600_000);
      return {
        id: randomUUID(),
        ownerId: i < 200 ? organizerId : userIds[i % USER_COUNT]!, // first 200 all belong to one organizer, for the dashboard measurement
        slug: `${prefix}event-${i}-${Date.now()}`,
        title: `QA Perf Event ${i}`,
        description: "Bulk-seeded performance fixture event.",
        status: "PUBLISHED" as const,
        visibility: "PUBLIC" as const,
        format: "OFFLINE" as const,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 2 * 3_600_000),
        cityId: kyivCityId,
        categoryId: categoryIds[i % categoryIds.length]!,
        addressText: "вул. Перформансна, 1",
        capacity: 100,
        priceType: "FREE" as const,
      };
    });
    await prisma.event.createMany({ data: eventRows });
    const eventIds = eventRows.map((e) => e.id);

    // --- Seed registrations: 4 distinct users per event => 20,000 unique (eventId, userId) rows ---
    const registrationRows: { id: string; eventId: string; userId: string; status: "REGISTERED" }[] = [];
    for (let i = 0; i < EVENT_COUNT; i++) {
      for (let offset = 0; offset < REGISTRATIONS_PER_EVENT; offset++) {
        registrationRows.push({
          id: randomUUID(),
          eventId: eventIds[i]!,
          userId: userIds[(i + offset) % USER_COUNT]!,
          status: "REGISTERED",
        });
      }
    }
    await prisma.registration.createMany({ data: registrationRows });
    const seedMs = Date.now() - t0;
    // eslint-disable-next-line no-console
    console.log(`[qa-perf] seeded ${USER_COUNT} users, ${EVENT_COUNT} events, ${registrationRows.length} registrations in ${seedMs}ms`);
    timings["seed"] = seedMs;
  });

  afterAll(async () => {
    const t0 = Date.now();
    await prisma.registration.deleteMany({ where: { user: { email: { startsWith: prefix } } } });
    await prisma.event.deleteMany({ where: { owner: { email: { startsWith: prefix } } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: prefix } } });
    // eslint-disable-next-line no-console
    console.log(`[qa-perf] cleanup took ${Date.now() - t0}ms`);
    // eslint-disable-next-line no-console
    console.log("[qa-perf] latency summary (ms):", timings);
    await app.close();
  });

  async function timed(label: string, fn: () => Promise<unknown>): Promise<void> {
    const t0 = Date.now();
    await fn();
    timings[label] = Date.now() - t0;
  }

  it("measures discovery feed latency at 5,000 published events", async () => {
    await timed("discovery_feed_default", () => http().get("/api/v1/discovery?limit=20").expect(200));
    await timed("discovery_feed_filtered", () => http().get(`/api/v1/discovery?limit=20&cityIds=${kyivCityId}&categoryIds=${categoryIds[0]}`).expect(200));
    expect(timings["discovery_feed_default"]).toBeLessThan(5000);
  });

  it("measures search latency", async () => {
    await timed("search_query", () => http().get("/api/v1/search?q=Perf&limit=20").expect(200));
    expect(timings["search_query"]).toBeLessThan(5000);
  });

  it("measures a single event page latency", async () => {
    const oneEvent = await prisma.event.findFirstOrThrow({ where: { owner: { email: { startsWith: prefix } } } });
    await timed("event_page", () => http().get(`/api/v1/events/slug/${oneEvent.slug}`).expect(200));
    expect(timings["event_page"]).toBeLessThan(3000);
  });

  it("measures the organizer dashboard (/events/mine) latency for an organizer with 200 events", async () => {
    // Not authenticated via a real login here (bulk-seeded user has no usable password) — call the service
    // directly through the same DI container the controller uses, which still exercises the real Prisma query.
    const { EventsService } = await import("../../src/events/events.service");
    const eventsService = app.get(EventsService);
    await timed("organizer_dashboard_mine", () => eventsService.findMine(organizerId, { limit: 20 }));
    expect(timings["organizer_dashboard_mine"]).toBeLessThan(3000);
  });

  it("measures admin search latency across 5,000 events / 5,000 users", async () => {
    const admin = await http()
      .post("/api/v1/auth/register")
      .send({ email: `${prefix}admin-${Date.now()}@example.com`, password: "Str0ngPass", name: "Perf Admin" })
      .expect(201);
    await prisma.user.update({ where: { id: admin.body.user.id }, data: { role: "ADMIN" } });

    await timed("admin_events_search", () => http().get("/api/v1/admin/events?search=Perf&limit=20").set("Authorization", `Bearer ${admin.body.accessToken}`).expect(200));
    await timed("admin_users_search", () => http().get(`/api/v1/admin/users?search=${prefix}user&limit=20`).set("Authorization", `Bearer ${admin.body.accessToken}`).expect(200));
    expect(timings["admin_events_search"]).toBeLessThan(5000);
    expect(timings["admin_users_search"]).toBeLessThan(5000);

    await prisma.user.delete({ where: { id: admin.body.user.id } }).catch(() => undefined);
  });
});
