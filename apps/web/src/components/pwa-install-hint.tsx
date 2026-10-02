"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useTranslations } from "@/lib/locale-context";
import { captureEvent, getStoredConsent } from "@/lib/product-analytics";

const DISMISSED_KEY = "kiro-pwa-hint-dismissed-at";
const HIDE_DAYS = 14;

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isStandalone(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
}

/**
 * Registers the (cache-free) service worker so the site is installable, records when it is opened as an installed app,
 * and shows a small "add to Home Screen" hint on phones. iPhone Safari has no install prompt API, so there it explains
 * the Share → "Add to Home Screen" steps; Android Chrome gets a real "Install" button. Shown/dismissed/installed are
 * all counted, which doubles as a cheap measure of iOS interest before there is an App Store app.
 */
export function PwaInstallHint() {
  const { t } = useTranslations();
  const [mode, setMode] = useState<"ios" | "android" | null>(null);
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);

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
      setMode(null);
    };
    window.addEventListener("appinstalled", onInstalled);

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);

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

    // The Android prompt event can arrive after mount, so "android" is decided when the event exists (see render).
    const timer = window.setTimeout(() => {
      if (dismissedRecently || !consentSettled) return;
      if (isSafari) {
        setMode("ios");
        captureEvent("pwa_hint_shown", { os: "ios" });
      }
    }, 4000);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("appinstalled", onInstalled);
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
    };
  }, []);

  const active = mode ?? (installEvent ? "android" : null);
  if (!active) return null;

  const dismiss = () => {
    try {
      window.localStorage.setItem(DISMISSED_KEY, String(Date.now()));
    } catch {
      // ignore
    }
    captureEvent("pwa_hint_dismissed", { os: active });
    setMode(null);
    setInstallEvent(null);
  };

  const install = async () => {
    if (!installEvent) return;
    captureEvent("pwa_install_clicked", { os: "android" });
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    captureEvent("pwa_install_choice", { os: "android", outcome: choice.outcome });
    setInstallEvent(null);
  };

  return (
    <div className="fixed inset-x-3 bottom-20 z-40 mx-auto flex max-w-md items-start gap-3 rounded-xl border border-border bg-background p-4 text-sm shadow-lg sm:hidden">
      <div className="flex-1">
        <p className="font-semibold">{t("pwa.title")}</p>
        <p className="mt-1 text-muted">{active === "ios" ? t("pwa.iosSteps") : t("pwa.androidText")}</p>
        {active === "android" && (
          <button type="button" onClick={() => void install()} className="accent-gradient mt-3 rounded-md px-3 py-1.5 text-white">
            {t("pwa.install")}
          </button>
        )}
      </div>
      <button type="button" onClick={dismiss} aria-label={t("a11y.close")} className="shrink-0 rounded-full p-1 text-muted hover:bg-surface">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
