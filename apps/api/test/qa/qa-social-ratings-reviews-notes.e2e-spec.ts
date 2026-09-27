import { ConfigService } from "@nestjs/config";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../../src/app.module";
import { configureApp } from "../../src/bootstrap";
import { PrismaService } from "../../src/prisma/prisma.service";
import type { EnvConfig } from "../../src/config/env.validation";

/**
 * QA audit — sections 31 (organizer ratings), 32 (event reviews), 33
 * (private organizer notes) of the acceptance-test spec.
 *
 * Important finding surfaced by this file: the codebase has exactly one
 * rating primitive — `EventReview` (apps/api/prisma/schema.prisma) — which
 * is simultaneously "the event's review" (§32) and the sole input to the
 * organizer's aggregate rating (§31, computed live in UsersService.getPublicProfile
 * and EventsService.getReviewSummary via `eventReview.aggregate`). There is
 * no separate "rate the organizer" flow. The spec (§32) explicitly asks
 * these to be "separate concepts" — see the dedicated test below.
 */
describe("QA social — organizer ratings, event reviews, private notes (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const prefix = "qa-soc-";
  let sportCategoryId: string;
  let kyivCityId: string;
  const http = () => request(app.getHttpServer());

  jest.setTimeout(90000);

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
    const owner = { owner: { email: { startsWith: prefix } } };
    await prisma.privateUserNote.deleteMany({ where: { author: { email: { startsWith: prefix } } } });
    await prisma.eventReview.deleteMany({ where: { event: owner } });
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

  /** Publishes an event, optionally immediately marking it COMPLETED (bypassing the scheduler for review-eligibility tests). */
  async function publishedEvent(title: string, token: string, extra: Record<string, unknown> = {}): Promise<{ id: string; slug: string }> {
    const created = await http().post("/api/v1/events").set("Authorization", `Bearer ${token}`).send({ title }).expect(201);
    await http()
      .patch(`/api/v1/events/${created.body.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        description: "A normal description of the QA ratings fixture event.",
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

  async function markCompleted(eventId: string): Promise<void> {
    await prisma.event.update({ where: { id: eventId }, data: { status: "COMPLETED", completedAt: new Date() } });
  }

  describe("§31 Organizer ratings", () => {
    it("enforces the 1..5 rating bounds", async () => {
      const organizer = await organizerWithCredits("rate-bounds-org");
      const attendee = await newUser("rate-bounds-attendee");
      const evt = await publishedEvent("QASOC Rating Bounds Fixture", organizer.token);
      await http().post(`/api/v1/events/${evt.id}/registrations`).set("Authorization", `Bearer ${attendee.token}`).send({}).expect(201);
      await markCompleted(evt.id);

      await http().post(`/api/v1/events/${evt.id}/reviews`).set("Authorization", `Bearer ${attendee.token}`).send({ rating: 0 }).expect(400);
      await http().post(`/api/v1/events/${evt.id}/reviews`).set("Authorization", `Bearer ${attendee.token}`).send({ rating: 6 }).expect(400);
      await http().post(`/api/v1/events/${evt.id}/reviews`).set("Authorization", `Bearer ${attendee.token}`).send({ rating: 1 }).expect(201);
      const row = await prisma.eventReview.findUniqueOrThrow({ where: { eventId_authorUserId: { eventId: evt.id, authorUserId: attendee.id } } });
      expect(row.rating).toBe(1);
    });

    it("blocks rating before the event has completed", async () => {
      const organizer = await organizerWithCredits("rate-early-org");
      const attendee = await newUser("rate-early-attendee");
      const evt = await publishedEvent("QASOC Rating Early Fixture", organizer.token);
      await http().post(`/api/v1/events/${evt.id}/registrations`).set("Authorization", `Bearer ${attendee.token}`).send({}).expect(201);
      // Event is still PUBLISHED (hasn't completed) — rating must be rejected.
      await http().post(`/api/v1/events/${evt.id}/reviews`).set("Authorization", `Bearer ${attendee.token}`).send({ rating: 5 }).expect(400);
    });

    it("blocks a rating from someone with no relationship to the event (never registered)", async () => {
      const organizer = await organizerWithCredits("rate-unrelated-org");
      const stranger = await newUser("rate-unrelated-stranger");
      const evt = await publishedEvent("QASOC Rating Unrelated Fixture", organizer.token);
      await markCompleted(evt.id);
      await http().post(`/api/v1/events/${evt.id}/reviews`).set("Authorization", `Bearer ${stranger.token}`).send({ rating: 5 }).expect(403);

      // The organizer can't rate their own event either.
      await http().post(`/api/v1/events/${evt.id}/reviews`).set("Authorization", `Bearer ${organizer.token}`).send({ rating: 5 }).expect(400);
    });

    it("a second submission from the same author updates in place rather than creating a duplicate row", async () => {
      const organizer = await organizerWithCredits("rate-dup-org");
      const attendee = await newUser("rate-dup-attendee");
      const evt = await publishedEvent("QASOC Rating Duplicate Fixture", organizer.token);
      await http().post(`/api/v1/events/${evt.id}/registrations`).set("Authorization", `Bearer ${attendee.token}`).send({}).expect(201);
      await markCompleted(evt.id);

      await http().post(`/api/v1/events/${evt.id}/reviews`).set("Authorization", `Bearer ${attendee.token}`).send({ rating: 2, text: "Meh" }).expect(201);
      await http().post(`/api/v1/events/${evt.id}/reviews`).set("Authorization", `Bearer ${attendee.token}`).send({ rating: 5, text: "Changed my mind" }).expect(201);

      const rows = await prisma.eventReview.findMany({ where: { eventId: evt.id, authorUserId: attendee.id } });
      expect(rows).toHaveLength(1); // no duplicate row — invariant holds
      expect(rows[0]!.rating).toBe(5); // NOTE (deviation): the spec asks a duplicate submission to be "blocked" with
      // an error; the implementation instead silently treats it as an edit (upsert on the eventId+authorUserId
      // unique key). The important invariant — one person can't inflate an organizer's average with several
      // ratings — still holds, but there is no 409/error response as the spec's phrasing implies.
    });

    it("recalculates the organizer's aggregate rating live as reviews are added", async () => {
      const organizer = await organizerWithCredits("rate-aggregate-org");
      const a = await newUser("rate-aggregate-a");
      const b = await newUser("rate-aggregate-b");
      const evt = await publishedEvent("QASOC Rating Aggregate Fixture", organizer.token);
      await http().post(`/api/v1/events/${evt.id}/registrations`).set("Authorization", `Bearer ${a.token}`).send({}).expect(201);
      await http().post(`/api/v1/events/${evt.id}/registrations`).set("Authorization", `Bearer ${b.token}`).send({}).expect(201);
      await markCompleted(evt.id);

      await http().post(`/api/v1/events/${evt.id}/reviews`).set("Authorization", `Bearer ${a.token}`).send({ rating: 5 }).expect(201);
      const afterOne = await http().get(`/api/v1/users/${organizer.id}/profile`).expect(200);
      expect(Number(afterOne.body.ratingAverage)).toBeCloseTo(5, 5);
      expect(afterOne.body.reviewsCount).toBe(1);

      await http().post(`/api/v1/events/${evt.id}/reviews`).set("Authorization", `Bearer ${b.token}`).send({ rating: 1 }).expect(201);
      const afterTwo = await http().get(`/api/v1/users/${organizer.id}/profile`).expect(200);
      expect(Number(afterTwo.body.ratingAverage)).toBeCloseTo(3, 5); // (5+1)/2
      expect(afterTwo.body.reviewsCount).toBe(2);
    });
  });

  describe("§32 Event reviews", () => {
    it("supports edit and author-only delete, with duplicate-prevention identical to §31's", async () => {
      const organizer = await organizerWithCredits("review-crud-org");
      const attendee = await newUser("review-crud-attendee");
      const stranger = await newUser("review-crud-stranger");
      const evt = await publishedEvent("QASOC Review CRUD Fixture", organizer.token);
      await http().post(`/api/v1/events/${evt.id}/registrations`).set("Authorization", `Bearer ${attendee.token}`).send({}).expect(201);
      await markCompleted(evt.id);

      const created = await http().post(`/api/v1/events/${evt.id}/reviews`).set("Authorization", `Bearer ${attendee.token}`).send({ rating: 3, text: "OK" }).expect(201);
      const edited = await http().post(`/api/v1/events/${evt.id}/reviews`).set("Authorization", `Bearer ${attendee.token}`).send({ rating: 4, text: "Actually good" }).expect(201);
      expect(edited.body.id).toBe(created.body.id);
      expect(edited.body.text).toBe("Actually good");

      const list = await http().get(`/api/v1/events/${evt.id}/reviews`).expect(200);
      expect(list.body.items).toHaveLength(1);

      // A stranger can't delete someone else's review.
      await http().delete(`/api/v1/reviews/${created.body.id}`).set("Authorization", `Bearer ${stranger.token}`).expect(403);
      await http().delete(`/api/v1/reviews/${created.body.id}`).set("Authorization", `Bearer ${attendee.token}`).expect(204);
      const listAfter = await http().get(`/api/v1/events/${evt.id}/reviews`).expect(200);
      expect(listAfter.body.items).toHaveLength(0);
    });

    it("supports moderation: a moderator can hide/remove a review, which then disappears from the public list", async () => {
      const organizer = await organizerWithCredits("review-mod-org");
      const attendee = await newUser("review-mod-attendee");
      const moderator = await newUser("review-mod-moderator");
      await prisma.user.update({ where: { id: moderator.id }, data: { role: "MODERATOR" } });
      const evt = await publishedEvent("QASOC Review Moderation Fixture", organizer.token);
      await http().post(`/api/v1/events/${evt.id}/registrations`).set("Authorization", `Bearer ${attendee.token}`).send({}).expect(201);
      await markCompleted(evt.id);
      const review = await http().post(`/api/v1/events/${evt.id}/reviews`).set("Authorization", `Bearer ${attendee.token}`).send({ rating: 1, text: "abusive text" }).expect(201);

      // A regular user can't moderate.
      await http().patch(`/api/v1/admin/reviews/${review.body.id}`).set("Authorization", `Bearer ${attendee.token}`).send({ status: "HIDDEN" }).expect(403);

      await http().patch(`/api/v1/admin/reviews/${review.body.id}`).set("Authorization", `Bearer ${moderator.token}`).send({ status: "HIDDEN" }).expect(200);
      const list = await http().get(`/api/v1/events/${evt.id}/reviews`).expect(200);
      expect(list.body.items).toHaveLength(0);
    });

    it("DEVIATION from spec: event reviews and organizer ratings are not separate concepts — one submission drives both", async () => {
      const organizer = await organizerWithCredits("review-vs-rating-org");
      const attendee = await newUser("review-vs-rating-attendee");
      const evt = await publishedEvent("QASOC Review Vs Rating Fixture", organizer.token);
      await http().post(`/api/v1/events/${evt.id}/registrations`).set("Authorization", `Bearer ${attendee.token}`).send({}).expect(201);
      await markCompleted(evt.id);

      await http().post(`/api/v1/events/${evt.id}/reviews`).set("Authorization", `Bearer ${attendee.token}`).send({ rating: 2, text: "Not great" }).expect(201);

      // The single EventReview row (visible via GET .../reviews) is also the exact source the organizer's public
      // "rating" comes from — there is no independent "rate this organizer" input anywhere in the API.
      const eventPage = await http().get(`/api/v1/events/slug/${evt.slug}`).expect(200);
      expect(eventPage.body.reviewSummary.average).toBeCloseTo(2, 5);
      const profile = await http().get(`/api/v1/users/${organizer.id}/profile`).expect(200);
      expect(Number(profile.body.ratingAverage)).toBeCloseTo(2, 5);
      // Same average, same count, same underlying row — the spec's "must be separate concepts" is not met.
      expect(profile.body.reviewsCount).toBe(1);
    });
  });

  describe("§33 Private organizer notes", () => {
    it("is visible only to its author, is never in the public API, and the target can't see it", async () => {
      const organizer = await organizerWithCredits("notes-org");
      const attendee = await newUser("notes-attendee");
      const otherOrganizer = await organizerWithCredits("notes-other-org");

      const upserted = await http()
        .put(`/api/v1/users/${attendee.id}/notes`)
        .set("Authorization", `Bearer ${organizer.token}`)
        .send({ note: "Showed up late last time, follow up." })
        .expect(200);

      const list = await http().get(`/api/v1/users/${attendee.id}/notes`).set("Authorization", `Bearer ${organizer.token}`).expect(200);
      expect(list.body.map((n: { note: string }) => n.note)).toContain("Showed up late last time, follow up.");

      // A different organizer with no note of their own sees an empty list — never the first organizer's note.
      const otherList = await http().get(`/api/v1/users/${attendee.id}/notes`).set("Authorization", `Bearer ${otherOrganizer.token}`).expect(200);
      expect(otherList.body).toHaveLength(0);

      // The target user has no endpoint that returns notes written about them — the profile/public API never includes it.
      const publicProfile = await http().get(`/api/v1/users/${attendee.id}/profile`).expect(200);
      expect(JSON.stringify(publicProfile.body)).not.toContain("Showed up late");
      const fullProfileAsSelf = await http().get("/api/v1/users/me").set("Authorization", `Bearer ${attendee.token}`).expect(200);
      expect(JSON.stringify(fullProfileAsSelf.body)).not.toContain("Showed up late");

      // Editing (upsert) replaces the same row rather than creating a new one.
      await http().put(`/api/v1/users/${attendee.id}/notes`).set("Authorization", `Bearer ${organizer.token}`).send({ note: "Updated note text." }).expect(200);
      const listAfterEdit = await http().get(`/api/v1/users/${attendee.id}/notes`).set("Authorization", `Bearer ${organizer.token}`).expect(200);
      expect(listAfterEdit.body).toHaveLength(1);
      expect(listAfterEdit.body[0].note).toBe("Updated note text.");

      await http().delete(`/api/v1/users/${attendee.id}/notes/${upserted.body.id}`).set("Authorization", `Bearer ${organizer.token}`).expect(204);
      const listAfterDelete = await http().get(`/api/v1/users/${attendee.id}/notes`).set("Authorization", `Bearer ${organizer.token}`).expect(200);
      expect(listAfterDelete.body).toHaveLength(0);
    });

    it("a note author can't delete another author's note about the same target", async () => {
      const organizerA = await organizerWithCredits("notes-authorA");
      const organizerB = await organizerWithCredits("notes-authorB");
      const attendee = await newUser("notes-shared-target");

      const noteA = await http().put(`/api/v1/users/${attendee.id}/notes`).set("Authorization", `Bearer ${organizerA.token}`).send({ note: "Note from A" }).expect(200);
      await http().put(`/api/v1/users/${attendee.id}/notes`).set("Authorization", `Bearer ${organizerB.token}`).send({ note: "Note from B" }).expect(200);

      await http().delete(`/api/v1/users/${attendee.id}/notes/${noteA.body.id}`).set("Authorization", `Bearer ${organizerB.token}`).expect(403);
    });
  });
});
