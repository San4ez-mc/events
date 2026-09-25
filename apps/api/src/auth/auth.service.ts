import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as argon2 from "argon2";
import type { EnvConfig } from "../config/env.validation";
import { FeatureFlagsService } from "../flags/feature-flags.service";
import { ApiException } from "../common/exceptions/api.exception";
import { PrismaService } from "../prisma/prisma.service";
import { MailService } from "../mail/mail.service";
import { TokenService } from "./token.service";
import { GoogleTokenVerifier } from "./google-token.verifier";
import type { RegisterDto } from "./dto/register.dto";
import type { LoginDto } from "./dto/login.dto";
import { randomUUID } from "node:crypto";

const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000; // 1h

export interface AuthTokens {
  accessToken: string;
  accessTokenExpiresInSeconds: number;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

export interface SafeUser {
  id: string;
  email: string;
  emailVerifiedAt: Date | null;
  name: string | null;
  nickname: string | null;
  role: string;
  locale: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenService: TokenService,
    private readonly mailService: MailService,
    private readonly configService: ConfigService<EnvConfig, true>,
    private readonly googleTokenVerifier: GoogleTokenVerifier,
    private readonly flags: FeatureFlagsService,
  ) {}

  async register(dto: RegisterDto): Promise<{ user: SafeUser; tokens: AuthTokens }> {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ApiException("EMAIL_ALREADY_REGISTERED", "This email is already registered", 409);
    }

    const passwordHash = await argon2.hash(dto.password, { type: argon2.argon2id });

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        name: dto.name,
        nickname: dto.nickname,
        locale: dto.locale ?? "uk",
        preferences: { create: {} },
      },
    });

    await this.sendVerificationEmail(user.id, user.email);
    const tokens = await this.issueTokenPair(user.id, user.email);

    return { user: this.toSafeUser(user), tokens };
  }

  async login(dto: LoginDto): Promise<{ user: SafeUser; tokens: AuthTokens }> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user) {
      throw new ApiException("INVALID_CREDENTIALS", "Invalid email or password", 401);
    }

    const passwordValid = await argon2.verify(user.passwordHash, dto.password);
    if (!passwordValid) {
      throw new ApiException("INVALID_CREDENTIALS", "Invalid email or password", 401);
    }

    if (user.status === "BLOCKED" || user.status === "DELETED") {
      throw new ApiException("FORBIDDEN", "This account is not accessible", 403);
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const tokens = await this.issueTokenPair(user.id, user.email);
    return { user: this.toSafeUser(user), tokens };
  }

  /**
   * §9 — Google sign-in. Existing account with the same (Google-verified)
   * email is signed in and marked email-verified; otherwise a new account is
   * created with an unusable random password (the user can set a real one via
   * "forgot password").
   */
  async loginWithGoogle(idToken: string): Promise<{ user: SafeUser; tokens: AuthTokens }> {
    await this.flags.assertEnabled("SOCIAL_LOGIN");
    const identity = await this.googleTokenVerifier.verify(idToken);
    if (!identity.emailVerified) {
      throw new ApiException("INVALID_GOOGLE_TOKEN", "Google email is not verified", 401);
    }

    let user = await this.prisma.user.findUnique({ where: { email: identity.email } });
    if (user && (user.status === "BLOCKED" || user.status === "DELETED")) {
      throw new ApiException("FORBIDDEN", "This account is not accessible", 403);
    }

    if (!user) {
      const passwordHash = await argon2.hash(randomUUID() + randomUUID(), { type: argon2.argon2id });
      user = await this.prisma.user.create({
        data: {
          email: identity.email,
          passwordHash,
          name: identity.name,
          avatarUrl: identity.picture,
          emailVerifiedAt: new Date(),
          lastLoginAt: new Date(),
          preferences: { create: {} },
        },
      });
    } else {
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date(), emailVerifiedAt: user.emailVerifiedAt ?? new Date() },
      });
    }

    const tokens = await this.issueTokenPair(user.id, user.email);
    return { user: this.toSafeUser(user), tokens };
  }

  /**
   * Refresh token rotation with reuse detection (§9). Every refresh
   * invalidates the presented token and issues a new one; presenting an
   * already-rotated token revokes the entire token family (theft signal).
   */
  async refresh(rawToken: string, meta: { ip?: string; userAgent?: string }): Promise<AuthTokens> {
    const tokenHash = this.tokenService.hashToken(rawToken);
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });

    if (!stored) {
      throw new ApiException("INVALID_OR_EXPIRED_TOKEN", "Refresh token is invalid", 401);
    }

    if (stored.revokedAt || stored.expiresAt < new Date()) {
      // Already used once, or expired. If it was already revoked (not merely
      // expired), someone is replaying a rotated-out token — burn the family.
      if (stored.revokedAt) {
        await this.prisma.refreshToken.updateMany({
          where: { familyId: stored.familyId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        this.logger.warn(`Refresh token reuse detected for family ${stored.familyId}`);
        throw new ApiException("REFRESH_TOKEN_REUSED", "Session revoked, please log in again", 401);
      }
      throw new ApiException("INVALID_OR_EXPIRED_TOKEN", "Refresh token expired", 401);
    }

    const user = await this.prisma.user.findUnique({ where: { id: stored.userId } });
    if (!user || user.status === "BLOCKED" || user.status === "DELETED") {
      throw new ApiException("AUTH_REQUIRED", "Account is not accessible", 401);
    }

    const { token: newRawToken, hash: newHash } = this.tokenService.generateRefreshToken();
    const newExpiresAt = this.tokenService.refreshTokenExpiryDate();

    const [, newStored] = await this.prisma.$transaction([
      this.prisma.refreshToken.update({
        where: { id: stored.id },
        data: { revokedAt: new Date() },
      }),
      this.prisma.refreshToken.create({
        data: {
          userId: user.id,
          tokenHash: newHash,
          familyId: stored.familyId,
          expiresAt: newExpiresAt,
          createdByIp: meta.ip,
          userAgent: meta.userAgent,
        },
      }),
    ]);
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { replacedById: newStored.id },
    });

    const access = this.tokenService.signAccessToken({ sub: user.id, email: user.email });
    return {
      accessToken: access.token,
      accessTokenExpiresInSeconds: access.expiresInSeconds,
      refreshToken: newRawToken,
      refreshTokenExpiresAt: newExpiresAt,
    };
  }

  async logout(rawToken: string): Promise<void> {
    const tokenHash = this.tokenService.hashToken(rawToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async verifyEmail(rawToken: string): Promise<void> {
    const tokenHash = this.tokenService.hashToken(rawToken);
    const record = await this.prisma.emailVerificationToken.findUnique({ where: { tokenHash } });

    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new ApiException("INVALID_OR_EXPIRED_TOKEN", "Verification link is invalid or expired", 400);
    }

    await this.prisma.$transaction([
      this.prisma.emailVerificationToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: record.userId },
        data: { emailVerifiedAt: new Date() },
      }),
    ]);
  }

  async resendVerificationEmail(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.emailVerifiedAt) return;
    await this.sendVerificationEmail(user.id, user.email);
  }

  /** Always resolves successfully regardless of whether the email exists (no account enumeration). */
  async forgotPassword(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) return;

    const { token, hash } = this.tokenService.generateSecureToken();
    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hash,
        expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
      },
    });

    const appUrl = this.configService.get("APP_URL", { infer: true });
    const resetUrl = `${appUrl}/auth/reset-password?token=${token}`;
    await this.mailService.sendPasswordResetEmail(user.email, resetUrl);
  }

  async resetPassword(rawToken: string, newPassword: string): Promise<void> {
    const tokenHash = this.tokenService.hashToken(rawToken);
    const record = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash } });

    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new ApiException("INVALID_OR_EXPIRED_TOKEN", "Reset link is invalid or expired", 400);
    }

    const passwordHash = await argon2.hash(newPassword, { type: argon2.argon2id });

    await this.prisma.$transaction([
      this.prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: record.userId },
        data: { passwordHash },
      }),
      // Password reset invalidates all existing sessions.
      this.prisma.refreshToken.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  private async sendVerificationEmail(userId: string, email: string): Promise<void> {
    const { token, hash } = this.tokenService.generateSecureToken();
    await this.prisma.emailVerificationToken.create({
      data: {
        userId,
        tokenHash: hash,
        expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS),
      },
    });
    const appUrl = this.configService.get("APP_URL", { infer: true });
    const verifyUrl = `${appUrl}/auth/verify-email?token=${token}`;
    await this.mailService.sendVerificationEmail(email, verifyUrl);
  }

  private async issueTokenPair(userId: string, email: string): Promise<AuthTokens> {
    const access = this.tokenService.signAccessToken({ sub: userId, email });
    const { token: refreshToken, hash } = this.tokenService.generateRefreshToken();
    const expiresAt = this.tokenService.refreshTokenExpiryDate();

    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: hash,
        familyId: randomUUID(),
        expiresAt,
      },
    });

    return {
      accessToken: access.token,
      accessTokenExpiresInSeconds: access.expiresInSeconds,
      refreshToken,
      refreshTokenExpiresAt: expiresAt,
    };
  }

  private toSafeUser(user: {
    id: string;
    email: string;
    emailVerifiedAt: Date | null;
    name: string | null;
    nickname: string | null;
    role: string;
    locale: string;
  }): SafeUser {
    return {
      id: user.id,
      email: user.email,
      emailVerifiedAt: user.emailVerifiedAt,
      name: user.name,
      nickname: user.nickname,
      role: user.role,
      locale: user.locale,
    };
  }
}
