import { ConfigService } from "@nestjs/config";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../../src/app.module";
import { configureApp } from "../../src/bootstrap";
import { PrismaService } from "../../src/prisma/prisma.service";
import type { EnvConfig } from "../../src/config/env.validation";

/**
 * QA audit — sections 27 (saved events), 28 (subscriptions), 29 (friends),
 * 30 (profile sharing) of the acceptance-test spec.
 */
describe("QA social — saved events, subscriptions, friends, profile sharing (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const prefix = "qa-soc-";
  let sportCategoryId: string;
  let boardGamesCategoryId: string;
  let kyivCityId: string;
  const http = () => request(app.getHttpServer());

  jest.setTimeout(60000);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app, app.get(ConfigService<EnvConfig, true>));
    await app.init();
    prisma = app.get(PrismaService);
    sportCategoryId = (await prisma.category.findUniqueOrThrow({ where: { slug: "sport" } })).id;
    boardGamesCategoryId = (await prisma.category.findUniqueOrThrow({ where: { slug: "board-games" } })).id;
    kyivCityId = (await prisma.city.findUniqueOrThrow({ where: { slug: "kyiv" } })).id;
  });

  afterAll(async () => {
    const owner = { owner: { email: { startsWith: prefix } } };
    await prisma.subscription.deleteMany({ where: { user: { email: { startsWith: prefix } } } });
    await prisma.savedEvent.deleteMany({ where: { user: { email: { startsWith: prefix } } } });
    await prisma.friendship.deleteMany({
      where: { OR: [{ requester: { email: { startsWith: prefix } } }, { addressee: { email: { startsWith: prefix } } }] },
    });
    await prisma.userBlock.deleteMany({ where: { blocker: { email: { startsWith: prefix } } } });
    await prisma.registration.deleteMany({ where: { event: owner } });
    await prisma.listingCreditLedger.deleteMany({ where: { user: { email: { startsWith: prefix } } } });
    await prisma.event.deleteMany({ where: owner });
    await prisma.user.deleteMany({ where: { email: { startsWith: prefix } } });
    await app.close();
  });

  async function newUser(label: string): Promise<{ token: string; id: string }> {
    const res = await http()
      .post("/api/v1/auth/register")
      .send({ email: `${prefix}${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`, password: "Str0ngPass", name: `${label} Tester` })
      .expect(201);
    return { token: res.body.accessToken, id: res.body.user.id };
  }

  async function organizerWithCredits(label: string) {
    const organizer = await newUser(label);
    await http().post("/api/v1/credits/claim-free").set("Authorization", `Bearer ${organizer.token}`);
    return organizer;
  }

  async function publishedEvent(title: string, token: string, extra: Record<string, unknown> = {}): Promise<{ id: string; slug: string }> {
    const created = await http().post("/api/v1/events").set("Authorization", `Bearer ${token}`).send({ title }).expect(201);
    await http()
      .patch(`/api/v1/events/${created.body.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        description: "A normal description of the QA fixture event.",
        categoryId: sportCategoryId,
        cityId: kyivCityId,
        addressText: "вул. Хрещатик, 1",
        startsAt: new Date(Date.now() + 5 * 86_400_000).toISOString(),
        ...extra,
      })
      .expect(200);
    await http().post(`/api/v1/events/${created.body.id}/publish`).set("Authorization", `Bearer ${token}`).expect(201);
    return { id: created.body.id as string, slug: created.body.slug as string };
  }

  async function acceptFriendship(userA: { id: string; token: string }, userB: { id: string; token: string }) {
    const req = await http().post("/api/v1/friends/requests").set("Authorization", `Bearer ${userA.token}`).send({ addresseeId: userB.id }).expect(201);
    await http().patch(`/api/v1/friends/requests/${req.body.id}/accept`).set("Authorization", `Bearer ${userB.token}`).expect(200);
  }

  describe("§27 Saved events", () => {
    it("saving appears in the saved list and on the event page, unsaving removes it, and saving never creates a registration", async () => {
      const organizer = await organizerWithCredits("saved-org");
      const viewer = await newUser("saved-viewer");
      const evt = await publishedEvent("QASOC Saved Fixture", organizer.token);

      const beforeSave = await http().get(`/api/v1/events/slug/${evt.slug}`).set("Authorization", `Bearer ${viewer.token}`).expect(200);
      expect(beforeSave.body.viewerSaved).toBe(false);

      await http().post(`/api/v1/discovery/${evt.id}/save`).set("Authorization", `Bearer ${viewer.token}`).expect(204);

      const savedList = await http().get("/api/v1/discovery/saved").set("Authorization", `Bearer ${viewer.token}`).expect(200);
      expect(savedList.body.items.map((e: { id: string }) => e.id)).toContain(evt.id);

      const afterSave = await http().get(`/api/v1/events/slug/${evt.slug}`).set("Authorization", `Bearer ${viewer.token}`).expect(200);
      expect(afterSave.body.viewerSaved).toBe(true);

      // Saving is not a registration — no registration row exists for the viewer.
      const regCount = await prisma.registration.count({ where: { eventId: evt.id, userId: viewer.id } });
      expect(regCount).toBe(0);
      const me = await http().get(`/api/v1/events/${evt.id}/registrations/me`).set("Authorization", `Bearer ${viewer.token}`).expect(200);
      // Wrapped in `{ registration }` by design (see EventRegistrationsController.getMine) — a bare
      // `null` body is indistinguishable from no body at all, so "not registered" is always wrapped.
      expect(me.body).toEqual({ registration: null });

      // Saving twice is idempotent, not an error and not a second row.
      await http().post(`/api/v1/discovery/${evt.id}/save`).set("Authorization", `Bearer ${viewer.token}`).expect(204);
      const savedRows = await prisma.savedEvent.count({ where: { userId: viewer.id, eventId: evt.id } });
      expect(savedRows).toBe(1);

      await http().delete(`/api/v1/discovery/${evt.id}/save`).set("Authorization", `Bearer ${viewer.token}`).expect(204);
      const afterUnsave = await http().get(`/api/v1/events/slug/${evt.slug}`).set("Authorization", `Bearer ${viewer.token}`).expect(200);
      expect(afterUnsave.body.viewerSaved).toBe(false);
      const savedListAfter = await http().get("/api/v1/discovery/saved").set("Authorization", `Bearer ${viewer.token}`).expect(200);
      expect(savedListAfter.body.items.map((e: { id: string }) => e.id)).not.toContain(evt.id);
    });
  });

  describe("§28 Subscriptions", () => {
    it("subscribing to an event follows updates without registering, and can be unsubscribed", async () => {
      const organizer = await organizerWithCredits("sub-event-org");
      const follower = await newUser("sub-event-follower");
      const evt = await publishedEvent("QASOC Subscribe Event Fixture", organizer.token);

      const sub = await http().post(`/api/v1/events/${evt.id}/subscribe`).set("Authorization", `Bearer ${follower.token}`).expect(201);
      expect(sub.body.scope).toBe("EVENT");

      const regCount = await prisma.registration.count({ where: { eventId: evt.id, userId: follower.id } });
      expect(regCount).toBe(0); // subscribing != registering

      const mine = await http().get("/api/v1/subscriptions/mine").set("Authorization", `Bearer ${follower.token}`).expect(200);
      expect(mine.body.some((s: { event?: { id: string } }) => s.event?.id === evt.id)).toBe(true);

      await http().delete(`/api/v1/events/${evt.id}/subscribe`).set("Authorization", `Bearer ${follower.token}`).expect(204);
      const mineAfter = await http().get("/api/v1/subscriptions/mine").set("Authorization", `Bearer ${follower.token}`).expect(200);
      expect(mineAfter.body.some((s: { event?: { id: string } }) => s.event?.id === evt.id)).toBe(false);
    });

    it("supports the three organizer-follow scopes: a specific category from this organizer, and all events from this organizer", async () => {
      const organizer = await organizerWithCredits("sub-organizer-org");
      const follower = await newUser("sub-organizer-follower");

      const categoryOnly = await http()
        .post(`/api/v1/subscriptions/organizers/${organizer.id}`)
        .set("Authorization", `Bearer ${follower.token}`)
        .send({ categoryIds: [sportCategoryId] })
        .expect(201);
      expect(categoryOnly.body[0].scope).toBe("ORGANIZER_CATEGORY");
      expect(categoryOnly.body[0].categoryId).toBe(sportCategoryId);

      const allEvents = await http()
        .post(`/api/v1/subscriptions/organizers/${organizer.id}`)
        .set("Authorization", `Bearer ${follower.token}`)
        .send({ allEvents: true })
        .expect(201);
      expect(allEvents.body[0].scope).toBe("ORGANIZER_ALL");

      const mine = await http().get("/api/v1/subscriptions/mine").set("Authorization", `Bearer ${follower.token}`).expect(200);
      const scopes = mine.body.map((s: { scope: string }) => s.scope);
      expect(scopes).toEqual(expect.arrayContaining(["ORGANIZER_CATEGORY", "ORGANIZER_ALL"]));

      // Unsubscribe one of the two — only that row goes inactive.
      const categoryRow = mine.body.find((s: { scope: string }) => s.scope === "ORGANIZER_CATEGORY");
      await http().delete(`/api/v1/subscriptions/${categoryRow.id}`).set("Authorization", `Bearer ${follower.token}`).expect(204);
      const mineAfter = await http().get("/api/v1/subscriptions/mine").set("Authorization", `Bearer ${follower.token}`).expect(200);
      expect(mineAfter.body.map((s: { scope: string }) => s.scope)).not.toContain("ORGANIZER_CATEGORY");
      expect(mineAfter.body.map((s: { scope: string }) => s.scope)).toContain("ORGANIZER_ALL");

      // The category subscription is scoped to this organizer only — following organizer A's "sport" category
      // must not be reachable/interpreted as following category "sport" platform-wide (there's no such global
      // subscription surface, only per-organizer rows).
      const otherOrganizer = await organizerWithCredits("sub-organizer-other-org");
      const otherSub = await http()
        .post(`/api/v1/subscriptions/organizers/${otherOrganizer.id}`)
        .set("Authorization", `Bearer ${follower.token}`)
        .send({ categoryIds: [sportCategoryId] })
        .expect(201);
      expect(otherSub.body[0].organizerId).toBe(otherOrganizer.id);
      expect(otherSub.body[0].organizerId).not.toBe(organizer.id);
    });

    it("someone can't manage another user's subscription (ownership check)", async () => {
      const organizer = await organizerWithCredits("sub-owner-org");
      const follower = await newUser("sub-owner-follower");
      const stranger = await newUser("sub-owner-stranger");
      const evt = await publishedEvent("QASOC Subscribe Ownership Fixture", organizer.token);

      const sub = await http().post(`/api/v1/events/${evt.id}/subscribe`).set("Authorization", `Bearer ${follower.token}`).expect(201);
      await http().delete(`/api/v1/subscriptions/${sub.body.id}`).set("Authorization", `Bearer ${stranger.token}`).expect(403);
    });
  });

  describe("§29 Friends", () => {
    it("covers the full lifecycle: send, receive, accept, and duplicate/self-request are rejected", async () => {
      const a = await newUser("friend-a");
      const b = await newUser("friend-b");

      // Self-request is rejected.
      await http().post("/api/v1/friends/requests").set("Authorization", `Bearer ${a.token}`).send({ addresseeId: a.id }).expect(400);

      const req = await http().post("/api/v1/friends/requests").set("Authorization", `Bearer ${a.token}`).send({ addresseeId: b.id }).expect(201);

      const incoming = await http().get("/api/v1/friends/requests/incoming").set("Authorization", `Bearer ${b.token}`).expect(200);
      expect(incoming.body.map((r: { id: string }) => r.id)).toContain(req.body.id);
      const outgoing = await http().get("/api/v1/friends/requests/outgoing").set("Authorization", `Bearer ${a.token}`).expect(200);
      expect(outgoing.body.map((r: { id: string }) => r.id)).toContain(req.body.id);

      // Duplicate request while pending is rejected.
      await http().post("/api/v1/friends/requests").set("Authorization", `Bearer ${a.token}`).send({ addresseeId: b.id }).expect(409);
      // The reverse direction is also treated as a duplicate of the same pending pair.
      await http().post("/api/v1/friends/requests").set("Authorization", `Bearer ${b.token}`).send({ addresseeId: a.id }).expect(409);

      await http().patch(`/api/v1/friends/requests/${req.body.id}/accept`).set("Authorization", `Bearer ${b.token}`).expect(200);

      const friendsOfA = await http().get("/api/v1/friends").set("Authorization", `Bearer ${a.token}`).expect(200);
      expect(friendsOfA.body.map((f: { id: string }) => f.id)).toContain(b.id);

      // Now-friends duplicate request is also rejected.
      await http().post("/api/v1/friends/requests").set("Authorization", `Bearer ${a.token}`).send({ addresseeId: b.id }).expect(409);

      const status = await http().get(`/api/v1/friends/status/${b.id}`).set("Authorization", `Bearer ${a.token}`).expect(200);
      expect(status.body.status).toBe("FRIENDS");
    });

    it("supports reject and remove(unfriend)", async () => {
      const a = await newUser("friend-reject-a");
      const b = await newUser("friend-reject-b");
      const rejectReq = await http().post("/api/v1/friends/requests").set("Authorization", `Bearer ${a.token}`).send({ addresseeId: b.id }).expect(201);
      await http().patch(`/api/v1/friends/requests/${rejectReq.body.id}/reject`).set("Authorization", `Bearer ${b.token}`).expect(200);
      const statusAfterReject = await http().get(`/api/v1/friends/status/${b.id}`).set("Authorization", `Bearer ${a.token}`).expect(200);
      expect(statusAfterReject.body.status).toBe("NONE");

      const c = await newUser("friend-remove-c");
      const d = await newUser("friend-remove-d");
      await acceptFriendship(c, d);
      const friendship = await prisma.friendship.findFirstOrThrow({ where: { status: "ACCEPTED", OR: [{ requesterId: c.id, addresseeId: d.id }, { requesterId: d.id, addresseeId: c.id }] } });
      await http().delete(`/api/v1/friends/${friendship.id}`).set("Authorization", `Bearer ${c.token}`).expect(204);
      const statusAfterRemove = await http().get(`/api/v1/friends/status/${d.id}`).set("Authorization", `Bearer ${c.token}`).expect(200);
      expect(statusAfterRemove.body.status).toBe("NONE");
    });

    it("event attendance visibility respects the participant's own opt-in, independently of friendship", async () => {
      const organizer = await organizerWithCredits("friend-privacy-org");
      const a = await newUser("friend-privacy-a");
      const b = await newUser("friend-privacy-b");
      await acceptFriendship(a, b);

      const evt = await publishedEvent("QASOC Friend Attendance Privacy Fixture", organizer.token, { capacity: 10 });
      // b registers but opts OUT of being shown as a participant.
      await http().post(`/api/v1/events/${evt.id}/registrations`).set("Authorization", `Bearer ${b.token}`).send({ showAsParticipant: false }).expect(201);

      const page = await http().get(`/api/v1/events/slug/${evt.slug}`).set("Authorization", `Bearer ${a.token}`).expect(200);
      // The public participants list must never show b regardless of the friendship — opt-out is opt-out.
      expect(page.body.participants.map((p: { id: string }) => p.id)).not.toContain(b.id);
    });
  });

  describe("§30 Profile sharing", () => {
    it("exposes a public profile by id without auth, and never leaks private data (phone, email, birth date)", async () => {
      const user = await newUser("profile-share");
      await http()
        .patch("/api/v1/users/me")
        .set("Authorization", `Bearer ${user.token}`)
        .send({ name: "Profile Share Tester", nickname: `psn${Date.now()}`, bio: "Hello world", phone: "+380501234567", birthDate: "1990-01-01" })
        .expect(200);

      const publicProfile = await http().get(`/api/v1/users/${user.id}/profile`).expect(200);
      expect(publicProfile.body.name).toBe("Profile Share Tester");
      const raw = JSON.stringify(publicProfile.body);
      expect(raw).not.toContain("+380501234567");
      expect(raw).not.toMatch(/1990-01-01/);
      expect(publicProfile.body.phone).toBeUndefined();
      expect(publicProfile.body.email).toBeUndefined();
      expect(publicProfile.body.birthDate).toBeUndefined();
      expect(publicProfile.body.passwordHash).toBeUndefined();
    });

    it("hides the profile from a viewer that its owner has blocked (404, doesn't reveal existence)", async () => {
      const owner = await newUser("profile-block-owner");
      const viewer = await newUser("profile-block-viewer");
      // The profile OWNER blocks the viewer — the viewer must then get a 404, not a 403 (doesn't reveal the profile exists).
      await http().post("/api/v1/friends/blocks").set("Authorization", `Bearer ${owner.token}`).send({ userId: viewer.id }).expect(204);
      await http().get(`/api/v1/users/${owner.id}/profile`).set("Authorization", `Bearer ${viewer.token}`).expect(404);

      // The reverse relationship (I blocked them) doesn't hide their profile from me — I can still look them up.
      await http().get(`/api/v1/users/${viewer.id}/profile`).set("Authorization", `Bearer ${owner.token}`).expect(200);
    });
  });
});
