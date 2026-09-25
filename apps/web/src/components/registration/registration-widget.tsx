"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useTranslations } from "@/lib/locale-context";
import { getAccessToken } from "@/lib/api-client";
import { ApiRequestError } from "@/lib/auth-context";
import type { EventDetail, Registration } from "@/lib/event-types";
import { Button } from "@/components/ui/button";
import { RegistrationFieldInput } from "./registration-field-input";

/**
 * §26/§27, UX §13 — the event page's CTA, now doing real work instead of
 * being permanently disabled. Renders a different state for every point in
 * the registration state machine (see RegistrationsService for the same
 * machine on the backend).
 */
export function RegistrationWidget({ event }: { event: EventDetail }) {
  const { t } = useTranslations();
  const { user, isLoading: authLoading } = useAuth();

  const [registration, setRegistration] = useState<Registration | null | undefined>(undefined);
  const [showForm, setShowForm] = useState(false);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [joinWaitlist, setJoinWaitlist] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    // Deferred via queueMicrotask so neither branch's setState call executes
    // synchronously within this effect's own body.
    queueMicrotask(async () => {
      if (!user) {
        setRegistration(null);
        return;
      }
      const token = getAccessToken();
      if (!token) return;
      const res = await fetch(`/api/v1/events/${event.id}/registrations/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const body = (await res.json()) as { registration: Registration | null };
      setRegistration(body.registration);
    });
  }, [authLoading, user, event.id]);

  // Tells sibling blocks (e.g. the exact-location card) to re-fetch what a registered user may see.
  useEffect(() => {
    if (registration !== undefined) window.dispatchEvent(new Event("kiro:registration-changed"));
  }, [registration]);

  async function submit() {
    const token = getAccessToken();
    if (!token) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/events/${event.id}/registrations`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          answers: event.registrationFields.map((f) => ({ fieldId: f.id, value: answers[f.id] })),
          joinWaitlist,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new ApiRequestError(body);
      setRegistration(body as Registration);
      setShowForm(false);
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === "EVENT_CAPACITY_REACHED") {
        setJoinWaitlist(true);
      }
      setError(err instanceof ApiRequestError ? errorMessage(err.code, t) : t("common.somethingWentWrong"));
    } finally {
      setSubmitting(false);
    }
  }

  async function cancel() {
    if (!registration) return;
    const token = getAccessToken();
    if (!token) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/v1/registrations/${registration.id}/cancel`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setRegistration(await res.json());
    } finally {
      setSubmitting(false);
    }
  }

  async function markPaid() {
    if (!registration) return;
    const token = getAccessToken();
    if (!token) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/v1/registrations/${registration.id}/mark-paid`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setRegistration(await res.json());
    } finally {
      setSubmitting(false);
    }
  }

  const applyLabel = event.approvalMode === "ORGANIZER_APPROVAL" ? t("registration.apply") : t("registration.register");

  return (
    <div className="fixed inset-x-0 bottom-0 border-t border-border bg-background/95 p-4 backdrop-blur">
      <div className="mx-auto max-w-2xl">
        {error && (
          <p role="alert" className="mb-2 text-center text-sm text-danger">
            {error}
          </p>
        )}

        {renderBody()}
      </div>
    </div>
  );

  function renderBody() {
    if (event.status === "CANCELLED") {
      return <p className="text-center text-sm text-danger">{t("registration.eventCancelled")}</p>;
    }
    if (event.status !== "PUBLISHED") {
      return <p className="text-center text-sm text-muted">{t("registration.registrationClosed")}</p>;
    }

    if (authLoading || registration === undefined) {
      return (
        <Button disabled className="w-full">
          {t("common.loading")}
        </Button>
      );
    }

    if (!user) {
      return (
        <Link href="/login">
          <Button className="w-full">{t("registration.signInToRegister")}</Button>
        </Link>
      );
    }

    if (!registration || registration.status === "CANCELLED" || registration.status === "REJECTED") {
      if (showForm && event.registrationFields.length > 0) {
        return (
          <div className="flex flex-col gap-3">
            {event.registrationFields.map((field) => (
              <RegistrationFieldInput
                key={field.id}
                field={field}
                value={answers[field.id]}
                onChange={(value) => setAnswers((a) => ({ ...a, [field.id]: value }))}
              />
            ))}
            <Button onClick={() => void submit()} loading={submitting} className="w-full">
              {joinWaitlist ? t("registration.joinWaitlist") : t("registration.submitApplication")}
            </Button>
          </div>
        );
      }
      return (
        <Button
          onClick={() => (event.registrationFields.length > 0 ? setShowForm(true) : void submit())}
          loading={submitting}
          className="w-full"
        >
          {joinWaitlist ? t("registration.joinWaitlist") : applyLabel}
        </Button>
      );
    }

    if (registration.status === "PENDING") {
      return <p className="text-center text-sm text-muted">{t("registration.pending")}</p>;
    }
    if (registration.status === "WAITLISTED") {
      return <p className="text-center text-sm text-muted">{t("registration.waitlisted")}</p>;
    }
    if (registration.status === "PAYMENT_PENDING") {
      return <p className="text-center text-sm text-muted">{t("registration.paymentPendingConfirmation")}</p>;
    }

    if (registration.status === "REGISTERED" && event.priceType === "PAID") {
      return (
        <div className="flex flex-col gap-2">
          <p className="text-center text-sm text-muted">{t("registration.registered")}</p>
          {event.paymentUrl && (
            <a href={event.paymentUrl} target="_blank" rel="noopener noreferrer">
              <Button variant="secondary" className="w-full">
                {t("registration.payNow")}
              </Button>
            </a>
          )}
          <Button onClick={() => void markPaid()} loading={submitting} className="w-full">
            {t("registration.markPaid")}
          </Button>
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-2">
        <p className="text-center text-sm text-muted">
          {registration.status === "CONFIRMED" ? t("registration.confirmed") : t("registration.registered")}
        </p>
        <Button variant="secondary" onClick={() => void cancel()} loading={submitting} className="w-full">
          {t("registration.cancelRegistration")}
        </Button>
      </div>
    );
  }
}

function errorMessage(code: string, t: (key: string) => string): string {
  if (code === "EVENT_CAPACITY_REACHED") return t("registration.capacityReached");
  if (code === "REGISTRATION_CLOSED") return t("registration.registrationClosed");
  return t(`errors.${code}`);
}
