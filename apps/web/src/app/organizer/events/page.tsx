"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useTranslations } from "@/lib/locale-context";
import { api } from "@/lib/api-client";
import type { CursorPage, EventSummary } from "@/lib/event-types";
import { Button } from "@/components/ui/button";

const STATUS_LABELS: Record<string, { uk: string; en: string }> = {
  DRAFT: { uk: "Чернетка", en: "Draft" },
  PENDING_MODERATION: { uk: "На модерації", en: "In moderation" },
  PUBLISHED: { uk: "Опубліковано", en: "Published" },
  REJECTED: { uk: "Відхилено", en: "Rejected" },
  CANCELLED: { uk: "Скасовано", en: "Cancelled" },
  COMPLETED: { uk: "Завершено", en: "Completed" },
  ARCHIVED: { uk: "В архіві", en: "Archived" },
};

export default function OrganizerEventsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const { t, locale } = useTranslations();
  const router = useRouter();

  const [events, setEvents] = useState<EventSummary[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace("/login?next=/organizer/events");
      return;
    }

    let cancelled = false;
    (async () => {
      const res = await api.GET("/api/v1/events/mine", { params: { query: {} } });
      if (cancelled) return;
      if (res.error || !res.data) {
        setError(true);
        return;
      }
      setEvents((res.data as CursorPage<EventSummary>).items);
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, user, router]);

  if (authLoading || (!user && !error)) {
    return <LoadingState />;
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("nav.myEvents")}</h1>
        <Link href="/organizer/events/new">
          <Button>{t("nav.create")}</Button>
        </Link>
      </div>

      {error && (
        <ErrorState onRetry={() => window.location.reload()} message={t("common.somethingWentWrong")} />
      )}

      {!error && events === null && <LoadingState />}

      {!error && events !== null && events.length === 0 && (
        <div className="rounded-lg border border-dashed border-border p-10 text-center text-muted">
          <p className="mb-4">{t("common.empty")}</p>
          <Link href="/organizer/events/new">
            <Button variant="secondary">{t("nav.create")}</Button>
          </Link>
        </div>
      )}

      {!error && events !== null && events.length > 0 && (
        <ul className="flex flex-col gap-3">
          {events.map((event) => (
            <li key={event.id} className="flex items-center gap-2 rounded-lg border border-border p-4 hover:bg-surface">
              <Link href={`/organizer/events/${event.id}/edit`} className="flex min-w-0 flex-1 items-center gap-4">
                <div className="h-16 w-12 shrink-0 overflow-hidden rounded bg-surface">
                  {event.media[0] && (
                    // eslint-disable-next-line @next/next/no-img-element -- external MinIO URLs, not worth Next/Image config for Phase 1
                    <img
                      src={event.media[0].thumbnailUrl}
                      alt=""
                      className="h-full w-full object-cover"
                      style={
                        event.media[0].focalX
                          ? {
                              objectPosition: `${Number(event.media[0].focalX) * 100}% ${Number(event.media[0].focalY) * 100}%`,
                            }
                          : undefined
                      }
                    />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{event.title}</p>
                  <p className="text-xs text-muted">
                    {STATUS_LABELS[event.status]?.[locale] ?? event.status}
                  </p>
                </div>
              </Link>
              {event.status === "PUBLISHED" && (
                <Link
                  href={`/organizer/events/${event.id}/registrations`}
                  className="shrink-0 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-background"
                >
                  {t("organizerRegistrations.viewRegistrations")}
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function LoadingState() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="flex flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-lg bg-surface" />
        ))}
      </div>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { t } = useTranslations();
  return (
    <div className="rounded-lg border border-border p-8 text-center">
      <p className="mb-4 text-danger">{message}</p>
      <Button variant="secondary" onClick={onRetry}>
        {t("common.retry")}
      </Button>
    </div>
  );
}
