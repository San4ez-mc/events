import { ConfigService } from "@nestjs/config";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/bootstrap";
import { PrismaService } from "../src/prisma/prisma.service";
import type { EnvConfig } from "../src/config/env.validation";

/** §25-28, §78-79, §115 Phase 4: the full attendee <-> organizer registration flow. */
describe("Registrations (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const testEmailPrefix = "e2e-registrations-";
  let sportCategoryId: string;
  let kyivCityId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app, app.get(ConfigService<EnvConfig, true>));
    await app.init();
    prisma = app.get(PrismaService);

    sportCategoryId = (await prisma.category.findUniqueOrThrow({ where: { slug: "sport" } })).id;
    kyivCityId = (await prisma.city.findUniqueOrThrow({ where: { slug: "kyiv" } })).id;
  });

  afterAll(async () => {
    await prisma.registrationAnswer.deleteMany({ where: { field: { event: { owner: { email: { startsWith: testEmailPrefix } } } } } });
    await prisma.registration.deleteMany({ where: { event: { owner: { email: { startsWith: testEmailPrefix } } } } });
    await prisma.registrationField.deleteMany({ where: { event: { owner: { email: { startsWith: testEmailPrefix } } } } });
    await prisma.listingCreditLedger.deleteMany({ where: { user: { email: { startsWith: testEmailPrefix } } } });
    await prisma.event.deleteMany({ where: { owner: { email: { startsWith: testEmailPrefix } } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: testEmailPrefix } } });
    await app.close();
  });

  async function registerUser(namePrefix = "Attendee"): Promise<{ token: string; userId: string }> {
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

  async function createPublishedEvent(
    overrides: {
      approvalMode?: "AUTO" | "ORGANIZER_APPROVAL";
      priceType?: "FREE" | "PAID";
      price?: number;
      capacity?: number;
    } = {},
  ): Promise<{ eventId: string; organizerToken: string }> {
    const { token } = await registerUser("Organizer");
    await request(app.getHttpServer()).post("/api/v1/credits/claim-free").set("Authorization", `Bearer ${token}`);

    const created = await request(app.getHttpServer())
      .post("/api/v1/events")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Registration Fixture Event" })
      .expect(201);
    const eventId = created.body.id;

    await request(app.getHttpServer())
      .patch(`/api/v1/events/${eventId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        description: "A perfectly normal description.",
        categoryId: sportCategoryId,
        cityId: kyivCityId,
        startsAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
        approvalMode: overrides.approvalMode ?? "AUTO",
        priceType: overrides.priceType ?? "FREE",
        price: overrides.priceType === "PAID" ? (overrides.price ?? 200) : undefined,
        paymentUrl: overrides.priceType === "PAID" ? "https://example.com/pay" : undefined,
        capacity: overrides.capacity,
      })
      .expect(200);

    await request(app.getHttpServer())
      .post(`/api/v1/events/${eventId}/publish`)
      .set("Authorization", `Bearer ${token}`)
      .expect(201);

    return { eventId, organizerToken: token };
  }

  it("free + AUTO: registers immediately as REGISTERED", async () => {
    const { eventId } = await createPublishedEvent();
    const attendee = await registerUser();

    const res = await request(app.getHttpServer())
      .post(`/api/v1/events/${eventId}/registrations`)
      .set("Authorization", `Bearer ${attendee.token}`)
      .send({})
      .expect(201);
    expect(res.body.status).toBe("REGISTERED");
  });

  it("free + ORGANIZER_APPROVAL: PENDING, then organizer approve -> REGISTERED", async () => {
    const { eventId, organizerToken } = await createPublishedEvent({ approvalMode: "ORGANIZER_APPROVAL" });
    const attendee = await registerUser();

    const created = await request(app.getHttpServer())
      .post(`/api/v1/events/${eventId}/registrations`)
      .set("Authorization", `Bearer ${attendee.token}`)
      .send({})
      .expect(201);
    expect(created.body.status).toBe("PENDING");

    const approved = await request(app.getHttpServer())
      .patch(`/api/v1/events/${eventId}/registrations/${created.body.id}/approve`)
      .set("Authorization", `Bearer ${organizerToken}`)
      .expect(200);
    expect(approved.body.status).toBe("REGISTERED");
    expect(approved.body.approvedAt).toEqual(expect.any(String));
  });

  it("free + ORGANIZER_APPROVAL: organizer can reject a pending registration", async () => {
    const { eventId, organizerToken } = await createPublishedEvent({ approvalMode: "ORGANIZER_APPROVAL" });
    const attendee = await registerUser();

    const created = await request(app.getHttpServer())
      .post(`/api/v1/events/${eventId}/registrations`)
      .set("Authorization", `Bearer ${attendee.token}`)
      .send({})
      .expect(201);

    const rejected = await request(app.getHttpServer())
      .patch(`/api/v1/events/${eventId}/registrations/${created.body.id}/reject`)
      .set("Authorization", `Bearer ${organizerToken}`)
      .send({ note: "Not eligible" })
      .expect(200);
    expect(rejected.body.status).toBe("REJECTED");
  });

  it("paid + AUTO: REGISTERED -> mark-paid -> PAYMENT_PENDING -> organizer confirm -> CONFIRMED", async () => {
    const { eventId, organizerToken } = await createPublishedEvent({ priceType: "PAID", price: 300 });
    const attendee = await registerUser();

    const created = await request(app.getHttpServer())
      .post(`/api/v1/events/${eventId}/registrations`)
      .set("Authorization", `Bearer ${attendee.token}`)
      .send({})
      .expect(201);
    expect(created.body.status).toBe("REGISTERED");

    const paid = await request(app.getHttpServer())
      .patch(`/api/v1/registrations/${created.body.id}/mark-paid`)
      .set("Authorization", `Bearer ${attendee.token}`)
      .expect(200);
    expect(paid.body.status).toBe("PAYMENT_PENDING");
    expect(paid.body.paymentClickedAt).toEqual(expect.any(String));

    const confirmed = await request(app.getHttpServer())
      .patch(`/api/v1/events/${eventId}/registrations/${created.body.id}/confirm-payment`)
      .set("Authorization", `Bearer ${organizerToken}`)
      .expect(200);
    expect(confirmed.body.status).toBe("CONFIRMED");
    expect(confirmed.body.paymentConfirmedAt).toEqual(expect.any(String));
  });

  it("prevents double-registration while a registration is still active (§27)", async () => {
    const { eventId } = await createPublishedEvent();
    const attendee = await registerUser();

    await request(app.getHttpServer())
      .post(`/api/v1/events/${eventId}/registrations`)
      .set("Authorization", `Bearer ${attendee.token}`)
      .send({})
      .expect(201);

    const res = await request(app.getHttpServer())
      .post(`/api/v1/events/${eventId}/registrations`)
      .set("Authorization", `Bearer ${attendee.token}`)
      .send({})
      .expect(409);
    expect(res.body.error.code).toBe("ALREADY_REGISTERED");
  });

  it("cancelling then re-registering works (a cancelled registration isn't a permanent block)", async () => {
    const { eventId } = await createPublishedEvent();
    const attendee = await registerUser();

    const created = await request(app.getHttpServer())
      .post(`/api/v1/events/${eventId}/registrations`)
      .set("Authorization", `Bearer ${attendee.token}`)
      .send({})
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/api/v1/registrations/${created.body.id}/cancel`)
      .set("Authorization", `Bearer ${attendee.token}`)
      .expect(200);

    const again = await request(app.getHttpServer())
      .post(`/api/v1/events/${eventId}/registrations`)
      .set("Authorization", `Bearer ${attendee.token}`)
      .send({})
      .expect(201);
    expect(again.body.status).toBe("REGISTERED");
  });

  it("capacity + waitlist: full events reject without joinWaitlist, accept with it, and promote on cancel (UX §16)", async () => {
    const { eventId } = await createPublishedEvent({ capacity: 1 });
    const first = await registerUser();
    const second = await registerUser();

    await request(app.getHttpServer())
      .post(`/api/v1/events/${eventId}/registrations`)
      .set("Authorization", `Bearer ${first.token}`)
      .send({})
      .expect(201);

    const rejected = await request(app.getHttpServer())
      .post(`/api/v1/events/${eventId}/registrations`)
      .set("Authorization", `Bearer ${second.token}`)
      .send({})
      .expect(409);
    expect(rejected.body.error.code).toBe("EVENT_CAPACITY_REACHED");

    const waitlisted = await request(app.getHttpServer())
      .post(`/api/v1/events/${eventId}/registrations`)
      .set("Authorization", `Bearer ${second.token}`)
      .send({ joinWaitlist: true })
      .expect(201);
    expect(waitlisted.body.status).toBe("WAITLISTED");

    const firstRegistration = await prisma.registration.findFirstOrThrow({
      where: { eventId, userId: first.userId },
    });
    await request(app.getHttpServer())
      .patch(`/api/v1/registrations/${firstRegistration.id}/cancel`)
      .set("Authorization", `Bearer ${first.token}`)
      .expect(200);

    const promoted = await prisma.registration.findFirstOrThrow({
      where: { eventId, userId: second.userId },
    });
    expect(promoted.status).toBe("REGISTERED");
  });

  it("validates required custom registration fields (§25/§28)", async () => {
    const { eventId, organizerToken } = await createPublishedEvent();
    const attendee = await registerUser();

    const fields = await request(app.getHttpServer())
      .put(`/api/v1/events/${eventId}/registrations/fields`)
      .set("Authorization", `Bearer ${organizerToken}`)
      .send({
        fields: [
          { label: "Your skill level?", type: "SELECT", required: true, options: ["Beginner", "Advanced"], sortOrder: 0 },
        ],
      })
      .expect(200);
    const fieldId = fields.body[0].id;

    const missing = await request(app.getHttpServer())
      .post(`/api/v1/events/${eventId}/registrations`)
      .set("Authorization", `Bearer ${attendee.token}`)
      .send({})
      .expect(400);
    expect(missing.body.error.code).toBe("VALIDATION_ERROR");

    const ok = await request(app.getHttpServer())
      .post(`/api/v1/events/${eventId}/registrations`)
      .set("Authorization", `Bearer ${attendee.token}`)
      .send({ answers: [{ fieldId, value: "Beginner" }] })
      .expect(201);
    expect(ok.body.answers).toHaveLength(1);
    expect(ok.body.answers[0].valueJson).toBe("Beginner");
  });

  it("GET /events/:id/registrations/me returns the caller's own registration for that event, or null", async () => {
    const { eventId } = await createPublishedEvent();
    const attendee = await registerUser();

    const before = await request(app.getHttpServer())
      .get(`/api/v1/events/${eventId}/registrations/me`)
      .set("Authorization", `Bearer ${attendee.token}`)
      .expect(200);
    expect(before.body.registration).toBeNull();

    await request(app.getHttpServer())
      .post(`/api/v1/events/${eventId}/registrations`)
      .set("Authorization", `Bearer ${attendee.token}`)
      .send({})
      .expect(201);

    const after = await request(app.getHttpServer())
      .get(`/api/v1/events/${eventId}/registrations/me`)
      .set("Authorization", `Bearer ${attendee.token}`)
      .expect(200);
    expect(after.body.registration.status).toBe("REGISTERED");
  });

  it("GET /registrations/mine lists the caller's own registrations with the event nested", async () => {
    const { eventId } = await createPublishedEvent();
    const attendee = await registerUser();

    await request(app.getHttpServer())
      .post(`/api/v1/events/${eventId}/registrations`)
      .set("Authorization", `Bearer ${attendee.token}`)
      .send({})
      .expect(201);

    const mine = await request(app.getHttpServer())
      .get("/api/v1/registrations/mine")
      .set("Authorization", `Bearer ${attendee.token}`)
      .expect(200);
    expect(mine.body.items.some((r: { eventId: string }) => r.eventId === eventId)).toBe(true);
    expect(mine.body.items[0].event).toBeDefined();
  });

  it("only the organizer can list an event's registrations", async () => {
    const { eventId } = await createPublishedEvent();
    const stranger = await registerUser();

    await request(app.getHttpServer())
      .get(`/api/v1/events/${eventId}/registrations`)
      .set("Authorization", `Bearer ${stranger.token}`)
      .expect(403);
  });

  it("rejects registering to an unpublished/cancelled event (§79)", async () => {
    const { token: organizerToken } = await registerUser("DraftOwner");
    const created = await request(app.getHttpServer())
      .post("/api/v1/events")
      .set("Authorization", `Bearer ${organizerToken}`)
      .send({ title: "Unpublished Draft" })
      .expect(201);
    const attendee = await registerUser();

    const res = await request(app.getHttpServer())
      .post(`/api/v1/events/${created.body.id}/registrations`)
      .set("Authorization", `Bearer ${attendee.token}`)
      .send({})
      .expect(400);
    expect(res.body.error.code).toBe("REGISTRATION_CLOSED");
  });

  it("POST /events/:id/cancel stops new registrations (§79)", async () => {
    const { eventId, organizerToken } = await createPublishedEvent();
    const attendee = await registerUser();

    const cancelled = await request(app.getHttpServer())
      .post(`/api/v1/events/${eventId}/cancel`)
      .set("Authorization", `Bearer ${organizerToken}`)
      .send({ reason: "Venue unavailable" })
      .expect(201);
    expect(cancelled.body.status).toBe("CANCELLED");
    expect(cancelled.body.cancellationReason).toBe("Venue unavailable");

    const res = await request(app.getHttpServer())
      .post(`/api/v1/events/${eventId}/registrations`)
      .set("Authorization", `Bearer ${attendee.token}`)
      .send({})
      .expect(400);
    expect(res.body.error.code).toBe("REGISTRATION_CLOSED");
  });
});
