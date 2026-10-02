"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useTranslations } from "@/lib/locale-context";
import {
  analyticsConfigured,
  capturePageview,
  getStoredConsent,
  identifyUser,
  startAnalytics,
  storeConsent,
} from "@/lib/product-analytics";

/** Starts analytics, reports every client-side page view, ties events to the signed-in user id, and shows the consent banner. */
export function AnalyticsProvider() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { t } = useTranslations();
  const [ready, setReady] = useState(false);
  const [needsChoice, setNeedsChoice] = useState(false);
  const [consentTick, setConsentTick] = useState(0);
  const lastUrl = useRef<string | null>(null);

  useEffect(() => {
    if (!analyticsConfigured) return;
    void startAnalytics().then(() => {
      setNeedsChoice(getStoredConsent() === null);
      setReady(true);
    });
  }, []);

  useEffect(() => {
    if (!ready) return;
    const query = searchParams.toString();
    const url = `${window.location.origin}${pathname}${query ? `?${query}` : ""}`;
    if (lastUrl.current === url) return;
    lastUrl.current = url;
    capturePageview(url);
  }, [ready, pathname, searchParams]);

  useEffect(() => {
    if (ready) identifyUser(user?.id ?? null);
  }, [ready, user?.id, consentTick]);

  if (!analyticsConfigured || !needsChoice) return null;

  const choose = (choice: "granted" | "denied") => {
    storeConsent(choice);
    setNeedsChoice(false);
    setConsentTick((n) => n + 1);
  };

  return (
    <div className="fixed inset-x-0 bottom-16 z-50 mx-auto flex max-w-xl flex-col gap-3 rounded-xl border border-border bg-background p-4 text-sm shadow-lg sm:bottom-4 sm:flex-row sm:items-center">
      <p className="flex-1 text-muted">
        {t("consent.text")}{" "}
        <Link href="/privacy" className="underline">
          {t("consent.more")}
        </Link>
      </p>
      <div className="flex shrink-0 gap-2">
        <button type="button" onClick={() => choose("denied")} className="rounded-md border border-border px-3 py-1.5">
          {t("consent.decline")}
        </button>
        <button type="button" onClick={() => choose("granted")} className="accent-gradient rounded-md px-3 py-1.5 text-white">
          {t("consent.accept")}
        </button>
      </div>
    </div>
  );
}
