"use client";

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Lock, MapPin, Navigation, Video } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { getAccessToken } from "@/lib/api-client";
import { useTranslations } from "@/lib/locale-context";
import type { EventDetail } from "@/lib/event-types";

interface Revealed {
  addressText?: string | null;
  onlineUrl?: string | null;
  latitude?: string | null;
  longitude?: string | null;
}

/**
 * UX §10/§12 — public visitors only ever get the district; the exact address,
 * map and meeting link appear once the viewer is registered (the API enforces
 * this — this component just re-asks with the viewer's token).
 */
export function EventLocation({ event }: { event: EventDetail }) {
  const { t } = useTranslations();
  const { user, isLoading } = useAuth();
  const [revealed, setRevealed] = useState<Revealed | null>(null);

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) return;
    const res = await fetch(`/api/v1/events/slug/${event.slug}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return;
    const body = (await res.json()) as EventDetail & { addressLocked?: boolean };
    setRevealed(body.addressLocked ? null : body);
  }, [event.slug]);

  useEffect(() => {
    if (isLoading || !user) return;
    queueMicrotask(() => void load());
    window.addEventListener("kiro:registration-changed", load);
    return () => window.removeEventListener("kiro:registration-changed", load);
  }, [isLoading, user, load]);

  const data = revealed ?? (event.addressLocked ? null : event);
  const place = [event.city?.nameUk, event.district?.nameUk].filter(Boolean).join(", ");

  if (!data || (!data.addressText && !data.onlineUrl)) {
    return (
      <section className="mb-8 flex items-start gap-3 rounded-2xl border border-border bg-surface p-4 text-sm">
        <Lock className="mt-0.5 h-5 w-5 shrink-0 text-muted" aria-hidden="true" />
        <div>
          {place && (
            <p className="flex items-center gap-1.5 font-semibold">
              <MapPin className="h-4 w-4" aria-hidden="true" />
              {place}
            </p>
          )}
          <p className="text-muted">{t("events.location.lockedHint")}</p>
        </div>
      </section>
    );
  }

  const hasCoords = data.latitude && data.longitude;
  const destination = hasCoords ? `${data.latitude},${data.longitude}` : encodeURIComponent(data.addressText ?? "");

  return (
    <section className="mb-8 overflow-hidden rounded-2xl border border-border">
      <div className="flex flex-col gap-2 p-4 text-sm">
        {data.addressText && (
          <p className="flex items-start gap-2 font-semibold">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            {data.addressText}
          </p>
        )}
        {data.onlineUrl && (
          <a href={data.onlineUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 font-semibold underline">
            <Video className="h-4 w-4" aria-hidden="true" />
            {t("events.location.joinOnline")}
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        )}
        {data.addressText && (
          <a
            href={`https://www.google.com/maps/dir/?api=1&destination=${destination}`}
            target="_blank"
            rel="noopener noreferrer"
            className="accent-gradient mt-1 inline-flex w-fit items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-white"
          >
            <Navigation className="h-4 w-4" aria-hidden="true" />
            {t("events.location.route")}
          </a>
        )}
      </div>
      {hasCoords && (
        <iframe
          title="map"
          loading="lazy"
          className="h-56 w-full border-0"
          src={`https://www.google.com/maps?q=${data.latitude},${data.longitude}&z=15&output=embed`}
        />
      )}
    </section>
  );
}
