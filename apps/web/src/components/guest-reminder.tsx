"use client";

import { useState } from "react";
import Link from "next/link";
import { IoNotificationsOutline } from "react-icons/io5";
import { useAuth } from "@/lib/auth-context";
import { useTranslations } from "@/lib/locale-context";
import { captureEvent } from "@/lib/product-analytics";
import { Button } from "@/components/ui/button";

/**
 * "Remind me by email" for signed-out visitors: one tiny step that needs no account, instead of a login wall.
 * Most visitors look at a single event and never return, so this is how they get a second touch (and an invitation
 * to sign up). Hidden for signed-in users, who already get app reminders.
 */
export function GuestReminder({ eventId, startsAt }: { eventId: string; startsAt: string }) {
  const { user, isLoading } = useAuth();
  const { t } = useTranslations();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [now] = useState(() => Date.now());

  // Only upcoming events can be reminded about; signed-in users already get app reminders.
  if (isLoading || user || new Date(startsAt).getTime() <= now) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    const res = await fetch("/api/v1/event-reminders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId, email: email.trim() }),
    }).catch(() => null);
    if (res?.ok) {
      captureEvent("guest_reminder_requested", { event_id: eventId });
      setState("done");
    } else {
      setState("error");
    }
  }

  if (state === "done") {
    return (
      <div className="mt-4 rounded-[14px] border border-border bg-surface p-4 text-sm">
        <p className="font-semibold">{t("reminder.done")}</p>
        <p className="mt-1 text-muted">
          {t("reminder.orSignup")}:{" "}
          <Link href="/register" className="font-semibold text-[var(--accent-from)] underline">
            {t("reminder.signup")}
          </Link>
        </p>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-surface px-5 text-[15px] font-semibold transition hover:border-[var(--accent-from)]/50 active:scale-95"
      >
        <IoNotificationsOutline className="h-5 w-5" aria-hidden="true" />
        {t("reminder.cta")}
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="mt-4 flex flex-col gap-3 rounded-[14px] border border-border bg-surface p-4">
      <p className="text-sm font-semibold">{t("reminder.title")}</p>
      <div className="flex flex-wrap gap-2">
        <input
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t("reminder.emailPlaceholder")}
          aria-label={t("reminder.emailPlaceholder")}
          className="min-h-11 min-w-0 flex-1 rounded-[10px] border border-border bg-background px-3 text-[15px]"
        />
        <Button type="submit" loading={state === "sending"}>
          {t("reminder.send")}
        </Button>
      </div>
      {state === "error" && <p role="alert" className="text-sm text-danger">{t("reminder.error")}</p>}
    </form>
  );
}
