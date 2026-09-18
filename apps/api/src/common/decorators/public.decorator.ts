import { SetMetadata } from "@nestjs/common";

export const IS_PUBLIC_KEY = "isPublic";

/**
 * Marks a route as not requiring authentication. The JwtAuthGuard is applied
 * globally (auth-by-default), so public endpoints (browse, search, view
 * event, health) must opt out explicitly — §63.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
