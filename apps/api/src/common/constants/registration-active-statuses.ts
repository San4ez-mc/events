/**
 * §27 — statuses that occupy a capacity slot / count as "still coming".
 * PENDING counts too: an approval-mode registration reserves its spot the
 * moment it's created, so approving it later never needs a second capacity
 * check (and can't race against a concurrent capacity-reached attempt).
 */
export const ACTIVE_REGISTRATION_STATUSES = ["PENDING", "REGISTERED", "PAYMENT_PENDING", "CONFIRMED"] as const;
