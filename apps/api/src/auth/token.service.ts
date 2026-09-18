import { createHash, randomBytes } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import type { EnvConfig } from "../config/env.validation";
import { parseDurationToSeconds } from "../common/utils/duration";

export interface AccessTokenResult {
  token: string;
  expiresInSeconds: number;
}

/**
 * Refresh tokens are opaque random strings, never JWTs — this way revoking
 * one is a DB write, not "wait for expiry", and we never leak claims to
 * whoever holds the cookie. Only the SHA-256 hash is ever persisted.
 */
@Injectable()
export class TokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService<EnvConfig, true>,
  ) {}

  signAccessToken(payload: { sub: string; email: string }): AccessTokenResult {
    const ttl = this.configService.get("JWT_ACCESS_TTL", { infer: true });
    const expiresInSeconds = parseDurationToSeconds(ttl);
    const token = this.jwtService.sign(payload, {
      secret: this.configService.get("JWT_ACCESS_SECRET", { infer: true }),
      expiresIn: expiresInSeconds,
    });
    return { token, expiresInSeconds };
  }

  generateRefreshToken(): { token: string; hash: string } {
    const token = randomBytes(48).toString("base64url");
    return { token, hash: this.hashToken(token) };
  }

  /** Used for email-verification and password-reset tokens too — same shape, shorter TTL. */
  generateSecureToken(): { token: string; hash: string } {
    const token = randomBytes(32).toString("base64url");
    return { token, hash: this.hashToken(token) };
  }

  hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  refreshTokenExpiryDate(): Date {
    const days = this.configService.get("JWT_REFRESH_TTL_DAYS", { infer: true });
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  }

  refreshTokenTtlMs(): number {
    const days = this.configService.get("JWT_REFRESH_TTL_DAYS", { infer: true });
    return days * 24 * 60 * 60 * 1000;
  }
}
