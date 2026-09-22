"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useTranslations } from "@/lib/locale-context";
import { getAccessToken } from "@/lib/api-client";
import type { CursorPage, RegistrationWithEvent } from "@/lib/event-types";
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

/** "Мої" — the attendee's own registrations across every event, with a cancel action. */
export function MyRegistrationsContent() {
  const { t, locale } = useTranslations();
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<RegistrationWithEvent[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    void load(null, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run when auth resolves
  }, [authLoading, user]);

  async function load(pageCursor: string | null, reset: boolean) {
    const token = getAccessToken();
    if (!token) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (pageCursor) params.set("cursor", pageCursor);
      const res = await fetch(`/api/v1/registrations/mine?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = (await res.json()) as CursorPage<RegistrationWithEvent>;
      setItems((prev) => (reset ? body.items : [...prev, ...body.items]));
      setCursor(body.nextCursor);
      setHasMore(body.hasMore);
    } finally {
      setLoading(false);
    }
  }

  async function cancel(registrationId: string) {
    const token = getAccessToken();
    if (!token) return;
    setCancellingId(registrationId);
    try {
      const res = await fetch(`/api/v1/registrations/${registrationId}/cancel`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const updated = await res.json();
        setItems((prev) => prev.map((r) => (r.id === registrationId ? { ...r, status: updated.status } : r)));
      }
    } finally {
      setCancellingId(null);
    }
  }

  if (authLoading || !user) return null;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-8">
      <h1 className="text-lg font-bold accent-gradient-text">{t("nav.myRegistrations")}</h1>

      {loading && items.length === 0 && <p className="text-center text-muted">{t("common.loading")}</p>}
      {!loading && items.length === 0 && <p className="text-center text-muted">{t("common.empty")}</p>}

      <div className="flex flex-col gap-2">
        {items.map((registration) => {
          const cancellable = ["PENDING", "REGISTERED", "PAYMENT_PENDING", "CONFIRMED", "WAITLISTED"].includes(
            registration.status,
          );
          return (
            <div key={registration.id} className="flex flex-col gap-2 rounded-lg border border-border p-3">
              <Link href={`/events/${registration.event.slug}`} className="font-semibold hover:underline">
                {registration.event.title}
              </Link>
              <span className="text-xs text-muted">
                {registration.event.startsAt &&
                  new Date(registration.event.startsAt).toLocaleString(locale === "uk" ? "uk-UA" : "en-US", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
              </span>
              <span className="text-sm">{t(STATUS_LABEL_KEYS[registration.status] ?? "registration.pending")}</span>
              {cancellable && (
                <Button
                  variant="secondary"
                  loading={cancellingId === registration.id}
                  onClick={() => void cancel(registration.id)}
                  className="self-start"
                >
                  {t("registration.cancelRegistration")}
                </Button>
              )}
            </div>
          );
        })}
      </div>

      {hasMore && (
        <Button variant="secondary" loading={loading} onClick={() => void load(cursor, false)}>
          {t("search.loadMore")}
        </Button>
      )}
    </div>
  );
}
