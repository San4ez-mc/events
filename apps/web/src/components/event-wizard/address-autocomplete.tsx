"use client";

import { useEffect, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import { getAccessToken } from "@/lib/api-client";
import { useTranslations } from "@/lib/locale-context";

interface Suggestion {
  placeId: string;
  primary: string;
  secondary: string | null;
  description: string;
}

export interface PickedPlace {
  addressText: string;
  googlePlaceId: string | null;
  latitude: number | null;
  longitude: number | null;
}

function newSessionToken(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : String(Date.now());
}

/**
 * §12/§60 — Google Places autocomplete via our API proxy. Typing free text
 * still works (the address is just stored without coordinates); picking a
 * suggestion also stores the place ID + latitude/longitude, so the event page
 * never has to call Google again.
 */
export function AddressAutocomplete({
  value,
  latitude,
  longitude,
  onPick,
  label,
  placeholder,
}: {
  value: string;
  latitude: number | null;
  longitude: number | null;
  onPick: (place: PickedPlace) => void;
  label: string;
  placeholder: string;
}) {
  const { t, locale } = useTranslations();
  const [query, setQuery] = useState(value);
  const [items, setItems] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const session = useRef(newSessionToken());
  const skipNext = useRef(false);

  useEffect(() => {
    if (skipNext.current) {
      skipNext.current = false;
      return;
    }
    const q = query.trim();
    if (q.length < 3) {
      queueMicrotask(() => setItems([]));
      return;
    }
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/v1/places/autocomplete?q=${encodeURIComponent(q)}&sessionToken=${session.current}&locale=${locale}`,
          { headers: { Authorization: `Bearer ${getAccessToken() ?? ""}` } },
        );
        if (!res.ok) {
          setUnavailable(true);
          setItems([]);
          return;
        }
        setUnavailable(false);
        setItems((await res.json()) as Suggestion[]);
        setOpen(true);
      } catch {
        setUnavailable(true);
      }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query, locale]);

  async function pick(s: Suggestion) {
    setOpen(false);
    skipNext.current = true;
    setQuery(s.description);
    try {
      const res = await fetch(
        `/api/v1/places/${encodeURIComponent(s.placeId)}?sessionToken=${session.current}&locale=${locale}`,
        {
          headers: { Authorization: `Bearer ${getAccessToken() ?? ""}` },
        },
      );
      session.current = newSessionToken(); // a session ends once details are fetched
      if (res.ok) {
        const d = (await res.json()) as {
          placeId: string;
          formattedAddress: string;
          latitude: number;
          longitude: number;
        };
        skipNext.current = true;
        setQuery(d.formattedAddress);
        onPick({
          addressText: d.formattedAddress,
          googlePlaceId: d.placeId,
          latitude: d.latitude,
          longitude: d.longitude,
        });
        return;
      }
    } catch {
      // Fall through to the text-only result below.
    }
    onPick({
      addressText: s.description,
      googlePlaceId: s.placeId,
      latitude: null,
      longitude: null,
    });
  }

  return (
    <div className="relative flex flex-col gap-1.5">
      <label htmlFor="address-autocomplete" className="text-sm font-medium">
        {label}
      </label>
      <div className="relative">
        <MapPin
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
          aria-hidden="true"
        />
        <input
          id="address-autocomplete"
          value={query}
          autoComplete="off"
          onChange={(e) => {
            setQuery(e.target.value);
            // Free text: keep the address, drop coordinates that no longer match it.
            onPick({
              addressText: e.target.value,
              googlePlaceId: null,
              latitude: null,
              longitude: null,
            });
          }}
          onFocus={() => items.length > 0 && setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 150)}
          placeholder={placeholder}
          className="w-full rounded-md border border-border bg-background py-2 pl-9 pr-3 text-sm"
        />
      </div>

      {open && items.length > 0 && (
        <ul
          role="listbox"
          className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-xl border border-border bg-background shadow-lg"
        >
          {items.map((s) => (
            <li key={s.placeId}>
              <button
                type="button"
                role="option"
                aria-selected={false}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => void pick(s)}
                className="flex w-full flex-col px-3 py-2 text-left text-sm hover:bg-surface"
              >
                <span className="font-medium">{s.primary}</span>
                {s.secondary && (
                  <span className="text-xs text-muted">{s.secondary}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {unavailable && (
        <p className="text-xs text-muted">{t("errors.PLACES_UNAVAILABLE")}</p>
      )}

      {latitude !== null && longitude !== null && (
        <iframe
          title="map"
          loading="lazy"
          className="mt-2 h-44 w-full rounded-xl border border-border"
          src={`https://www.google.com/maps?q=${latitude},${longitude}&z=15&output=embed`}
        />
      )}
    </div>
  );
}
