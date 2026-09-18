import { Test } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { TokenService } from "./token.service";

describe("TokenService", () => {
  let service: TokenService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        TokenService,
        { provide: JwtService, useValue: { sign: jest.fn(() => "signed.jwt.token") } },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const values: Record<string, unknown> = {
                JWT_ACCESS_TTL: "15m",
                JWT_ACCESS_SECRET: "test-secret",
                JWT_REFRESH_TTL_DAYS: 30,
              };
              return values[key];
            }),
          },
        },
      ],
    }).compile();

    service = module.get(TokenService);
  });

  it("signs an access token and reports its TTL in seconds", () => {
    const result = service.signAccessToken({ sub: "user-1", email: "a@b.com" });
    expect(result.token).toBe("signed.jwt.token");
    expect(result.expiresInSeconds).toBe(900);
  });

  it("generates a refresh token whose hash matches hashToken() on the raw value", () => {
    const { token, hash } = service.generateRefreshToken();
    expect(token).toHaveLength(64); // 48 bytes, base64url
    expect(service.hashToken(token)).toBe(hash);
  });

  it("produces different tokens on each call (no reuse)", () => {
    const a = service.generateRefreshToken();
    const b = service.generateRefreshToken();
    expect(a.token).not.toBe(b.token);
  });

  it("sets refresh token expiry ~30 days out", () => {
    const expiresAt = service.refreshTokenExpiryDate();
    const days = (expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
    expect(days).toBeGreaterThan(29.9);
    expect(days).toBeLessThan(30.1);
  });
});
