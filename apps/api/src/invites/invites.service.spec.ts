import { InvitesService, normalizeInviteCode } from "./invites.service";

describe("normalizeInviteCode", () => {
  it("accepts an 8-character code in any case, with or without a dash or spaces", () => {
    expect(normalizeInviteCode("fxyzfkuv")).toBe("FXYZFKUV");
    expect(normalizeInviteCode("FXYZ-fkuv")).toBe("FXYZFKUV");
    expect(normalizeInviteCode(" fxyz fkuv ")).toBe("FXYZFKUV");
  });

  it("rejects anything that is not 8 letters/digits", () => {
    expect(normalizeInviteCode("")).toBeNull();
    expect(normalizeInviteCode(null)).toBeNull();
    expect(normalizeInviteCode(undefined)).toBeNull();
    expect(normalizeInviteCode("ABC")).toBeNull();
    expect(normalizeInviteCode("ABCDEFGHIJ")).toBeNull();
    expect(normalizeInviteCode("'; DROP TABLE users;--")).toBeNull();
  });
});

describe("InvitesService.overview: who paid for a subscription", () => {
  it("counts people who paid at least once and sums web payments exactly and Google Play at the plan price", async () => {
    const person = (id: string) => ({ id, name: id, nickname: null, email: `${id}@x.test`, referredAt: new Date(), createdAt: new Date(), organizerActivatedAt: null, _count: { events: 0 } });
    const prisma = {
      user: { findMany: jest.fn().mockResolvedValue([{ id: "inviter", name: "I", nickname: null, email: "i@x.test", referralClicks: 5, referralDownloadClicks: 1, invitedUsers: [person("web"), person("play"), person("free")] }]) },
      platformPaymentOrder: { groupBy: jest.fn().mockResolvedValue([{ userId: "web", _sum: { amount: "199.00" } }]) },
      platformSubscription: { findMany: jest.fn().mockResolvedValue([{ userId: "play", tier: "PRO" }]) },
    };
    const service = new InvitesService(prisma as never, {} as never);
    const result = await service.overview();
    expect(result.inviters[0]!.payers).toBe(2);
    expect(result.inviters[0]!.paidAmount).toBe(199 + 499);
    expect(result.inviters[0]!.people.find((p) => p.id === "free")).toMatchObject({ paid: false, paidAmount: 0 });
    expect(result.totals).toMatchObject({ payers: 2, paidAmount: 698 });
  });
});
