import { EngagementScheduler } from "./engagement.scheduler";

describe("EngagementScheduler", () => {
  const prisma = {
    event: { findMany: jest.fn() },
    eventAnalyticsEvent: { count: jest.fn() },
    eventDailyStat: { groupBy: jest.fn() },
    notification: { count: jest.fn() },
    user: { findMany: jest.fn() },
    userDevice: { count: jest.fn() },
  };
  const notifications = { existsForPayload: jest.fn(), create: jest.fn() };
  const guest = { sendDue: jest.fn() };
  const mail = { sendDraftReminderEmail: jest.fn(), sendCityDigestEmail: jest.fn() };
  const cityAlerts = { sendWeeklyDigests: jest.fn(), sendEventsAppeared: jest.fn() };
  const config = { get: jest.fn(() => "https://kiro.test/") };
  const scheduler = new EngagementScheduler(prisma as never, notifications as never, guest as never, mail as never, config as never, cityAlerts as never);

  beforeEach(() => {
    jest.resetAllMocks();
    notifications.existsForPayload.mockResolvedValue(false);
    notifications.create.mockResolvedValue(undefined);
    prisma.userDevice.count.mockResolvedValue(1);
    mail.sendDraftReminderEmail.mockResolvedValue(undefined);
    mail.sendCityDigestEmail.mockResolvedValue(undefined);
    cityAlerts.sendWeeklyDigests.mockResolvedValue(0);
    cityAlerts.sendEventsAppeared.mockResolvedValue(0);
    config.get.mockReturnValue("https://kiro.test/");
  });

  describe("weekend digest", () => {
    const events = [
      { id: "e1", title: "Концерт", slug: "kontsert", cityId: "kyiv", city: { nameUk: "Київ", slug: "kyiv" } },
      { id: "e2", title: "Стендап", slug: "stendap", cityId: "kyiv", city: { nameUk: "Київ", slug: "kyiv" } },
      { id: "e3", title: "Виставка", slug: "vystavka", cityId: "lviv", city: { nameUk: "Львів", slug: "lviv" } },
    ];

    beforeEach(() => {
      prisma.event.findMany.mockResolvedValue(events);
      prisma.eventDailyStat.groupBy.mockResolvedValue([{ eventId: "e2", _sum: { views: 9 } }, { eventId: "e1", _sum: { views: 3 } }]);
    });

    it("names the user's own city and leads with the most-viewed events", async () => {
      prisma.user.findMany.mockResolvedValue([{ id: "u1", email: "u1@gmail.com", _count: { devices: 1 }, preferences: { preferredCityId: "kyiv" } }]);
      await scheduler.weekendDigest();
      expect(notifications.create).toHaveBeenCalledTimes(1);
      expect(notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: "u1", type: "WEEKLY_DIGEST", title: "This weekend on Kiro", body: 'Київ: 2 events this weekend — "Стендап", "Концерт".' }),
      );
    });

    it("covers every city for people without one, and skips a city with nothing on", async () => {
      prisma.user.findMany.mockResolvedValue([
        { id: "u2", email: "u2@gmail.com", _count: { devices: 1 }, preferences: null },
        { id: "u3", email: "u3@gmail.com", _count: { devices: 1 }, preferences: { preferredCityId: "odesa" } },
      ]);
      await scheduler.weekendDigest();
      expect(notifications.create).toHaveBeenCalledTimes(1);
      expect(notifications.create).toHaveBeenCalledWith(expect.objectContaining({ userId: "u2", body: expect.stringMatching(/^3 events this weekend — "Стендап", "Концерт", "Виставка"\.$/) }));
    });

    it("emails the digest to people with no device to push to, and only to them", async () => {
      prisma.user.findMany.mockResolvedValue([
        { id: "u1", email: "u1@gmail.com", _count: { devices: 0 }, preferences: { preferredCityId: "kyiv" } },
        { id: "u2", email: "u2@gmail.com", _count: { devices: 2 }, preferences: { preferredCityId: "kyiv" } },
      ]);
      await scheduler.weekendDigest();
      expect(mail.sendCityDigestEmail).toHaveBeenCalledTimes(1);
      expect(mail.sendCityDigestEmail).toHaveBeenCalledWith(
        "u1@gmail.com",
        expect.objectContaining({ cityName: "Київ", events: [expect.objectContaining({ title: "Стендап" }), expect.objectContaining({ title: "Концерт" })] }),
      );
    });

    it("also sends the digest to email-only subscribers", async () => {
      prisma.user.findMany.mockResolvedValue([]);
      await scheduler.weekendDigest();
      expect(cityAlerts.sendWeeklyDigests).toHaveBeenCalledTimes(1);
    });

    it("sends at most one digest per week per person", async () => {
      prisma.user.findMany.mockResolvedValue([{ id: "u1", email: "u1@gmail.com", _count: { devices: 0 }, preferences: null }]);
      notifications.existsForPayload.mockResolvedValue(true);
      await scheduler.weekendDigest();
      expect(notifications.create).not.toHaveBeenCalled();
    });

    it("does nothing when no events are on this weekend", async () => {
      prisma.event.findMany.mockResolvedValue([]);
      await scheduler.weekendDigest();
      expect(prisma.user.findMany).not.toHaveBeenCalled();
    });
  });

  describe("periodic nudges", () => {
    beforeEach(() => {
      guest.sendDue.mockResolvedValue(undefined);
      prisma.event.findMany.mockResolvedValue([]);
      prisma.user.findMany.mockResolvedValue([]);
    });

    it("reminds an organizer to share only when no share picture was ever generated", async () => {
      prisma.event.findMany.mockImplementation(async (args: { where: { status: string } }) =>
        args.where.status === "PUBLISHED" ? [{ id: "a", title: "A", ownerId: "o1" }, { id: "b", title: "B", ownerId: "o2" }] : [],
      );
      prisma.eventAnalyticsEvent.count.mockImplementation(async ({ where }: { where: { eventId: string } }) => (where.eventId === "a" ? 2 : 0));
      await scheduler.run();
      expect(notifications.create).toHaveBeenCalledTimes(1);
      expect(notifications.create).toHaveBeenCalledWith(expect.objectContaining({ userId: "o2", type: "SHARE_PROMPT", payloadJson: expect.objectContaining({ reminderEventId: "b", screen: "share" }) }));
    });

    it("nudges a stale draft once, and not again within three days for the same person", async () => {
      prisma.event.findMany.mockImplementation(async (args: { where: { status: string } }) => (args.where.status === "DRAFT" ? [{ id: "d1", title: "Чернетка", ownerId: "o1", owner: { email: "o1@example.com" } }] : []));
      prisma.notification.count.mockResolvedValueOnce(0);
      await scheduler.run();
      expect(notifications.create).toHaveBeenCalledWith(expect.objectContaining({ userId: "o1", type: "DRAFT_REMINDER", payloadJson: expect.objectContaining({ draftId: "d1", screen: "edit" }) }));

      notifications.create.mockClear();
      prisma.notification.count.mockResolvedValue(1);
      await scheduler.run();
      expect(notifications.create).not.toHaveBeenCalled();
    });

    it("also emails the draft reminder when the organizer has no app (no device to push to)", async () => {
      prisma.event.findMany.mockImplementation(async (args: { where: { status: string } }) => (args.where.status === "DRAFT" ? [{ id: "d1", title: "Чернетка", ownerId: "o1", owner: { email: "o1@example.com" } }] : []));
      prisma.notification.count.mockResolvedValue(0);
      prisma.userDevice.count.mockResolvedValue(0);
      await scheduler.run();
      expect(mail.sendDraftReminderEmail).toHaveBeenCalledWith("o1@example.com", { title: "Чернетка", editUrl: "https://kiro.test/organizer/events/d1/edit" });
    });

    it("does not email someone who has the app (the push already reached them)", async () => {
      prisma.event.findMany.mockImplementation(async (args: { where: { status: string } }) => (args.where.status === "DRAFT" ? [{ id: "d1", title: "Чернетка", ownerId: "o1", owner: { email: "o1@example.com" } }] : []));
      prisma.notification.count.mockResolvedValue(0);
      prisma.userDevice.count.mockResolvedValue(2);
      await scheduler.run();
      expect(mail.sendDraftReminderEmail).not.toHaveBeenCalled();
    });

    it("nudges an unconfirmed email once", async () => {
      prisma.user.findMany.mockResolvedValue([{ id: "u9" }]);
      await scheduler.run();
      expect(notifications.create).toHaveBeenCalledWith(expect.objectContaining({ userId: "u9", type: "ACCOUNT_REMINDER", payloadJson: { kind: "verify-email", screen: "verify" } }));

      notifications.create.mockClear();
      notifications.existsForPayload.mockResolvedValue(true);
      await scheduler.run();
      expect(notifications.create).not.toHaveBeenCalled();
    });

    it("keeps going when one job throws", async () => {
      prisma.event.findMany.mockRejectedValue(new Error("db down"));
      prisma.user.findMany.mockResolvedValue([{ id: "u9" }]);
      await expect(scheduler.run()).resolves.toBeUndefined();
      expect(guest.sendDue).toHaveBeenCalled();
      expect(notifications.create).toHaveBeenCalledWith(expect.objectContaining({ type: "ACCOUNT_REMINDER" }));
    });
  });
});
