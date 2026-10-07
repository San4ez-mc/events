"use client";

import { useEffect, useState } from "react";
import { IoClose, IoLocationOutline } from "react-icons/io5";
import { useAuth } from "@/lib/auth-context";
import { useTranslations } from "@/lib/locale-context";
import { getAccessToken } from "@/lib/api-client";

const DISMISSED_KEY = "kiro-city-prompt-dismissed";

interface City {
  id: string;
  nameUk: string;
  nameEn: string;
}

/**
 * Half of the early users skipped the city step of onboarding. A signed-in person without a city gets one gentle,
 * dismissible nudge over the feed: pick a city, nearby events rank first. Half a minute, one tap.
 */
export function CityPrompt() {
  const { user } = useAuth();
  const { t, locale } = useTranslations();
  const [cities, setCities] = useState<City[] | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const token = getAccessToken();
    if (!user || !token) return;
    try {
      if (window.localStorage.getItem(DISMISSED_KEY)) return;
    } catch {
      // storage blocked: just show it
    }
    let cancelled = false;
    (async () => {
      const prefs = await fetch("/api/v1/discovery/preferences", { headers: { Authorization: `Bearer ${token}` } }).catch(() => null);
      if (!prefs?.ok || cancelled) return;
      if ((await prefs.json()).preferredCityId) return;
      const list = await fetch("/api/v1/geography/cities").catch(() => null);
      if (list?.ok && !cancelled) setCities(((await list.json()) as City[]).slice(0, 8));
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  function dismiss() {
    try {
      window.localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // ignore
    }
    setCities(null);
  }

  async function choose(city: City) {
    await fetch("/api/v1/discovery/preferences", {
      method: "PATCH",
      headers: { Authorization: `Bearer ${getAccessToken() ?? ""}`, "Content-Type": "application/json" },
      body: JSON.stringify({ preferredCityId: city.id }),
    }).catch(() => null);
    setDone(true);
    window.setTimeout(dismiss, 1800);
  }

  if (!cities || cities.length === 0) return null;

  return (
    <div className="absolute inset-x-3 top-16 z-20 rounded-[14px] border border-border bg-surface p-4 shadow-xl">
      <div className="flex items-start gap-2">
        <IoLocationOutline className="mt-0.5 h-5 w-5 shrink-0 text-[var(--accent-from)]" aria-hidden="true" />
        <div className="flex-1">
          <p className="font-bold">{done ? t("discover.cityPrompt.saved") : t("discover.cityPrompt.title")}</p>
          {!done && <p className="text-sm text-muted">{t("discover.cityPrompt.text")}</p>}
        </div>
        <button type="button" onClick={dismiss} aria-label={t("discover.cityPrompt.later")} className="rounded-full p-1 text-muted hover:bg-background">
          <IoClose className="h-5 w-5" />
        </button>
      </div>
      {!done && (
        <div className="mt-3 flex flex-wrap gap-2">
          {cities.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => void choose(c)}
              className="rounded-full border border-border px-3.5 py-1.5 text-sm font-semibold hover:border-[var(--accent-from)] hover:text-[var(--accent-from)]"
            >
              {locale === "uk" ? c.nameUk : c.nameEn}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
