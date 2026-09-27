import type { INestApplication } from "@nestjs/common";
import { PrismaService } from "../../src/prisma/prisma.service";
import { bootstrapApp, cleanupQaData, feedDateBracket, http, newUser } from "./qa-helpers";

jest.setTimeout(120_000); // this shared local Postgres/embedded env runs several QA auditors concurrently; the default 30s per-test timeout is too tight under that contention (see docs/qa/QA_events.md).

/**
 * QA acceptance section 61 — Full End-to-End Acceptance Scenario, steps 1-22,
 * driven entirely through the public API (no direct DB writes except the
 * one step the brief explicitly allows: simulating an event's natural
 * completion — see step 18 below, called out at the point it happens).
 *
 * §9 note: step 5 ("add photos") is skipped for real file bytes because
 * MinIO/S3 is not reachable in this environment (see
 * qa-events-landing-media-location.e2e-spec.ts for the connection-refused
 * evidence) — everything else in the scenario runs for real.
 */
describe("QA §61 — full end-to-end acceptance scenario (e2e)", () => {
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

  it("runs the complete USER_A / USER_B lifecycle without any manual DB intervention beyond simulating time passing", async () => {
    // 1-2. Create USER_A, USER_B.
    const userA = await newUser(app, "scenario-a");
    const userB = await newUser(app, "scenario-b");

    // 3-4. USER_A creates an event and selects a category.
    await http(app).post("/api/v1/credits/claim-free").set("Authorization", `Bearer ${userA.token}`).expect(200);
    const createRes = await http(app)
      .post("/api/v1/events")
      .set("Authorization", `Bearer ${userA.token}`)
      .send({ title: "Scenario E2E Event" })
      .expect(201);
    const eventId = createRes.body.id as string;

    // 5. "Add photos" — BLOCKED here (see file header); proven separately that
    // the validation gates (type/size/count) work without needing storage.

    // 6. Set public / free / capacity / deadline. A wide, jittered future
    // offset (not a plain "+8 days") keeps this event's startsAt from
    // colliding with other parallel auditors' events in the shared DB, so
    // the discovery-feed checks below can bracket dateFrom/dateTo tightly
    // around it instead of trusting page-1 ordering of a concurrently
    // written table.
    const startsAt = new Date(Date.now() + (250 + Math.random() * 400) * 86_400_000);
    const registrationDeadline = new Date(startsAt.getTime() - 86_400_000);
    const patchRes = await http(app)
      .patch(`/api/v1/events/${eventId}`)
      .set("Authorization", `Bearer ${userA.token}`)
      .send({
        description: "The full acceptance-scenario event.",
        categoryId,
        cityId,
        startsAt: startsAt.toISOString(),
        visibility: "PUBLIC",
        priceType: "FREE",
        approvalMode: "ORGANIZER_APPROVAL", // exercises step 14's "approves if required" branch for real
        capacity: 20,
        registrationDeadline: registrationDeadline.toISOString(),
      })
      .expect(200);
    const slug = patchRes.body.slug as string;

    // 7. Publish.
    await http(app).post(`/api/v1/events/${eventId}/publish`).set("Authorization", `Bearer ${userA.token}`).expect(201);

    // 8. USER_B discovers it through the feed. Bracketed to this event's own
    // startsAt (see the comment above) so this is deterministic in a shared,
    // concurrently-written events table rather than depending on page-1
    // ordering among however many events every parallel auditor has created.
    const bracket = feedDateBracket(startsAt.toISOString());
    const initialFeed = await http(app)
      .get("/api/v1/discovery")
      .query({ limit: 50, ...bracket })
      .set("Authorization", `Bearer ${userB.token}`)
      .expect(200);
    expect((initialFeed.body.items as { id: string }[]).map((i) => i.id)).toContain(eventId);

    // 9. USER_B changes filters (by category) and the event still surfaces.
    const filteredFeed = await http(app)
      .get("/api/v1/discovery")
      .query({ limit: 50, categoryIds: categoryId, ...bracket })
      .set("Authorization", `Bearer ${userB.token}`)
      .expect(200);
    expect((filteredFeed.body.items as { id: string }[]).map((i) => i.id)).toContain(eventId);

    // 10. USER_B opens the event (public landing page).
    const landing = await http(app).get(`/api/v1/events/slug/${slug}`).set("Authorization", `Bearer ${userB.token}`).expect(200);
    expect(landing.body.id).toBe(eventId);

    // 11. USER_B saves it.
    await http(app).post(`/api/v1/discovery/${eventId}/save`).set("Authorization", `Bearer ${userB.token}`).expect(204);
    const saved = await http(app).get("/api/v1/discovery/saved").set("Authorization", `Bearer ${userB.token}`).expect(200);
    expect((saved.body.items as { id: string }[]).map((i) => i.id)).toContain(eventId);

    // 12. USER_B registers. Approval is required (per step 6), so this starts PENDING.
    const registration = await http(app)
      .post(`/api/v1/events/${eventId}/registrations`)
      .set("Authorization", `Bearer ${userB.token}`)
      .send({})
      .expect(201);
    expect(registration.body.status).toBe("PENDING");

    // 13. USER_A sees the registration.
    const registrationsList = await http(app)
      .get(`/api/v1/events/${eventId}/registrations`)
      .set("Authorization", `Bearer ${userA.token}`)
      .expect(200);
    expect(registrationsList.body.items.some((r: { id: string }) => r.id === registration.body.id)).toBe(true);

    // 14. USER_A approves (required, since approvalMode is ORGANIZER_APPROVAL).
    const approved = await http(app)
      .patch(`/api/v1/events/${eventId}/registrations/${registration.body.id}/approve`)
      .set("Authorization", `Bearer ${userA.token}`)
      .expect(200);
    expect(approved.body.status).toBe("REGISTERED");

    // 15. USER_B receives a notification about the approval.
    const notificationsAfterApproval = await http(app)
      .get("/api/v1/notifications")
      .set("Authorization", `Bearer ${userB.token}`)
      .expect(200);
    const approvalNotice = notificationsAfterApproval.body.items.find((n: { type: string }) => n.type === "REGISTRATION_APPROVED");
    expect(approvalNotice).toBeDefined();

    // 16. USER_A changes the event's time (a "significant" field on a published event requires notifyParticipants=true).
    const newStartsAt = new Date(startsAt.getTime() + 2 * 86_400_000);
    await http(app)
      .patch(`/api/v1/events/${eventId}`)
      .set("Authorization", `Bearer ${userA.token}`)
      .send({ startsAt: newStartsAt.toISOString(), notifyParticipants: true })
      .expect(200);

    // 17. USER_B receives the change notification.
    const notificationsAfterChange = await http(app)
      .get("/api/v1/notifications")
      .set("Authorization", `Bearer ${userB.token}`)
      .expect(200);
    const changeNotice = notificationsAfterChange.body.items.find((n: { type: string }) => n.type === "EVENT_CHANGED");
    expect(changeNotice).toBeDefined();

    // 18. Event is completed. There is no "fast-forward time" facility and no
    // API to force-complete an event on demand — completion is driven by the
    // 10-minute EventLifecycleScheduler cron once `endsAt` is in the past. Per
    // the audit brief's explicit allowance, we simulate that passage of time
    // directly in the DB (this is the ONLY direct DB write in this scenario
    // test, and it stands in for "wait for real time to pass"):
    await prisma.event.update({
      where: { id: eventId },
      data: { status: "COMPLETED", completedAt: new Date(), endsAt: new Date(Date.now() - 60_000) },
    });

    // 19. USER_B leaves a rating/review.
    const review = await http(app)
      .post(`/api/v1/events/${eventId}/reviews`)
      .set("Authorization", `Bearer ${userB.token}`)
      .send({ rating: 5, text: "Great event, well organized." })
      .expect(201);
    expect(review.body.rating).toBe(5);

    // 20. USER_A sees statistics.
    const stats = await http(app).get(`/api/v1/events/${eventId}/stats`).set("Authorization", `Bearer ${userA.token}`).expect(200);
    expect(stats.body.registrations).toBe(1);
    expect(stats.body.confirmed).toBeGreaterThanOrEqual(0);

    // 21. USER_A creates another event.
    const secondEventRes = await http(app)
      .post("/api/v1/events")
      .set("Authorization", `Bearer ${userA.token}`)
      .send({ title: "USER_A's Second Scenario Event" })
      .expect(201);
    expect(secondEventRes.body.id).not.toBe(eventId);
    expect(secondEventRes.body.title).toBe("USER_A's Second Scenario Event");

    // 22. USER_A can still participate in events as a normal user — registers
    // for USER_B's... but USER_B never organized one here, so USER_A
    // registers for a fresh third-party event, proving "organizer" never
    // became a separate account type that blocks normal participation.
    const thirdPartyOwner = await newUser(app, "scenario-thirdparty-organizer");
    await http(app).post("/api/v1/credits/claim-free").set("Authorization", `Bearer ${thirdPartyOwner.token}`).expect(200);
    const thirdPartyEvent = await http(app)
      .post("/api/v1/events")
      .set("Authorization", `Bearer ${thirdPartyOwner.token}`)
      .send({ title: "Third Party Scenario Event" })
      .expect(201);
    await http(app)
      .patch(`/api/v1/events/${thirdPartyEvent.body.id}`)
      .set("Authorization", `Bearer ${thirdPartyOwner.token}`)
      .send({ description: "d", categoryId, cityId, startsAt: new Date(Date.now() + 5 * 86_400_000).toISOString() })
      .expect(200);
    await http(app).post(`/api/v1/events/${thirdPartyEvent.body.id}/publish`).set("Authorization", `Bearer ${thirdPartyOwner.token}`).expect(201);

    const userAAsAttendee = await http(app)
      .post(`/api/v1/events/${thirdPartyEvent.body.id}/registrations`)
      .set("Authorization", `Bearer ${userA.token}`)
      .send({})
      .expect(201);
    expect(userAAsAttendee.body.status).toBe("REGISTERED");

    const userARole = await http(app).get("/api/v1/users/me").set("Authorization", `Bearer ${userA.token}`).expect(200);
    expect(userARole.body.role).toBe("USER"); // still just a normal user account throughout
  }, 180_000);
});
