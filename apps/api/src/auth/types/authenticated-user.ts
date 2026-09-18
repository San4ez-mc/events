import type { UserRole } from "@kiro/types";

/** Shape attached to `req.user` by JwtStrategy after a valid access token. */
export interface AuthenticatedUser {
  id: string;
  email: string;
  role: UserRole;
}
