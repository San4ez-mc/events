import type { INestApplication } from "@nestjs/common";
import { PrismaService } from "../../src/prisma/prisma.service";
import { bootstrapApp, cleanupQaData, grantPro, http, newUser } from "./qa-helpers";

jest.setTimeout(120_000); // this shared local Postgres/embedded env runs several QA auditors concurrently; the default 30s per-test timeout is too tight under that contention (see docs/qa/QA_events.md).

/** QA acceptance section 26 — Recurring events. */
describe("QA §26 — recurring events (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let categoryId: string;
  let cityId: string;

  beforeAll(async () => {
    const boot = await bootstrapApp();
    app = boot.app;
    prisma = boot.prisma;
    categoryId = (await prisma.category.findUniqueOrThrow({ where: { slug: "sport" } })).id;
    cityId = (await prisma.city.findUniqueOrThrow({ where: { slug: "kyiv" } })).id;
  });

  afterAll(async () => {
    await cleanupQaData(prisma);
    await app.close();
  });

  /** Draft event with the fields createSeries/publish both need, NOT yet published. */
  async function draftTemplate(startsAt: Date): Promise<{ token: string; eventId: string }> {
    const owner = await newUser(app, "recur");
    await grantPro(prisma, owner.id); // recurring events are a PRO-tier perk
    await http(app).post("/api/v1/credits/claim-free").set("Authorization", `Bearer ${owner.token}`);
    const created = await http(app)
      .post("/api/v1/events")
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ title: "Recurring QA Template" })
      .expect(201);
    await http(app)
      .patch(`/api/v1/events/${created.body.id}`)
      .set("Authorization", `Bearer ${owner.token}`)
      .send({
        description: "Recurring QA description.",
        categoryId,
        cityId,
        startsAt: startsAt.toISOString(),
      })
      .expect(200);
    return { token: owner.token, eventId: created.body.id as string };
  }

  it("DAILY: 5 occurrences, one calendar day apart, each independently publishable/registerable", async () => {
    const start = new Date(Date.now() + 10 * 86_400_000);
    const { token, eventId } = await draftTemplate(start);

    const res = await http(app)
      .post(`/api/v1/events/${eventId}/series`)
      .set("Authorization", `Bearer ${token}`)
      .send({ recurrenceType: "DAILY", count: 5 })
      .expect(201);

    expect(res.body.occurrences).toHaveLength(5);
    const dates = res.body.occurrences.map((o: { startsAt: string }) => new Date(o.startsAt).getTime());
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i] - dates[i - 1]).toBe(24 * 60 * 60 * 1000);
    }

    // Each occurrence is a fully independent Event: publish all 5 (uses the 5 free credits) and register separately.
    for (const occ of res.body.occurrences) {
      await http(app).post(`/api/v1/events/${occ.id}/publish`).set("Authorization", `Bearer ${token}`).expect(201);
    }

    const attendee = await newUser(app, "recur-attendee");
    const secondOccurrenceId = res.body.occurrences[1].id;
    await http(app)
      .post(`/api/v1/events/${secondOccurrenceId}/registrations`)
      .set("Authorization", `Bearer ${attendee.token}`)
      .send({})
      .expect(201);

    // §26 — each occurrence has its OWN registration count; registering for one doesn't touch the others.
    const firstCount = await prisma.registration.count({ where: { eventId: res.body.occurrences[0].id } });
    const secondCount = await prisma.registration.count({ where: { eventId: secondOccurrenceId } });
    const thirdCount = await prisma.registration.count({ where: { eventId: res.body.occurrences[2].id } });
    expect(firstCount).toBe(0);
    expect(secondCount).toBe(1);
    expect(thirdCount).toBe(0);
  }, 120_000);

  it("EVERY_N_DAYS (interval=2): occurrences are exactly 2 days apart", async () => {
    const start = new Date(Date.now() + 10 * 86_400_000);
    const { token, eventId } = await draftTemplate(start);
    const res = await http(app)
      .post(`/api/v1/events/${eventId}/series`)
      .set("Authorization", `Bearer ${token}`)
      .send({ recurrenceType: "EVERY_N_DAYS", interval: 2, count: 4 })
      .expect(201);
    const dates = res.body.occurrences.map((o: { startsAt: string }) => new Date(o.startsAt).getTime());
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i] - dates[i - 1]).toBe(2 * 24 * 60 * 60 * 1000);
    }
  });

  it("WEEKLY (i.e. every 7 days): occurrences are exactly 7 days apart", async () => {
    const start = new Date(Date.now() + 10 * 86_400_000);
    const { token, eventId } = await draftTemplate(start);
    const res = await http(app)
      .post(`/api/v1/events/${eventId}/series`)
      .set("Authorization", `Bearer ${token}`)
      .send({ recurrenceType: "WEEKLY", count: 3 })
      .expect(201);
    const dates = res.body.occurrences.map((o: { startsAt: string }) => new Date(o.startsAt).getTime());
    expect(dates[1] - dates[0]).toBe(7 * 24 * 60 * 60 * 1000);
    expect(dates[2] - dates[1]).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it("SPECIFIC_DAY_OF_MONTH ('every 10th'): preserves the same day-of-month across occurrences", async () => {
    const start = new Date(Date.UTC(new Date().getUTCFullYear() + 1, 2, 10, 12, 0, 0)); // the 10th of a future month
    const { token, eventId } = await draftTemplate(start);
    const res = await http(app)
      .post(`/api/v1/events/${eventId}/series`)
      .set("Authorization", `Bearer ${token}`)
      .send({ recurrenceType: "SPECIFIC_DAY_OF_MONTH", count: 3 })
      .expect(201);
    const days = res.body.occurrences.map((o: { startsAt: string }) => new Date(o.startsAt).getUTCDate());
    expect(days.every((d: number) => d === 10)).toBe(true);
  });

  it("a recurrence count above the hard safety cap of 52 is rejected by validation before any occurrence is created", async () => {
    const start = new Date(Date.now() + 10 * 86_400_000);
    const { token, eventId } = await draftTemplate(start);
    const res = await http(app)
      .post(`/api/v1/events/${eventId}/series`)
      .set("Authorization", `Bearer ${token}`)
      .send({ recurrenceType: "DAILY", count: 60 })
      .expect(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("cancelling ONE occurrence does not cancel the others in the series", async () => {
    const start = new Date(Date.now() + 10 * 86_400_000);
    const { token, eventId } = await draftTemplate(start);
    const res = await http(app)
      .post(`/api/v1/events/${eventId}/series`)
      .set("Authorization", `Bearer ${token}`)
      .send({ recurrenceType: "DAILY", count: 3 })
      .expect(201);
    const [occ1, occ2, occ3] = res.body.occurrences;

    for (const occ of [occ1, occ2, occ3]) {
      await http(app).post(`/api/v1/events/${occ.id}/publish`).set("Authorization", `Bearer ${token}`).expect(201);
    }

    await http(app)
      .post(`/api/v1/events/${occ2.id}/cancel`)
      .set("Authorization", `Bearer ${token}`)
      .send({ reason: "This specific date doesn't work" })
      .expect(201);

    const statuses = await prisma.event.findMany({
      where: { id: { in: [occ1.id, occ2.id, occ3.id] } },
      select: { id: true, status: true },
    });
    const byId = new Map(statuses.map((s) => [s.id, s.status]));
    expect(byId.get(occ1.id)).toBe("PUBLISHED");
    expect(byId.get(occ2.id)).toBe("CANCELLED");
    expect(byId.get(occ3.id)).toBe("PUBLISHED");
  }, 120_000);

  it("statistics stay per-occurrence and correct after a mix of registrations across the series", async () => {
    const start = new Date(Date.now() + 10 * 86_400_000);
    const { token, eventId } = await draftTemplate(start);
    const res = await http(app)
      .post(`/api/v1/events/${eventId}/series`)
      .set("Authorization", `Bearer ${token}`)
      .send({ recurrenceType: "DAILY", count: 3 })
      .expect(201);
    const [occ1, occ2] = res.body.occurrences;
    for (const occ of res.body.occurrences) {
      await http(app).post(`/api/v1/events/${occ.id}/publish`).set("Authorization", `Bearer ${token}`).expect(201);
    }

    const a = await newUser(app, "series-stat-a");
    const b = await newUser(app, "series-stat-b");
    await http(app).post(`/api/v1/events/${occ1.id}/registrations`).set("Authorization", `Bearer ${a.token}`).send({}).expect(201);
    await http(app).post(`/api/v1/events/${occ1.id}/registrations`).set("Authorization", `Bearer ${b.token}`).send({}).expect(201);

    const stats1 = await http(app).get(`/api/v1/events/${occ1.id}/stats`).set("Authorization", `Bearer ${token}`).expect(200);
    const stats2 = await http(app).get(`/api/v1/events/${occ2.id}/stats`).set("Authorization", `Bearer ${token}`).expect(200);
    expect(stats1.body.registrations).toBe(2);
    expect(stats2.body.registrations).toBe(0);
  }, 120_000);
});
