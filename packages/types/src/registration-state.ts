/**
 * What a person should be told after they register (or apply), for every combination of the event's rules and their
 * registration status. One function shared by the site and the app, so both say the same thing. It returns i18n keys
 * (under `registration.state.*`) plus which actions apply; the clients draw the card.
 */
export interface RegistrationFacts {
  status: string;
  approvedAt?: string | null;
}

export interface EventRulesFacts {
  status: string;
  approvalMode?: string | null;
  priceType: string;
  format?: string | null;
  registrationMode?: string | null;
}

export type RegistrationStateTone = "success" | "info" | "warn" | "error";

export interface RegistrationState {
  /** `registration.state.<id>.title` / `.body1` / `.body2` */
  id: string;
  tone: RegistrationStateTone;
  /** Number of body paragraphs this state has in the translations (1 or 2). */
  bodyCount: 1 | 2;
  /** Show "when and where" (the address is only revealed to people who are in). */
  showWhenWhere: boolean;
  /** Online event: show the join link once the person is in. */
  showJoinLink: boolean;
  showCalendar: boolean;
  showRoute: boolean;
  /** Paid event, spot held, payment not yet sent: show the pay button and "I paid". */
  showPayment: boolean;
  /** One line "we'll remind you 24 h and 1 h before". */
  showReminders: boolean;
  canCancel: boolean;
  /** Offer "write to the organizer" (events registered on Kiro; external events link to the organizer's site instead). */
  canContact: boolean;
  /** Suggest other events (rejected / cancelled / event cancelled). */
  showOtherEvents: boolean;
  /** Invite a review (after the event). */
  showReview: boolean;
}

const base = (id: string, tone: RegistrationStateTone, over: Partial<RegistrationState> = {}): RegistrationState => ({
  id,
  tone,
  bodyCount: 1,
  showWhenWhere: false,
  showJoinLink: false,
  showCalendar: false,
  showRoute: false,
  showPayment: false,
  showReminders: false,
  canCancel: false,
  canContact: true,
  showOtherEvents: false,
  showReview: false,
  ...over,
});

/** Returns null when there is nothing to say yet (no registration). */
export function describeRegistration(event: EventRulesFacts, registration: RegistrationFacts | null | undefined): RegistrationState | null {
  if (!registration) return null;
  const online = event.format === "ONLINE";
  const paid = event.priceType === "PAID";
  const approvalFlow = event.approvalMode === "ORGANIZER_APPROVAL";
  const inPlace = { showWhenWhere: true, showJoinLink: online, showCalendar: true, showRoute: !online, showReminders: true, canCancel: true };

  if (event.status === "CANCELLED") return base("eventCancelled", "error", { showOtherEvents: true, canContact: false });

  switch (registration.status) {
    case "PENDING":
      return base(paid ? "pendingPaid" : "pending", "info", { bodyCount: 2, canCancel: true });
    case "REGISTERED": {
      if (paid) return base(approvalFlow ? "approvedPay" : "openPay", "warn", { bodyCount: 2, ...inPlace, showPayment: true });
      // A registration that was approved by the organizer, vs one into an open event.
      return base(registration.approvedAt || approvalFlow ? "approved" : "open", "success", { bodyCount: 2, ...inPlace });
    }
    case "PAYMENT_PENDING":
      return base("paymentPending", "info", { bodyCount: 2, ...inPlace });
    case "CONFIRMED":
      return base("confirmed", "success", { bodyCount: 2, ...inPlace });
    case "WAITLISTED":
      return base("waitlisted", "info", { bodyCount: 2, canCancel: true, showReminders: false });
    case "REJECTED":
      return base("rejected", "error", { showOtherEvents: true });
    case "CANCELLED":
      return base("cancelled", "info", { showOtherEvents: true, canContact: false });
    case "ATTENDED":
      return base("attended", "success", { showReview: true });
    case "NO_SHOW":
      return base("noShow", "warn");
    default:
      return null;
  }
}
