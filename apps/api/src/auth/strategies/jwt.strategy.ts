import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import type { EnvConfig } from "../../config/env.validation";
import { PrismaService } from "../../prisma/prisma.service";
import type { AuthenticatedUser } from "../types/authenticated-user";

interface AccessTokenPayload {
  sub: string;
  email: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, "jwt") {
  constructor(
    configService: ConfigService<EnvConfig, true>,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get("JWT_ACCESS_SECRET", { infer: true }),
    });
  }

  /**
   * Re-checks the user still exists and isn't blocked/deleted on every
   * request. Slightly more DB load than trusting the JWT blindly, but
   * necessary — a suspended user's already-issued access token must stop
   * working within its own short TTL window, and RBAC role changes must
   * take effect without waiting for token expiry.
   */
  async validate(payload: AccessTokenPayload): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, role: true, status: true },
    });

    if (!user || user.status === "BLOCKED" || user.status === "DELETED") {
      throw new Error("User not found or inactive");
    }

    return { id: user.id, email: user.email, role: user.role };
  }
}
