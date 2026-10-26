import { CityAlertsService } from "./city-alerts.service";

describe("CityAlertsService", () => {
  const prisma = {
    city: { findUnique: jest.fn() },
    cityAlert: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), findMany: jest.fn(), deleteMany: jest.fn() },
    event: { findMany: jest.fn(), groupBy: jest.fn() },
    eventDailyStat: { groupBy: jest.fn() },
  };
  const mail = { sendCityDigestEmail: jest.fn(), sendCityEventsAppearedEmail: jest.fn() };
  const config = { get: jest.fn(() => "https://kiro.test/") };
  const service = new CityAlertsService(prisma as never, mail as never, config as never);

  beforeEach(() => {
    jest.resetAllMocks();
    config.get.mockReturnValue("https://kiro.test/");
    prisma.city.findUnique.mockResolvedValue({ id: "c1" });
    prisma.cityAlert.findFirst.mockResolvedValue(null);
    prisma.cityAlert.create.mockResolvedValue({});
    prisma.cityAlert.update.mockResolvedValue({});
    mail.sendCityDigestEmail.mockResolvedValue(undefined);
    mail.sendCityEventsAppearedEmail.mockResolvedValue(undefined);
  });

  describe("subscribe", () => {
    it("normalises the address and stores a token", async () => {
      await service.subscribe({ email: " Anna@Gmail.com ", kind: "DIGEST", cityId: "c1" });
      expect(prisma.cityAlert.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ email: "anna@gmail.com", kind: "DIGEST", cityId: "c1", token: expect.stringMatching(/^[0-9a-f]{48}$/) }),
      });
    });

    it("is a no-op when the same subscription already exists", async () => {
      prisma.cityAlert.findFirst.mockResolvedValue({ id: "a1", lastSentAt: null });
      await service.subscribe({ email: "a@gmail.com", kind: "DIGEST", cityId: "c1" });
      expect(prisma.cityAlert.create).not.toHaveBeenCalled();
    });

    it("re-arms a one-off alert that was already sent", async () => {
      prisma.cityAlert.findFirst.mockResolvedValue({ id: "a1", lastSentAt: new Date() });
      await service.subscribe({ email: "a@gmail.com", kind: "NO_EVENTS", cityId: "c1", query: "терно" });
      expect(prisma.cityAlert.update).toHaveBeenCalledWith({ where: { id: "a1" }, data: { lastSentAt: null, query: "терно" } });
    });

    it("needs a city for 'tell me when events appear'", async () => {
      await expect(service.subscribe({ email: "a@gmail.com", kind: "NO_EVENTS" })).rejects.toThrow();
    });

    it("rejects an unknown city", async () => {
      prisma.city.findUnique.mockResolvedValue(null);
      await expect(service.subscribe({ email: "a@gmail.com", kind: "DIGEST", cityId: "nope" })).rejects.toThrow();
    });
  });

  describe("sendEventsAppeared", () => {
    const pending = [
      { id: "a1", email: "a@gmail.com", cityId: "ternopil", token: "t1", city: { nameUk: "Тернопіль", slug: "ternopil" } },
      { id: "a2", email: "b@gmail.com", cityId: "uzhhorod", token: "t2", city: { nameUk: "Ужгород", slug: "uzhhorod" } },
    ];

    it("emails only where events now exist, then marks them sent", async () => {
      prisma.cityAlert.findMany.mockResolvedValue(pending);
      prisma.event.groupBy.mockResolvedValue([{ cityId: "ternopil", _count: { _all: 4 } }]);
      expect(await service.sendEventsAppeared()).toBe(1);
      expect(mail.sendCityEventsAppearedEmail).toHaveBeenCalledTimes(1);
      expect(mail.sendCityEventsAppearedEmail).toHaveBeenCalledWith("a@gmail.com", expect.objectContaining({ cityName: "Тернопіль", count: 4 }));
      expect(prisma.cityAlert.update).toHaveBeenCalledWith({ where: { id: "a1" }, data: { lastSentAt: expect.any(Date) } });
    });

    it("does not mark an alert sent when the email fails", async () => {
      prisma.cityAlert.findMany.mockResolvedValue([pending[0]]);
      prisma.event.groupBy.mockResolvedValue([{ cityId: "ternopil", _count: { _all: 1 } }]);
      mail.sendCityEventsAppearedEmail.mockRejectedValue(new Error("smtp"));
      expect(await service.sendEventsAppeared()).toBe(0);
      expect(prisma.cityAlert.update).not.toHaveBeenCalled();
    });
  });

  describe("sendWeeklyDigests", () => {
    it("sends the city's most-viewed events and skips cities with nothing on", async () => {
      prisma.cityAlert.findMany.mockResolvedValue([
        { id: "a1", email: "a@gmail.com", cityId: "kyiv", token: "t1", city: { nameUk: "Київ", slug: "kyiv" } },
        { id: "a2", email: "b@gmail.com", cityId: "odesa", token: "t2", city: { nameUk: "Одеса", slug: "odesa" } },
      ]);
      prisma.event.findMany.mockImplementation(async ({ where }: { where: { cityId: string } }) =>
        where.cityId === "kyiv" ? [{ id: "e1", title: "Концерт", slug: "k" }, { id: "e2", title: "Стендап", slug: "s" }] : [],
      );
      prisma.eventDailyStat.groupBy.mockResolvedValue([{ eventId: "e2", _sum: { views: 9 } }]);
      expect(await service.sendWeeklyDigests(new Date(), new Date())).toBe(1);
      expect(mail.sendCityDigestEmail).toHaveBeenCalledWith(
        "a@gmail.com",
        expect.objectContaining({ cityName: "Київ", events: [expect.objectContaining({ title: "Стендап" }), expect.objectContaining({ title: "Концерт" })] }),
      );
    });
  });
});
