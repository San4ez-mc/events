import { normalizeInviteCode } from "./invites.service";

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
