/**
 * §27 — statuses that occupy a capacity slot / count as "still coming".
 * PENDING counts too: an approval-mode registration reserves its spot the
 * moment it's created, so approving it later never needs a second capacity
 * check (and can't race against a concurrent capacity-reached attempt).
 */
export const ACTIVE_REGISTRATION_STATUSES = ["PENDING", "REGISTERED", "PAYMENT_PENDING", "CONFIRMED"] as const;

/** Registrations that hold a real spot, i.e. people the organizer can mark as having come or not (post-event report, attendance %). */
export const ATTENDANCE_REGISTRATION_STATUSES = ["REGISTERED", "CONFIRMED"] as const;
