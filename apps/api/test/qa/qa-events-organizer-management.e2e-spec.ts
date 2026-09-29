import type { INestApplication } from "@nestjs/common";
import { PrismaService } from "../../src/prisma/prisma.service";
import { bootstrapApp, cleanupQaData, createPublishedEvent, grantPro, http, newUser } from "./qa-helpers";

jest.setTimeout(120_000); // this shared local Postgres/embedded env runs several QA auditors concurrently; the default 30s per-test timeout is too tight under that contention (see docs/qa/QA_events.md).

/**
 * QA acceptance sections 17 (Organizer Participant Management), 18
 * (Co-organizers), 19 (Previous Participants / Invitations).
 */
describe("QA §17/§18/§19 — organizer tools, collaborators, invitations (e2e)", () => {
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

  describe("§17 Organizer Participant Management", () => {
    it("organizer sees registrations with custom answers and payment status; can approve/reject/confirm payment", async () => {
      const { eventId, organizerToken } = await createPublishedEvent(app, categoryId, cityId, {
        title: "Participant Mgmt QA",
        approvalMode: "ORGANIZER_APPROVAL",
        priceType: "PAID",
        price: 150,
      });
      await http(app)
        .put(`/api/v1/events/${eventId}/registrations/fields`)
        .set("Authorization", `Bearer ${organizerToken}`)
        .send({ fields: [{ label: "Team name", type: "TEXT", required: true, sortOrder: 0 }] })
        .expect(200);
      const fieldsRes = await http(app).get(`/api/v1/events/${eventId}`).set("Authorization", `Bearer ${organizerToken}`).expect(200);
      const fieldId = fieldsRes.body.registrationFields[0].id;

      const attendee = await newUser(app, "managed-attendee");
      const created = await http(app)
        .post(`/api/v1/events/${eventId}/registrations`)
        .set("Authorization", `Bearer ${attendee.token}`)
        .send({ answers: [{ fieldId, value: "The Falcons" }] })
        .expect(201);
      expect(created.body.status).toBe("PENDING");

      const list = await http(app)
        .get(`/api/v1/events/${eventId}/registrations`)
        .set("Authorization", `Bearer ${organizerToken}`)
        .expect(200);
      const row = list.body.items.find((r: { id: string }) => r.id === created.body.id);
      expect(row.answers[0].valueJson).toBe("The Falcons");
      expect(row.user.email).toEqual(expect.any(String)); // organizer is allowed to see attendee contact info for their own event

      await http(app)
        .patch(`/api/v1/events/${eventId}/registrations/${created.body.id}/approve`)
        .set("Authorization", `Bearer ${organizerToken}`)
        .expect(200);
      await http(app)
        .patch(`/api/v1/registrations/${created.body.id}/mark-paid`)
        .set("Authorization", `Bearer ${attendee.token}`)
        .expect(200);
      const confirmed = await http(app)
        .patch(`/api/v1/events/${eventId}/registrations/${created.body.id}/confirm-payment`)
        .set("Authorization", `Bearer ${organizerToken}`)
        .expect(200);
      expect(confirmed.body.status).toBe("CONFIRMED");
    });

    it("organizer can decline (reject) a still-pending participant", async () => {
      const { eventId, organizerToken } = await createPublishedEvent(app, categoryId, cityId, {
        title: "Decline QA",
        approvalMode: "ORGANIZER_APPROVAL",
      });
      const attendee = await newUser(app, "decline-me");
      const created = await http(app)
        .post(`/api/v1/events/${eventId}/registrations`)
        .set("Authorization", `Bearer ${attendee.token}`)
        .send({})
        .expect(201);
      const rejected = await http(app)
        .patch(`/api/v1/events/${eventId}/registrations/${created.body.id}/reject`)
        .set("Authorization", `Bearer ${organizerToken}`)
        .send({ note: "Full" })
        .expect(200);
      expect(rejected.body.status).toBe("REJECTED");
    });

    it("a DIFFERENT organizer (with no collaborator relationship) cannot list, approve, reject, or confirm payment for this event's registrations (§17: 'other organizers cannot access')", async () => {
      const { eventId, organizerToken } = await createPublishedEvent(app, categoryId, cityId, {
        title: "Isolated Registrations QA",
        approvalMode: "ORGANIZER_APPROVAL",
        priceType: "PAID",
        price: 100,
      });
      const attendee = await newUser(app, "isolated-attendee");
      const created = await http(app)
        .post(`/api/v1/events/${eventId}/registrations`)
        .set("Authorization", `Bearer ${attendee.token}`)
        .send({})
        .expect(201);

      const otherOrganizer = await createPublishedEvent(app, categoryId, cityId, { title: "Other Organizer's Own Event" });

      await http(app)
        .get(`/api/v1/events/${eventId}/registrations`)
        .set("Authorization", `Bearer ${otherOrganizer.organizerToken}`)
        .expect(403);
      await http(app)
        .patch(`/api/v1/events/${eventId}/registrations/${created.body.id}/approve`)
        .set("Authorization", `Bearer ${otherOrganizer.organizerToken}`)
        .expect(403);
      await http(app)
        .patch(`/api/v1/events/${eventId}/registrations/${created.body.id}/reject`)
        .set("Authorization", `Bearer ${otherOrganizer.organizerToken}`)
        .send({})
        .expect(403);
      await http(app)
        .patch(`/api/v1/events/${eventId}/registrations/${created.body.id}/confirm-payment`)
        .set("Authorization", `Bearer ${otherOrganizer.organizerToken}`)
        .expect(403);

      // Confirm the registration is genuinely untouched, not silently no-op'd.
      const untouched = await prisma.registration.findUniqueOrThrow({ where: { id: created.body.id } });
      // approvalMode is ORGANIZER_APPROVAL for this event, so the registration
      // was PENDING (never anyone's REGISTERED) — and every 403 above proves
      // it stayed exactly that, untouched by the other organizer.
      expect(untouched.status).toBe("PENDING");
    });
  });

  describe("§18 Co-organizers — granular permissions, removal", () => {
    it("a collaborator with only MANAGE_REGISTRATIONS can approve a registration but cannot edit the event", async () => {
      const ownedEvent = await createPublishedEvent(app, categoryId, cityId, { title: "Owner Managed Event" });
      await grantPro(prisma, ownedEvent.organizerId);

      const coOrganizer = await newUser(app, "co-organizer");
      await http(app)
        .post(`/api/v1/events/${ownedEvent.eventId}/collaborators`)
        .set("Authorization", `Bearer ${ownedEvent.organizerToken}`)
        .send({ userId: coOrganizer.id, permissions: ["MANAGE_REGISTRATIONS"] })
        .expect(201);

      const attendee = await newUser(app, "collab-attendee");
      await http(app)
        .patch(`/api/v1/events/${ownedEvent.eventId}`)
        .set("Authorization", `Bearer ${ownedEvent.organizerToken}`)
        .send({ approvalMode: "ORGANIZER_APPROVAL" })
        .expect(200);
      const created = await http(app)
        .post(`/api/v1/events/${ownedEvent.eventId}/registrations`)
        .set("Authorization", `Bearer ${attendee.token}`)
        .send({})
        .expect(201);

      // Can manage registrations:
      const approved = await http(app)
        .patch(`/api/v1/events/${ownedEvent.eventId}/registrations/${created.body.id}/approve`)
        .set("Authorization", `Bearer ${coOrganizer.token}`)
        .expect(200);
      expect(approved.body.status).toBe("REGISTERED");

      // Cannot edit the event (EDIT_EVENT not granted):
      await http(app)
        .patch(`/api/v1/events/${ownedEvent.eventId}`)
        .set("Authorization", `Bearer ${coOrganizer.token}`)
        .send({ title: "Hijacked title" })
        .expect(403);
    });

    it("a collaborator has no access to the owner's OTHER events", async () => {
      const eventA = await createPublishedEvent(app, categoryId, cityId, { title: "Collab Event A" });
      const eventB = await createPublishedEvent(app, categoryId, cityId, { title: "Collab Event B (unrelated)" });
      await grantPro(prisma, eventA.organizerId);

      const collaborator = await newUser(app, "scoped-collaborator");
      await http(app)
        .post(`/api/v1/events/${eventA.eventId}/collaborators`)
        .set("Authorization", `Bearer ${eventA.organizerToken}`)
        .send({ userId: collaborator.id, permissions: ["MANAGE_REGISTRATIONS", "EDIT_EVENT"] })
        .expect(201);

      // Has access to A:
      await http(app)
        .get(`/api/v1/events/${eventA.eventId}/registrations`)
        .set("Authorization", `Bearer ${collaborator.token}`)
        .expect(200);

      // No access to B, a completely unrelated event of a different owner:
      await http(app)
        .get(`/api/v1/events/${eventB.eventId}/registrations`)
        .set("Authorization", `Bearer ${collaborator.token}`)
        .expect(403);
      await http(app)
        .patch(`/api/v1/events/${eventB.eventId}`)
        .set("Authorization", `Bearer ${collaborator.token}`)
        .send({ title: "Should not work" })
        .expect(403);
    });

    it("removing a collaborator revokes their access immediately", async () => {
      const event = await createPublishedEvent(app, categoryId, cityId, { title: "Collab Removal QA" });
      await grantPro(prisma, event.organizerId);
      const collaborator = await newUser(app, "removed-collaborator");
      const added = await http(app)
        .post(`/api/v1/events/${event.eventId}/collaborators`)
        .set("Authorization", `Bearer ${event.organizerToken}`)
        .send({ userId: collaborator.id, permissions: ["EDIT_EVENT"] })
        .expect(201);

      await http(app)
        .patch(`/api/v1/events/${event.eventId}`)
        .set("Authorization", `Bearer ${collaborator.token}`)
        .send({ rules: "Collaborator can edit before removal" })
        .expect(200);

      await http(app)
        .delete(`/api/v1/events/${event.eventId}/collaborators/${added.body.id}`)
        .set("Authorization", `Bearer ${event.organizerToken}`)
        .expect(204);

      await http(app)
        .patch(`/api/v1/events/${event.eventId}`)
        .set("Authorization", `Bearer ${collaborator.token}`)
        .send({ rules: "Should fail after removal" })
        .expect(403);
    });

    it("only the owner (not a collaborator) can add or remove other collaborators", async () => {
      const event = await createPublishedEvent(app, categoryId, cityId, { title: "Owner Only Collab Mgmt QA" });
      await grantPro(prisma, event.organizerId);
      const collaboratorA = await newUser(app, "collab-a");
      const collaboratorB = await newUser(app, "collab-b");
      await http(app)
        .post(`/api/v1/events/${event.eventId}/collaborators`)
        .set("Authorization", `Bearer ${event.organizerToken}`)
        .send({ userId: collaboratorA.id, permissions: ["EDIT_EVENT", "MANAGE_REGISTRATIONS"] })
        .expect(201);

      // collaboratorA, despite having EDIT_EVENT, cannot add collaboratorB — managing collaborators is owner-only.
      await http(app)
        .post(`/api/v1/events/${event.eventId}/collaborators`)
        .set("Authorization", `Bearer ${collaboratorA.token}`)
        .send({ userId: collaboratorB.id, permissions: ["EDIT_EVENT"] })
        .expect(403);
    });
  });

  describe("§19 Previous Participants — invitations", () => {
    it("only genuinely eligible past attendees of THIS organizer appear as invite candidates, invitation is sent, and accept/decline works without auto-registering", async () => {
      const eventA = await createPublishedEvent(app, categoryId, cityId, { title: "Past Event A" });
      const pastAttendee = await newUser(app, "past-attendee");
      const neverAttended = await newUser(app, "never-attended");
      await http(app)
        .post(`/api/v1/events/${eventA.eventId}/registrations`)
        .set("Authorization", `Bearer ${pastAttendee.token}`)
        .send({})
        .expect(201);

      // createPublishedEvent always spins up a brand-new organizer, but the
      // "past participant" relationship is scoped to one organizer — so
      // event B is created directly as a second event of eventA's owner.
      const draft = await http(app)
        .post("/api/v1/events")
        .set("Authorization", `Bearer ${eventA.organizerToken}`)
        .send({ title: "New Event B (same organizer)" })
        .expect(201);
      await http(app)
        .patch(`/api/v1/events/${draft.body.id}`)
        .set("Authorization", `Bearer ${eventA.organizerToken}`)
        .send({
          description: "Second event by the same organizer.",
          categoryId,
          cityId,
          startsAt: new Date(Date.now() + 9 * 86_400_000).toISOString(),
        })
        .expect(200);
      await http(app)
        .post(`/api/v1/events/${draft.body.id}/publish`)
        .set("Authorization", `Bearer ${eventA.organizerToken}`)
        .expect(201);
      const eventBId = draft.body.id as string;

      const candidates = await http(app)
        .get(`/api/v1/events/${eventBId}/invitations/candidates`)
        .set("Authorization", `Bearer ${eventA.organizerToken}`)
        .expect(200);
      const candidateIds = candidates.body.map((c: { id: string }) => c.id);
      expect(candidateIds).toContain(pastAttendee.id);
      expect(candidateIds).not.toContain(neverAttended.id); // only eligible people appear

      const invited = await http(app)
        .post(`/api/v1/events/${eventBId}/invitations`)
        .set("Authorization", `Bearer ${eventA.organizerToken}`)
        .send({ inviteeUserId: pastAttendee.id })
        .expect(201);
      expect(invited.body.status).toBe("PENDING");

      const mine = await http(app)
        .get("/api/v1/invitations/mine")
        .set("Authorization", `Bearer ${pastAttendee.token}`)
        .expect(200);
      expect(mine.body.some((i: { id: string }) => i.id === invited.body.id)).toBe(true);

      const accepted = await http(app)
        .patch(`/api/v1/invitations/${invited.body.id}/accept`)
        .set("Authorization", `Bearer ${pastAttendee.token}`)
        .expect(200);
      expect(accepted.body.status).toBe("ACCEPTED");

      // Accepting an invitation does NOT auto-register the invitee (still has to go through the real registration flow).
      const myReg = await http(app)
        .get(`/api/v1/events/${eventBId}/registrations/me`)
        .set("Authorization", `Bearer ${pastAttendee.token}`)
        .expect(200);
      expect(myReg.body.registration).toBeNull();
    });

    it("a stranger cannot search invite candidates or invite people to someone else's event", async () => {
      const event = await createPublishedEvent(app, categoryId, cityId, { title: "Invitations Guarded QA" });
      const stranger = await newUser(app, "invite-stranger");
      const someone = await newUser(app, "invite-target");
      await http(app)
        .get(`/api/v1/events/${event.eventId}/invitations/candidates`)
        .set("Authorization", `Bearer ${stranger.token}`)
        .expect(403);
      await http(app)
        .post(`/api/v1/events/${event.eventId}/invitations`)
        .set("Authorization", `Bearer ${stranger.token}`)
        .send({ inviteeUserId: someone.id })
        .expect(403);
    });

    it("a user can only accept/decline their OWN invitation, not someone else's", async () => {
      const eventA = await createPublishedEvent(app, categoryId, cityId, { title: "Invite Ownership QA A" });
      const pastAttendee = await newUser(app, "invite-owner-past");
      await http(app)
        .post(`/api/v1/events/${eventA.eventId}/registrations`)
        .set("Authorization", `Bearer ${pastAttendee.token}`)
        .send({})
        .expect(201);
      const draft = await http(app)
        .post("/api/v1/events")
        .set("Authorization", `Bearer ${eventA.organizerToken}`)
        .send({ title: "Invite Ownership QA B" })
        .expect(201);
      await http(app)
        .patch(`/api/v1/events/${draft.body.id}`)
        .set("Authorization", `Bearer ${eventA.organizerToken}`)
        .send({ description: "d", categoryId, cityId, startsAt: new Date(Date.now() + 9 * 86_400_000).toISOString() })
        .expect(200);
      await http(app).post(`/api/v1/events/${draft.body.id}/publish`).set("Authorization", `Bearer ${eventA.organizerToken}`).expect(201);

      const invited = await http(app)
        .post(`/api/v1/events/${draft.body.id}/invitations`)
        .set("Authorization", `Bearer ${eventA.organizerToken}`)
        .send({ inviteeUserId: pastAttendee.id })
        .expect(201);

      const someoneElse = await newUser(app, "invite-not-mine");
      await http(app)
        .patch(`/api/v1/invitations/${invited.body.id}/accept`)
        .set("Authorization", `Bearer ${someoneElse.token}`)
        .expect(403);
    });
  });
});
