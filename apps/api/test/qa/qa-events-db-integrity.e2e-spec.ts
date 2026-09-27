import type { INestApplication } from "@nestjs/common";
import { PrismaService } from "../../src/prisma/prisma.service";
import { bootstrapApp, cleanupQaData, createPublishedEvent, http, newUser } from "./qa-helpers";

jest.setTimeout(120_000); // this shared local Postgres/embedded env runs several QA auditors concurrently; the default 30s per-test timeout is too tight under that contention (see docs/qa/QA_events.md).

/**
 * QA acceptance section 53 — Database Integrity.
 *
 * These are read-only raw-SQL checks against the WHOLE database (not just
 * this file's own rows) for orphans/FK violations, plus one live cascade
 * test scoped to data this file created and cleans up itself. Per the
 * audit brief this is meant to run "after the full suite" — in practice
 * that means: after this whole qa-events-*.e2e-spec.ts group, since other
 * parallel auditors use disjoint email prefixes and this file never
 * deletes anything outside qa-ev-.
 */
describe("QA §53 — database integrity (e2e)", () => {
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

  it("no Registration row points at a non-existent Event or User (whole DB)", async () => {
    const orphanEvent = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT count(*)::bigint AS count FROM event_registrations r
      LEFT JOIN events e ON e.id = r."eventId"
      WHERE e.id IS NULL`;
    const orphanUser = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT count(*)::bigint AS count FROM event_registrations r
      LEFT JOIN users u ON u.id = r."userId"
      WHERE u.id IS NULL`;
    expect(Number(orphanEvent[0]!.count)).toBe(0);
    expect(Number(orphanUser[0]!.count)).toBe(0);
  });

  it("no RegistrationAnswer row points at a non-existent Registration or RegistrationField (whole DB)", async () => {
    const orphanReg = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT count(*)::bigint AS count FROM event_registration_answers a
      LEFT JOIN event_registrations r ON r.id = a."registrationId"
      WHERE r.id IS NULL`;
    const orphanField = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT count(*)::bigint AS count FROM event_registration_answers a
      LEFT JOIN event_registration_fields f ON f.id = a."fieldId"
      WHERE f.id IS NULL`;
    expect(Number(orphanReg[0]!.count)).toBe(0);
    expect(Number(orphanField[0]!.count)).toBe(0);
  });

  it("no EventMedia / EventCollaborator / EventInvitation / EventFaqItem / EventPriceOption / RegistrationField row points at a non-existent Event (whole DB)", async () => {
    const tables = [
      "event_media",
      "event_collaborators",
      "event_invitations",
      "event_faq_items",
      "event_price_options",
      "event_registration_fields",
    ];
    for (const table of tables) {
      const rows = await prisma.$queryRawUnsafe<{ count: bigint }[]>(`
        SELECT count(*)::bigint AS count FROM ${table} t
        LEFT JOIN events e ON e.id = t."eventId"
        WHERE e.id IS NULL`);
      expect(Number(rows[0]!.count)).toBe(0);
    }
  });

  it("no duplicate (eventId, userId) Registration rows exist for the same event+user (unique constraint is actually enforced)", async () => {
    const dupes = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT count(*)::bigint AS count FROM (
        SELECT "eventId", "userId" FROM event_registrations GROUP BY "eventId", "userId" HAVING count(*) > 1
      ) d`;
    expect(Number(dupes[0]!.count)).toBe(0);
  });

  it("no event's active-registration count exceeds its own capacity (whole DB, business-level invariant beyond any FK)", async () => {
    const violations = await prisma.$queryRaw<{ id: string; capacity: number; active_count: bigint }[]>`
      SELECT e.id, e.capacity, count(r.id)::bigint AS active_count
      FROM events e
      JOIN event_registrations r ON r."eventId" = e.id AND r.status IN ('PENDING', 'REGISTERED', 'PAYMENT_PENDING', 'CONFIRMED')
      WHERE e.capacity IS NOT NULL
      GROUP BY e.id, e.capacity
      HAVING count(r.id) > e.capacity`;
    expect(violations).toEqual([]);
  });

  it("no event has a negative price or a non-positive capacity/minParticipants stored (whole DB — validation should have prevented this at write time)", async () => {
    const badPrice = await prisma.$queryRaw<{ count: bigint }[]>`SELECT count(*)::bigint AS count FROM events WHERE price < 0`;
    const badCapacity = await prisma.$queryRaw<{ count: bigint }[]>`SELECT count(*)::bigint AS count FROM events WHERE capacity IS NOT NULL AND capacity <= 0`;
    const badMinParticipants = await prisma.$queryRaw<{ count: bigint }[]>`SELECT count(*)::bigint AS count FROM events WHERE "minParticipants" IS NOT NULL AND "minParticipants" <= 0`;
    expect(Number(badPrice[0]!.count)).toBe(0);
    expect(Number(badCapacity[0]!.count)).toBe(0);
    expect(Number(badMinParticipants[0]!.count)).toBe(0);
  });

  it("deleting an Event cascades to its media, registrations (+ their answers), collaborators, invitations, FAQ items, and price options — no orphans left behind", async () => {
    const { eventId, organizerToken } = await createPublishedEvent(app, categoryId, cityId, { title: "Cascade Probe QA Event" });
    const attendee = await newUser(app, "cascade-attendee");
    const collaborator = await newUser(app, "cascade-collab");
    const invitee = await newUser(app, "cascade-invitee");

    await http(app)
      .put(`/api/v1/events/${eventId}/registrations/fields`)
      .set("Authorization", `Bearer ${organizerToken}`)
      .send({ fields: [{ label: "Notes", type: "TEXT", required: false, sortOrder: 0 }] })
      .expect(200);
    const fieldsRes = await http(app).get(`/api/v1/events/${eventId}`).set("Authorization", `Bearer ${organizerToken}`).expect(200);
    const fieldId = fieldsRes.body.registrationFields[0].id;
    const reg = await http(app)
      .post(`/api/v1/events/${eventId}/registrations`)
      .set("Authorization", `Bearer ${attendee.token}`)
      .send({ answers: [{ fieldId, value: "hi" }] })
      .expect(201);

    await http(app)
      .post(`/api/v1/events/${eventId}/collaborators`)
      .set("Authorization", `Bearer ${organizerToken}`)
      .send({ userId: collaborator.id, permissions: ["EDIT_EVENT"] })
      .expect(201);
    await http(app)
      .put(`/api/v1/events/${eventId}/faq`)
      .set("Authorization", `Bearer ${organizerToken}`)
      .send({ items: [{ question: "Q", answer: "A" }] })
      .expect(200);
    await http(app)
      .put(`/api/v1/events/${eventId}/price-options`)
      .set("Authorization", `Bearer ${organizerToken}`)
      .send({ items: [{ name: "Tier", price: 10 }] })
      .expect(200);
    await prisma.eventMedia.create({
      data: { eventId, type: "IMAGE", originalUrl: "https://example.com/x.jpg", displayUrl: "https://example.com/x.jpg", thumbnailUrl: "https://example.com/x.jpg", sortOrder: 0 },
    });
    await prisma.eventInvitation.create({ data: { eventId, inviterUserId: attendee.id, inviteeUserId: invitee.id } });

    // Sanity: everything actually exists before the delete.
    expect(await prisma.registration.count({ where: { eventId } })).toBe(1);
    expect(await prisma.registrationAnswer.count({ where: { registrationId: reg.body.id } })).toBe(1);
    expect(await prisma.eventCollaborator.count({ where: { eventId } })).toBe(1);
    expect(await prisma.eventFaqItem.count({ where: { eventId } })).toBe(1);
    expect(await prisma.eventPriceOption.count({ where: { eventId } })).toBe(1);
    expect(await prisma.eventMedia.count({ where: { eventId } })).toBe(1);
    expect(await prisma.eventInvitation.count({ where: { eventId } })).toBe(1);

    await prisma.event.delete({ where: { id: eventId } });

    expect(await prisma.registration.count({ where: { eventId } })).toBe(0);
    expect(await prisma.registrationAnswer.count({ where: { registrationId: reg.body.id } })).toBe(0);
    expect(await prisma.eventCollaborator.count({ where: { eventId } })).toBe(0);
    expect(await prisma.eventFaqItem.count({ where: { eventId } })).toBe(0);
    expect(await prisma.eventPriceOption.count({ where: { eventId } })).toBe(0);
    expect(await prisma.eventMedia.count({ where: { eventId } })).toBe(0);
    expect(await prisma.eventInvitation.count({ where: { eventId } })).toBe(0);
    // The users themselves are untouched by the event's deletion.
    expect(await prisma.user.findUnique({ where: { id: attendee.id } })).not.toBeNull();
  });

  it("account deletion (soft-delete) cancels the deleted organizer's upcoming events instead of leaving a dangling ownerId FK", async () => {
    const owner = await newUser(app, "softdelete-owner");
    await http(app).post("/api/v1/credits/claim-free").set("Authorization", `Bearer ${owner.token}`);
    const created = await http(app).post("/api/v1/events").set("Authorization", `Bearer ${owner.token}`).send({ title: "Real Owner Event" }).expect(201);
    await http(app)
      .patch(`/api/v1/events/${created.body.id}`)
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ description: "d", categoryId, cityId, startsAt: new Date(Date.now() + 5 * 86_400_000).toISOString() })
      .expect(200);
    await http(app).post(`/api/v1/events/${created.body.id}/publish`).set("Authorization", `Bearer ${owner.token}`).expect(201);

    await http(app).delete("/api/v1/users/me").set("Authorization", `Bearer ${owner.token}`).send({ confirm: true }).expect(204);

    const event = await prisma.event.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(event.status).toBe("CANCELLED"); // never a dangling FK to a deleted user — the row is retained and just cancelled
    expect(event.ownerId).toBe(owner.id); // FK stays valid: the User row is anonymised, not removed
  });
});
