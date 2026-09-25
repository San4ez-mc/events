import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { OAuth2Client } from "google-auth-library";
import type { EnvConfig } from "../config/env.validation";
import { ApiException } from "../common/exceptions/api.exception";

export interface GoogleIdentity {
  email: string;
  emailVerified: boolean;
  name: string | null;
  picture: string | null;
}

/** Thin wrapper so tests can swap the network call to Google for a stub (see google-auth.e2e-spec.ts). */
@Injectable()
export class GoogleTokenVerifier {
  private readonly client = new OAuth2Client();
  private readonly audiences: string[];

  constructor(configService: ConfigService<EnvConfig, true>) {
    const raw = configService.get("GOOGLE_CLIENT_IDS", { infer: true }) ?? "";
    this.audiences = raw
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
  }

  async verify(idToken: string): Promise<GoogleIdentity> {
    if (this.audiences.length === 0) {
      throw new ApiException("SOCIAL_LOGIN_DISABLED", "Google sign-in is not configured", 503);
    }
    try {
      const ticket = await this.client.verifyIdToken({ idToken, audience: this.audiences });
      const payload = ticket.getPayload();
      if (!payload?.email) throw new Error("no email in token");
      return {
        email: payload.email.toLowerCase(),
        emailVerified: payload.email_verified === true,
        name: payload.name ?? null,
        picture: payload.picture ?? null,
      };
    } catch {
      throw new ApiException("INVALID_GOOGLE_TOKEN", "Invalid Google token", 401);
    }
  }
}
