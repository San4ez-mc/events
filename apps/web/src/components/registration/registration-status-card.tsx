"use client";

import Link from "next/link";
import { IoCalendarOutline, IoCheckmarkCircle, IoChatbubbleEllipsesOutline, IoCloseCircle, IoInformationCircle, IoTimeOutline, IoWarning } from "react-icons/io5";
import type { RegistrationState } from "@kiro/types";
import { Button } from "@/components/ui/button";
import { useTranslations } from "@/lib/locale-context";

const TONE_STYLES: Record<RegistrationState["tone"], { icon: typeof IoCheckmarkCircle; box: string; text: string }> = {
  success: { icon: IoCheckmarkCircle, box: "bg-emerald-500/10 border-emerald-500/40", text: "text-emerald-600" },
  info: { icon: IoTimeOutline, box: "bg-[var(--accent-from)]/10 border-[var(--accent-from)]/40", text: "text-[var(--accent-from)]" },
  warn: { icon: IoWarning, box: "bg-amber-500/10 border-amber-500/40", text: "text-amber-600" },
  error: { icon: IoCloseCircle, box: "bg-red-500/10 border-red-500/40", text: "text-red-600" },
};

/**
 * What to tell someone after they register, for every kind of event and every status (see describeRegistration):
 * open vs. approval-only, free vs. paid, online vs. in person, waitlist, rejection... plus the next steps for each.
 */
export function RegistrationStatusCard({
  state,
  eventId,
  startsAt,
  paymentUrl,
  online,
  submitting,
  onCancel,
  onMarkPaid,
}: {
  state: RegistrationState;
  eventId: string;
  startsAt: string | null;
  paymentUrl: string | null;
  online: boolean;
  submitting: boolean;
  onCancel: () => void;
  onMarkPaid: () => void;
}) {
  const { t, locale } = useTranslations();
  const tone = TONE_STYLES[state.tone];
  const Icon = state.tone === "info" && state.id === "pending" ? IoInformationCircle : tone.icon;
  const when = startsAt
    ? new Date(startsAt).toLocaleString(locale === "uk" ? "uk-UA" : "en-US", { weekday: "short", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Kyiv" })
    : null;
  const key = (suffix: string) => `registration.state.${state.id}.${suffix}`;

  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className={`flex gap-3 rounded-[14px] border p-4 ${tone.box}`}>
        <Icon className={`mt-0.5 h-6 w-6 shrink-0 ${tone.text}`} aria-hidden="true" />
        <div className="flex flex-col gap-1.5">
          <p className="text-base font-bold">{t(key("title"))}</p>
          <p>{t(key("body1"))}</p>
          {state.bodyCount === 2 && <p className="text-muted">{t(key("body2"))}</p>}
        </div>
      </div>

      {state.showWhenWhere && (
        <div className="flex flex-col gap-1 rounded-[14px] border border-border bg-background p-3.5">
          {when && (
            <p>
              <b>{t("registration.state.when")}:</b> {when}
            </p>
          )}
          <p className="text-muted">{online ? t("registration.state.onlineBelow") : t("registration.state.whereBelow")}</p>
        </div>
      )}

      {state.showPayment && (
        <div className="flex flex-col gap-2">
          {paymentUrl ? (
            <a href={paymentUrl} target="_blank" rel="noopener noreferrer">
              <Button variant="secondary" className="w-full">
                {t("registration.state.payNow")}
              </Button>
            </a>
          ) : (
            <p className="text-muted">{t("registration.state.noPayLink")}</p>
          )}
          <Button onClick={onMarkPaid} loading={submitting} className="w-full">
            {t("registration.state.markPaid")}
          </Button>
        </div>
      )}

      {state.showReminders && <p className="text-xs text-muted">{t("registration.state.reminders")}</p>}

      <div className="flex flex-wrap gap-2">
        {state.showCalendar && (
          <a
            href={`/api/v1/events/${eventId}/calendar.ics`}
            download
            className="inline-flex min-h-10 items-center gap-2 rounded-full border border-border px-4 font-semibold hover:bg-background"
          >
            <IoCalendarOutline className="h-4 w-4" aria-hidden="true" />
            {t("events.actions.addToCalendar")}
          </a>
        )}
        {state.canContact && (
          <Link
            href={`/inbox/event/${eventId}`}
            className="inline-flex min-h-10 items-center gap-2 rounded-full border border-border px-4 font-semibold hover:bg-background"
          >
            <IoChatbubbleEllipsesOutline className="h-4 w-4" aria-hidden="true" />
            {t("registration.state.contact")}
          </Link>
        )}
        {state.showOtherEvents && (
          <Link href="/" className="inline-flex min-h-10 items-center rounded-full border border-border px-4 font-semibold hover:bg-background">
            {t("registration.state.otherEvents")}
          </Link>
        )}
      </div>

      {state.canCancel && (
        <Button variant="secondary" onClick={onCancel} loading={submitting} className="w-full">
          {t("registration.cancelRegistration")}
        </Button>
      )}
    </div>
  );
}
