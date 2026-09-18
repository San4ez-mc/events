import { SetMetadata } from "@nestjs/common";
import type { UserRole } from "@kiro/types";

export const ROLES_KEY = "roles";

/**
 * Marks a route as requiring one of the given roles. Always combine with
 * RolesGuard — §10: authorization is checked ONLY on the backend, never by
 * hiding a button on the frontend.
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
