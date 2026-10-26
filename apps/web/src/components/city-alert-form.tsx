"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useTranslations } from "@/lib/locale-context";
import { captureEvent } from "@/lib/product-analytics";
import { Button } from "@/components/ui/button";

interface City {
  id: string;
  nameUk: string;
  nameEn: string;
}

/**
 * Leaves an email for a city without making an account: either a weekly "what's on" digest (`DIGEST`) or a one-off
 * "tell me when something shows up" after an empty search (`NO_EVENTS`). With no `cityId` it shows a city picker,
 * pre-selecting the city the visitor typed. Pairs with an invitation to be the first organizer there.
 */
export function CityAlertForm({
  kind,
  cityId,
  cityName,
  query,
  showCreate = false,
}: {
  kind: "DIGEST" | "NO_EVENTS";
  cityId?: string;
  cityName?: string;
  query?: string;
  showCreate?: boolean;
}) {
  const { user } = useAuth();
  const { t, locale } = useTranslations();
  const [email, setEmail] = useState("");
  const [cities, setCities] = useState<City[]>([]);
  const [picked, setPicked] = useState(cityId ?? "");
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");

  const needsPicker = !cityId;
  useEffect(() => {
    if (!needsPicker) return;
    let cancelled = false;
    void fetch("/api/v1/geography/cities")
      .then((res) => (res.ok ? (res.json() as Promise<City[]>) : []))
      .then((list) => {
        if (cancelled) return;
        setCities(list);
        // The typed word is usually the city itself ("терно" → Тернопіль); a layout slip is fixed server-side for search only.
        const q = (query ?? "").trim().toLowerCase();
        const match = q ? list.find((c) => c.nameUk.toLowerCase().startsWith(q) || c.nameEn.toLowerCase().startsWith(q)) : undefined;
        if (match) setPicked(match.id);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [needsPicker, query]);

  const effectiveEmail = email || user?.email || "";
  const chosenCity = cityName ?? cities.find((c) => c.id === picked)?.[locale === "uk" ? "nameUk" : "nameEn"] ?? "";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!picked) return;
    setState("sending");
    const res = await fetch("/api/v1/city-alerts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: effectiveEmail.trim(), kind, cityId: picked, query: query?.trim() || undefined }),
    }).catch(() => null);
    if (res?.ok) {
      captureEvent("city_alert_subscribed", { kind, city_id: picked, query: query ?? null });
      setState("done");
    } else {
      setState("error");
    }
  }

  const title = kind === "DIGEST" ? t("cityAlert.digestTitle").replace("{city}", chosenCity) : t("cityAlert.noEventsTitle");
  const hint = kind === "DIGEST" ? t("cityAlert.digestHint") : t("cityAlert.noEventsHint");

  if (state === "done") {
    return (
      <div className="rounded-[14px] border border-border bg-surface p-4 text-sm">
        <p className="font-semibold">{kind === "DIGEST" ? t("cityAlert.doneDigest") : t("cityAlert.doneNoEvents")}</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-[14px] border border-border bg-surface p-4">
      <div>
        <p className="text-sm font-semibold">{title}</p>
        <p className="mt-1 text-xs text-muted">{hint}</p>
      </div>
      {needsPicker && (
        <select
          required
          value={picked}
          onChange={(e) => setPicked(e.target.value)}
          aria-label={t("cityAlert.city")}
          className="min-h-11 rounded-[10px] border border-border bg-background px-3 text-[15px]"
        >
          <option value="">{t("cityAlert.city")}</option>
          {cities.map((c) => (
            <option key={c.id} value={c.id}>
              {locale === "uk" ? c.nameUk : c.nameEn}
            </option>
          ))}
        </select>
      )}
      <div className="flex flex-wrap gap-2">
        <input
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          value={effectiveEmail}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t("reminder.emailPlaceholder")}
          aria-label={t("reminder.emailPlaceholder")}
          className="min-h-11 min-w-0 flex-1 rounded-[10px] border border-border bg-background px-3 text-[15px]"
        />
        <Button type="submit" loading={state === "sending"}>
          {t("cityAlert.subscribe")}
        </Button>
      </div>
      {state === "error" && (
        <p role="alert" className="text-sm text-danger">
          {t("reminder.error")}
        </p>
      )}
      {showCreate && (
        <p className="text-xs text-muted">
          {t("cityAlert.createPrompt")}{" "}
          <Link href="/organizer/events/new" className="font-semibold text-[var(--accent-from)] underline">
            {t("nav.create")}
          </Link>
        </p>
      )}
    </form>
  );
}
