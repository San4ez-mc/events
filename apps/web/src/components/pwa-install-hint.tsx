"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useTranslations } from "@/lib/locale-context";
import { captureEvent, getStoredConsent } from "@/lib/product-analytics";

const DISMISSED_KEY = "kiro-pwa-hint-dismissed-at";
const HIDE_DAYS = 14;

function isStandalone(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
}

/**
 * Registers the (cache-free) service worker so the site is installable, records when it is opened as an installed app,
 * and shows a small "add to Home Screen" hint on phones. iPhone Safari has no install prompt API, so there it explains
 * the Share → "Add to Home Screen" steps. Android deliberately gets no prompt: it has the real Google Play app, and a
 * second "install" path (the PWA) would only compete with it. Shown/dismissed/installed are all counted, which doubles
 * as a cheap measure of iOS interest before there is an App Store app.
 */
export function PwaInstallHint() {
  const { t } = useTranslations();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }

    if (isStandalone()) {
      captureEvent("pwa_opened", { display: "standalone" });
      return;
    }

    const onInstalled = () => {
      captureEvent("pwa_installed");
      setShow(false);
    };
    window.addEventListener("appinstalled", onInstalled);

    let dismissedRecently = false;
    try {
      const at = Number(window.localStorage.getItem(DISMISSED_KEY) ?? 0);
      dismissedRecently = at > 0 && Date.now() - at < HIDE_DAYS * 24 * 60 * 60 * 1000;
    } catch {
      // Storage blocked — show the hint, it just can't be remembered.
    }

    const ua = navigator.userAgent;
    const isIos = /iPhone|iPad|iPod/.test(ua);
    // Only plain Safari can add to the Home Screen on iOS; in-app browsers (Instagram, Facebook...) and Chrome can't offer this flow.
    const isSafari = isIos && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|Instagram|FBAN|FBAV/.test(ua);
    // Wait until the analytics-consent banner has been answered so two cards never stack on a small screen.
    const consentSettled = getStoredConsent() !== null || !process.env.NEXT_PUBLIC_POSTHOG_KEY;

    const timer = window.setTimeout(() => {
      if (dismissedRecently || !consentSettled) return;
      if (isSafari) {
        setShow(true);
        captureEvent("pwa_hint_shown", { os: "ios" });
      }
    }, 4000);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!show) return null;

  const dismiss = () => {
    try {
      window.localStorage.setItem(DISMISSED_KEY, String(Date.now()));
    } catch {
      // ignore
    }
    captureEvent("pwa_hint_dismissed", { os: "ios" });
    setShow(false);
  };

  return (
    <div className="fixed inset-x-3 bottom-20 z-40 mx-auto flex max-w-md items-start gap-3 rounded-xl border border-border bg-background p-4 text-sm shadow-lg sm:hidden">
      <div className="flex-1">
        <p className="font-semibold">{t("pwa.title")}</p>
        <p className="mt-1 text-muted">{t("pwa.iosSteps")}</p>
      </div>
      <button type="button" onClick={dismiss} aria-label={t("a11y.close")} className="shrink-0 rounded-full p-1 text-muted hover:bg-surface">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
