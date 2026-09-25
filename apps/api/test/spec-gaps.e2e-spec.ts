import { ConfigService } from "@nestjs/config";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/bootstrap";
import { PrismaService } from "../src/prisma/prisma.service";
import type { EnvConfig } from "../src/config/env.validation";

/**
 * Spec-gap features: attendee social proof + opt-in participant list (§3/§83),
 * exact address only after registering (§10), event chat (§28), analytics
 * funnel (§45-47) and the extended discovery filters (§7).
 */
describe("Spec gaps (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const prefix = "e2e-gaps-";
  let categoryId: string;
  let cityId: string;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app, app.get(ConfigService<EnvConfig, true>));
    await app.init();
    prisma = app.get(PrismaService);
    categoryId = (await prisma.category.findUniqueOrThrow({ where: { slug: "sport" } })).id;
    cityId = (await prisma.city.findUniqueOrThrow({ where: { slug: "kyiv" } })).id;
  });

  afterAll(async () => {
    const owner = { owner: { email: { startsWith: prefix } } };
    await prisma.eventChatMessage.deleteMany({ where: { event: owner } });
    await prisma.eventAnalyticsEvent.deleteMany({ where: { event: owner } });
    await prisma.eventDailyStat.deleteMany({ where: { event: owner } });
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

  async function publishedEvent(extra: Record<string, unknown> = {}) {
    const organizer = await newUser("org");
    await http().post("/api/v1/credits/claim-free").set("Authorization", `Bearer ${organizer.token}`);
    const created = await http().post("/api/v1/events").set("Authorization", `Bearer ${organizer.token}`).send({ title: "Gaps Fixture Event" }).expect(201);
    await http()
      .patch(`/api/v1/events/${created.body.id}`)
      .set("Authorization", `Bearer ${organizer.token}`)
      .send({
        description: "A normal description of the event.",
        categoryId,
        cityId,
        addressText: "вул. Хрещатик, 1",
        latitude: 50.4501,
        longitude: 30.5234,
        startsAt: new Date(Date.now() + 5 * 86_400_000).toISOString(),
        ...extra,
      })
      .expect(200);
    await http().post(`/api/v1/events/${created.body.id}/publish`).set("Authorization", `Bearer ${organizer.token}`).expect(201);
    return { organizer, id: created.body.id as string, slug: created.body.slug as string };
  }

  const register = (eventId: string, token: string, body: Record<string, unknown> = {}) =>
    http().post(`/api/v1/events/${eventId}/registrations`).set("Authorization", `Bearer ${token}`).send(body);

  describe("exact address (§10)", () => {
    it("hides address and coordinates from anonymous visitors, shows them to the owner and to registered users", async () => {
      const { organizer, id, slug } = await publishedEvent();
      const anonymous = await http().get(`/api/v1/events/slug/${slug}`).expect(200);
      expect(anonymous.body.addressText).toBeNull();
      expect(anonymous.body.latitude).toBeNull();
      expect(anonymous.body.addressLocked).toBe(true);

      const owner = await http().get(`/api/v1/events/slug/${slug}`).set("Authorization", `Bearer ${organizer.token}`).expect(200);
      expect(owner.body.addressText).toBe("вул. Хрещатик, 1");

      const attendee = await newUser("att");
      const before = await http().get(`/api/v1/events/slug/${slug}`).set("Authorization", `Bearer ${attendee.token}`).expect(200);
      expect(before.body.addressText).toBeNull();

      await register(id, attendee.token).expect(201);
      const after = await http().get(`/api/v1/events/slug/${slug}`).set("Authorization", `Bearer ${attendee.token}`).expect(200);
      expect(after.body.addressText).toBe("вул. Хрещатик, 1");
      expect(after.body.addressLocked).toBe(false);
    });
  });

  describe("social proof and participants (§3, §83)", () => {
    it("counts everyone but lists only users who opted in", async () => {
      const { id, slug } = await publishedEvent({ capacity: 10 });
      const shown = await newUser("shown");
      const hidden = await newUser("hidden");
      await register(id, shown.token, { showAsParticipant: true }).expect(201);
      await register(id, hidden.token, { showAsParticipant: false }).expect(201);

      const detail = await http().get(`/api/v1/events/slug/${slug}`).expect(200);
      expect(detail.body.social.registeredCount).toBe(2);
      expect(detail.body.participants.map((p: { id: string }) => p.id)).toEqual([shown.id]);
      expect(detail.body.organizer.eventsCount).toBeGreaterThanOrEqual(1);

      const feed = await http().get("/api/v1/discovery?limit=50").expect(200);
      const card = feed.body.items.find((e: { id: string }) => e.id === id);
      expect(card.social.registeredCount).toBe(2);
      expect(card.social.attendeePreviews).toHaveLength(1);
      expect(card.capacity).toBe(10);
    });
  });

  describe("event chat (§28)", () => {
    it("only confirmed participants and the organizer can read/write; cancelling removes access", async () => {
      const { organizer, id } = await publishedEvent();
      const member = await newUser("member");
      const stranger = await newUser("stranger");
      const reg = await register(id, member.token).expect(201);

      await http().get(`/api/v1/events/${id}/chat`).set("Authorization", `Bearer ${stranger.token}`).expect(403);
      await http().post(`/api/v1/events/${id}/chat`).set("Authorization", `Bearer ${stranger.token}`).send({ text: "hi" }).expect(403);

      const posted = await http().post(`/api/v1/events/${id}/chat`).set("Authorization", `Bearer ${member.token}`).send({ text: "  hello everyone  " }).expect(201);
      expect(posted.body.text).toBe("hello everyone");
      expect(posted.body.mine).toBe(true);

      const asOrganizer = await http().get(`/api/v1/events/${id}/chat`).set("Authorization", `Bearer ${organizer.token}`).expect(200);
      expect(asOrganizer.body.items).toHaveLength(1);
      expect(asOrganizer.body.isModerator).toBe(true);
      expect(asOrganizer.body.items[0].mine).toBe(false);

      await http().post(`/api/v1/events/${id}/chat`).set("Authorization", `Bearer ${member.token}`).send({ text: "" }).expect(400);
      await http().post(`/api/v1/events/${id}/chat`).set("Authorization", `Bearer ${member.token}`).send({ text: "x".repeat(1001) }).expect(400);

      await http().patch(`/api/v1/registrations/${reg.body.id}/cancel`).set("Authorization", `Bearer ${member.token}`).expect(200);
      await http().get(`/api/v1/events/${id}/chat`).set("Authorization", `Bearer ${member.token}`).expect(403);

      // A moderator can delete anyone's message.
      await http().delete(`/api/v1/events/${id}/chat/${posted.body.id}`).set("Authorization", `Bearer ${organizer.token}`).expect(204);
    });
  });

  describe("analytics (§45-47)", () => {
    it("accepts anonymous view/impression reports and exposes the funnel to the organizer", async () => {
      const { organizer, id } = await publishedEvent();
      const batch = [
        { eventId: id, action: "IMPRESSION" },
        { eventId: id, action: "VIEW", source: "SWIPE" },
        { eventId: id, action: "VIEW", source: "DIRECT" },
        { eventId: id, action: "SHARE" },
      ];
      const res = await http().post("/api/v1/analytics/events").send({ events: batch, sessionId: "s1" }).expect(202);
      expect(res.body.accepted).toBe(4);

      const attendee = await newUser("viewer");
      await register(id, attendee.token).expect(201);
      // Fire-and-forget server-side recording — give it a beat to land.
      await new Promise((r) => setTimeout(r, 800));

      const stats = await http().get(`/api/v1/events/${id}/stats`).set("Authorization", `Bearer ${organizer.token}`).expect(200);
      expect(stats.body.impressions).toBe(1);
      expect(stats.body.views).toBe(2);
      expect(stats.body.shares).toBe(1);
      expect(stats.body.viewsBySource).toEqual({ SWIPE: 1, DIRECT: 1 });
      expect(stats.body.conversionViewToRegistration).toBe(50);
    });

    it("rejects server-only actions and unknown events from clients", async () => {
      const { id } = await publishedEvent();
      await http().post("/api/v1/analytics/events").send({ events: [{ eventId: id, action: "REGISTERED" }] }).expect(400);
      const res = await http()
        .post("/api/v1/analytics/events")
        .send({ events: [{ eventId: "00000000-0000-4000-8000-000000000000", action: "VIEW" }] })
        .expect(202);
      expect(res.body.accepted).toBe(0);
    });
  });

  describe("discovery filters (§7)", () => {
    const feedIds = async (query: string) => {
      const res = await http().get(`/api/v1/discovery?limit=50&${query}`).expect(200);
      return res.body.items.map((e: { id: string }) => e.id) as string[];
    };

    it("price bounds never hide free events, and min price selects only paid ones", async () => {
      const free = await publishedEvent();
      const paid = await publishedEvent({ priceType: "PAID", price: 300, paymentUrl: "https://example.com/pay" });

      const upTo500 = await feedIds("maxBudget=500");
      expect(upTo500).toContain(free.id);
      expect(upTo500).toContain(paid.id);

      const upTo100 = await feedIds("maxBudget=100");
      expect(upTo100).toContain(free.id);
      expect(upTo100).not.toContain(paid.id);

      const from200 = await feedIds("minBudget=200&maxBudget=400");
      expect(from200).toContain(paid.id);
      expect(from200).not.toContain(free.id);
    });

    it("adults-only, group size and time-of-day windows narrow the feed", async () => {
      const adults = await publishedEvent({ ageRestriction: 18, capacity: 8 });
      const open = await publishedEvent({ capacity: 40 });

      const only18 = await feedIds("adultsOnly=true");
      expect(only18).toContain(adults.id);
      expect(only18).not.toContain(open.id);

      const small = await feedIds("capacityMax=10");
      expect(small).toContain(adults.id);
      expect(small).not.toContain(open.id);

      const large = await feedIds("capacityMin=20");
      expect(large).toContain(open.id);
      expect(large).not.toContain(adults.id);

      // The events start at (now + 5 days) — a window that excludes that hour must drop them.
      const startHour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: "Europe/Kyiv" }).format(new Date(Date.now() + 5 * 86_400_000)));
      const other = (startHour + 6) % 24;
      const excluded = await feedIds(`hourFrom=${other}&hourTo=${(other + 1) % 24}`);
      expect(excluded).not.toContain(open.id);
      const included = await feedIds(`hourFrom=${startHour}&hourTo=${startHour + 1}`);
      expect(included).toContain(open.id);
    });

    it("hides 18+ events from a signed-in minor", async () => {
      const adults = await publishedEvent({ ageRestriction: 18 });
      const minor = await newUser("minor");
      const born = new Date();
      born.setFullYear(born.getFullYear() - 15);
      await http()
        .patch("/api/v1/users/me")
        .set("Authorization", `Bearer ${minor.token}`)
        .send({ birthDate: born.toISOString().slice(0, 10) })
        .expect(200);

      const res = await http().get("/api/v1/discovery?limit=50").set("Authorization", `Bearer ${minor.token}`).expect(200);
      expect(res.body.items.map((e: { id: string }) => e.id)).not.toContain(adults.id);
    });
  });
  describe("notifications (§34)", () => {
    const waitFor = async (check: () => Promise<boolean>) => {
      for (let i = 0; i < 20; i++) {
        if (await check()) return true;
        await new Promise((r) => setTimeout(r, 150));
      }
      return false;
    };

    it("notifies followers when an organizer publishes, and opted-in friends when someone registers", async () => {
      const organizer = await newUser("org");
      const follower = await newUser("follower");
      await http().post(`/api/v1/subscriptions/organizers/${organizer.id}`).set("Authorization", `Bearer ${follower.token}`).send({ allEvents: true }).expect(201);

      await http().post("/api/v1/credits/claim-free").set("Authorization", `Bearer ${organizer.token}`);
      const created = await http().post("/api/v1/events").set("Authorization", `Bearer ${organizer.token}`).send({ title: "Notify Fixture Event" }).expect(201);
      await http()
        .patch(`/api/v1/events/${created.body.id}`)
        .set("Authorization", `Bearer ${organizer.token}`)
        .send({ description: "A normal description of the event.", categoryId, cityId, addressText: "вул. Хрещатик, 2", startsAt: new Date(Date.now() + 5 * 86_400_000).toISOString() })
        .expect(200);
      await http().post(`/api/v1/events/${created.body.id}/publish`).set("Authorization", `Bearer ${organizer.token}`).expect(201);

      const gotNewEvent = await waitFor(async () => {
        const res = await http().get("/api/v1/notifications").set("Authorization", `Bearer ${follower.token}`);
        return res.body.items?.some((n: { type: string }) => n.type === "ORGANIZER_NEW_EVENT");
      });
      expect(gotNewEvent).toBe(true);

      // follower and attendee are friends; attendee registers as a visible participant
      const attendee = await newUser("attendee");
      const request1 = await http().post("/api/v1/friends/requests").set("Authorization", `Bearer ${attendee.token}`).send({ addresseeId: follower.id });
      expect([200, 201]).toContain(request1.status);
      const pending = await prisma.friendship.findFirstOrThrow({ where: { requesterId: attendee.id, addresseeId: follower.id } });
      await prisma.friendship.update({ where: { id: pending.id }, data: { status: "ACCEPTED", respondedAt: new Date() } });

      await register(created.body.id, attendee.token, { showAsParticipant: true }).expect(201);
      const gotFriend = await waitFor(async () => {
        const res = await http().get("/api/v1/notifications").set("Authorization", `Bearer ${follower.token}`);
        return res.body.items?.some((n: { type: string }) => n.type === "FRIEND_EVENT_REGISTERED");
      });
      expect(gotFriend).toBe(true);
    });
  });
  describe("event FAQ (§20)", () => {
    it("lets the organizer replace the FAQ, exposes it on the public page, and rejects strangers", async () => {
      const { organizer, id, slug } = await publishedEvent();
      const stranger = await newUser("stranger");

      await http()
        .put(`/api/v1/events/${id}/faq`)
        .set("Authorization", `Bearer ${stranger.token}`)
        .send({ items: [{ question: "Q?", answer: "A." }] })
        .expect(403);

      const saved = await http()
        .put(`/api/v1/events/${id}/faq`)
        .set("Authorization", `Bearer ${organizer.token}`)
        .send({ items: [{ question: "Що взяти з собою?", answer: "Воду." }, { question: "Чи є паркінг?", answer: "Так." }] })
        .expect(200);
      expect(saved.body.map((i: { question: string }) => i.question)).toEqual(["Що взяти з собою?", "Чи є паркінг?"]);

      const page = await http().get(`/api/v1/events/slug/${slug}`).expect(200);
      expect(page.body.faqItems).toHaveLength(2);

      await http().put(`/api/v1/events/${id}/faq`).set("Authorization", `Bearer ${organizer.token}`).send({ items: [] }).expect(200);
      const cleared = await http().get(`/api/v1/events/slug/${slug}`).expect(200);
      expect(cleared.body.faqItems).toHaveLength(0);
    });
  });
  describe("ticket types (§24)", () => {
    it("requires a tier when the event has several, enforces per-tier capacity and shows sold-out on the page", async () => {
      const { organizer, id, slug } = await publishedEvent();
      const put = await http()
        .put(`/api/v1/events/${id}/price-options`)
        .set("Authorization", `Bearer ${organizer.token}`)
        .send({ items: [{ name: "Standard", price: 100 }, { name: "VIP", price: 500, capacity: 1 }] })
        .expect(200);
      const [standard, vip] = put.body as { id: string }[];

      const first = await newUser("t1");
      const second = await newUser("t2");
      await register(id, first.token).expect(400); // no tier chosen
      await register(id, first.token, { priceOptionId: vip!.id }).expect(201);
      await register(id, second.token, { priceOptionId: vip!.id }).expect(409); // VIP sold out
      await register(id, second.token, { priceOptionId: standard!.id }).expect(201);

      const page = await http().get(`/api/v1/events/slug/${slug}`).expect(200);
      const tiers = page.body.priceOptions as { name: string; soldOut: boolean; taken: number }[];
      expect(tiers.find((t) => t.name === "VIP")).toMatchObject({ soldOut: true, taken: 1 });
      expect(tiers.find((t) => t.name === "Standard")).toMatchObject({ soldOut: false, taken: 1 });
    });
  });
});
