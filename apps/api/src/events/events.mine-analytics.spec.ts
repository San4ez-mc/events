import { EventsService } from "./events.service";

describe("EventsService.mineAnalytics", () => {
  const prisma = {
    event: { findMany: jest.fn() },
    eventDailyStat: { findMany: jest.fn() },
    $queryRaw: jest.fn(),
    eventInteraction: { groupBy: jest.fn() },
    registration: { groupBy: jest.fn() },
  };
  const none = {} as never;
  const service = new EventsService(prisma as never, none, none, none, none, none, none, none, none, none);

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it("returns nothing when the person has no published events (drafts have no audience yet)", async () => {
    prisma.event.findMany.mockResolvedValue([]);
    expect(await service.mineAnalytics("u1")).toEqual([]);
    expect(prisma.eventDailyStat.findMany).not.toHaveBeenCalled();
  });

  it("adds up the daily rows per event and joins people, passes and registrations", async () => {
    prisma.event.findMany.mockResolvedValue([{ id: "a" }, { id: "b" }]);
    prisma.eventDailyStat.findMany.mockResolvedValue([
      { eventId: "a", impressions: 100, views: 10, saves: 3, shares: 2, paymentClicks: 1, viewsBySource: { SWIPE: 7, SEARCH: 2, DIRECT: 1 } },
      { eventId: "a", impressions: 50, views: 5, saves: 1, shares: 0, paymentClicks: 0, viewsBySource: { SWIPE: 3, THREADS: 2 } },
      { eventId: "b", impressions: 20, views: 0, saves: 0, shares: 0, paymentClicks: 0, viewsBySource: {} },
    ]);
    prisma.$queryRaw.mockResolvedValue([{ eventId: "a", seen: BigInt(80), opened: BigInt(8) }]);
    prisma.eventInteraction.groupBy.mockResolvedValue([
      { eventId: "a", interaction: "PASS", _count: { _all: 40 } },
      { eventId: "a", interaction: "OPEN", _count: { _all: 9 } },
    ]);
    prisma.registration.groupBy.mockResolvedValue([
      { eventId: "a", status: "REGISTERED", _count: { _all: 4 } },
      { eventId: "a", status: "CONFIRMED", _count: { _all: 2 } },
      { eventId: "a", status: "CANCELLED", _count: { _all: 1 } },
    ]);

    const [a, b] = await service.mineAnalytics("u1");

    expect(a).toEqual({
      eventId: "a",
      impressions: 150,
      peopleSeen: 80,
      views: 15,
      peopleOpened: 8,
      viewsFromSwipe: 10,
      viewsFromSearch: 2,
      viewsDirect: 3,
      passes: 40,
      saves: 4,
      shares: 2,
      ticketClicks: 1,
      registrations: 6, // registered + confirmed, not the cancelled one
      confirmed: 2,
      openRatePercent: 10,
    });
    expect(b).toMatchObject({ eventId: "b", impressions: 20, peopleSeen: 0, passes: 0, registrations: 0, openRatePercent: null });
  });
});
