"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useTranslations } from "@/lib/locale-context";
import { getAccessToken } from "@/lib/api-client";
import type { CursorPage, OrganizerRegistration } from "@/lib/event-types";
import { Button } from "@/components/ui/button";

const STATUS_LABEL_KEYS: Record<string, string> = {
  PENDING: "registration.pending",
  REGISTERED: "registration.registered",
  PAYMENT_PENDING: "registration.paymentPendingConfirmation",
  CONFIRMED: "registration.confirmed",
  REJECTED: "registration.rejected",
  CANCELLED: "registration.cancelRegistration",
  WAITLISTED: "registration.waitlisted",
  ATTENDED: "registration.confirmed",
  NO_SHOW: "registration.rejected",
};

/** Organizer's view of §26/§83 — full registration list + approve/reject/confirm-payment actions. */
export default function OrganizerRegistrationsPage() {
  const { id } = useParams<{ id: string }>();
  const { user, isLoading: authLoading } = useAuth();
  const { t } = useTranslations();
  const router = useRouter();

  const [items, setItems] = useState<OrganizerRegistration[] | null>(null);
  const [error, setError] = useState(false);
  const [actingOnId, setActingOnId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) return;
    const res = await fetch(`/api/v1/events/${id}/registrations`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      setError(true);
      return;
    }
    const body = (await res.json()) as CursorPage<OrganizerRegistration>;
    setItems(body.items);
  }, [id]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace(`/login?next=/organizer/events/${id}/registrations`);
      return;
    }
    // Deferred so `load`'s setState calls don't execute synchronously within this effect's body.
    queueMicrotask(() => void load());
  }, [authLoading, user, id, router, load]);

  async function act(registrationId: string, action: "approve" | "reject" | "confirm-payment") {
    const token = getAccessToken();
    if (!token) return;
    setActingOnId(registrationId);
    try {
      const res = await fetch(`/api/v1/events/${id}/registrations/${registrationId}/${action}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const updated = await res.json();
        setItems((prev) => (prev ? prev.map((r) => (r.id === registrationId ? { ...r, ...updated } : r)) : prev));
      }
    } finally {
      setActingOnId(null);
    }
  }

  if (authLoading || (!user && !error)) return null;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="mb-6 text-2xl font-bold">{t("organizerRegistrations.title")}</h1>

      {error && <p className="text-danger">{t("common.somethingWentWrong")}</p>}
      {!error && items === null && <p className="text-muted">{t("common.loading")}</p>}
      {!error && items !== null && items.length === 0 && (
        <p className="text-muted">{t("organizerRegistrations.empty")}</p>
      )}

      {!error && items !== null && items.length > 0 && (
        <ul className="flex flex-col gap-3">
          {items.map((registration) => (
            <li key={registration.id} className="flex flex-col gap-2 rounded-lg border border-border p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium">
                    {registration.user.name ?? registration.user.nickname ?? registration.user.email}
                  </p>
                  <p className="text-xs text-muted">
                    {[registration.user.email, registration.user.phone].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <span className="whitespace-nowrap text-xs text-muted">
                  {t(STATUS_LABEL_KEYS[registration.status] ?? registration.status)}
                </span>
              </div>

              {registration.answers.length > 0 && (
                <dl className="grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
                  {registration.answers.map((answer) => (
                    <div key={answer.id}>
                      <dt className="text-xs text-muted">{answer.field.label}</dt>
                      <dd>{formatAnswer(answer.valueJson)}</dd>
                    </div>
                  ))}
                </dl>
              )}

              <div className="flex gap-2">
                {registration.status === "PENDING" && (
                  <>
                    <Button
                      loading={actingOnId === registration.id}
                      onClick={() => void act(registration.id, "approve")}
                    >
                      {t("organizerRegistrations.approve")}
                    </Button>
                    <Button
                      variant="secondary"
                      loading={actingOnId === registration.id}
                      onClick={() => void act(registration.id, "reject")}
                    >
                      {t("organizerRegistrations.reject")}
                    </Button>
                  </>
                )}
                {registration.status === "PAYMENT_PENDING" && (
                  <Button
                    loading={actingOnId === registration.id}
                    onClick={() => void act(registration.id, "confirm-payment")}
                  >
                    {t("organizerRegistrations.confirmPayment")}
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function formatAnswer(value: unknown): string {
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "boolean") return value ? "✓" : "—";
  return String(value ?? "—");
}
