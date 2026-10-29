import { RegistrationsService } from "./registrations.service";

const past = new Date(Date.now() - 6 * 3_600_000);

function makeService(opts: { startsAt?: Date | null; registrations: { id: string; checkedInAt: Date | null }[]; report?: unknown }) {
  const update = jest.fn((args: unknown) => args);
  const upsert = jest.fn((args: unknown) => args);
  const prisma = {
    registration: {
      findMany: jest.fn().mockResolvedValue(opts.registrations.map((r) => ({ ...r, user: { name: `User ${r.id}`, nickname: null, avatarUrl: null } }))),
      update,
    },
    eventOrganizerReport: { findUnique: jest.fn().mockResolvedValue(opts.report ?? null), upsert },
    $transaction: jest.fn().mockResolvedValue([]),
  };
  const eventAccess = { assertPermission: jest.fn().mockResolvedValue({ id: "e1", startsAt: opts.startsAt === undefined ? past : opts.startsAt }) };
  const service = new RegistrationsService(prisma as never, {} as never, eventAccess as never, {} as never);
  return { service, prisma, update, upsert };
}

describe("post-event report", () => {
  it("lists everyone as having come until the organizer marks anyone", async () => {
    const { service } = makeService({ registrations: [{ id: "a", checkedInAt: null }, { id: "b", checkedInAt: null }] });
    const r = await service.getEventReport("e1", "owner");
    expect(r.eventEnded).toBe(true);
    expect(r.participants.map((p) => p.attended)).toEqual([true, true]);
  });

  it("respects marks that already exist (manual check-in): only the checked-in people came", async () => {
    const { service } = makeService({ registrations: [{ id: "a", checkedInAt: new Date() }, { id: "b", checkedInAt: null }] });
    const r = await service.getEventReport("e1", "owner");
    expect(r.participants.map((p) => p.attended)).toEqual([true, false]);
  });

  it("stores check-ins for the ticked people, clears the rest and counts them", async () => {
    const { service, update, upsert } = makeService({ registrations: [{ id: "a", checkedInAt: null }, { id: "b", checkedInAt: null }, { id: "c", checkedInAt: null }] });
    await service.submitEventReport("e1", "owner", { attendedIds: ["a", "c"], comment: "  Не вистачило нагадувань  " });
    expect(update).toHaveBeenCalledTimes(3);
    const byId = Object.fromEntries(update.mock.calls.map(([args]) => [(args as { where: { id: string } }).where.id, (args as { data: { checkedInAt: Date | null } }).data.checkedInAt]));
    expect(byId.a).toBeInstanceOf(Date);
    expect(byId.b).toBeNull();
    expect(byId.c).toBeInstanceOf(Date);
    expect(upsert.mock.calls[0]![0]).toMatchObject({ create: { comment: "Не вистачило нагадувань", registeredCount: 3, attendedCount: 2 } });
  });

  it("refuses a report before the event has started", async () => {
    const { service } = makeService({ startsAt: new Date(Date.now() + 3_600_000), registrations: [] });
    await expect(service.submitEventReport("e1", "owner", { attendedIds: [] })).rejects.toMatchObject({ code: "EVENT_NOT_STARTED" });
  });
});
