"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useTranslations } from "@/lib/locale-context";
import { captureEvent, getStoredConsent } from "@/lib/product-analytics";

const DISMISSED_KEY = "kiro-pwa-hint-dismissed-at";
const WAITLIST_KEY = "kiro-ios-waitlist-joined";
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
  const [safari, setSafari] = useState(false);
  const [email, setEmail] = useState("");
  const [waitState, setWaitState] = useState<"idle" | "sending" | "done" | "error">("idle");

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

    let alreadyJoined = false;
    try {
      alreadyJoined = window.localStorage.getItem(WAITLIST_KEY) === "1";
    } catch {
      // ignore
    }

    const timer = window.setTimeout(() => {
      if (dismissedRecently || !consentSettled) return;
      // Every iPhone visitor (Safari or an in-app browser such as Threads/Instagram) can leave an email for the iOS app;
      // only Safari can also add the site to the Home Screen. Half the mobile visitors are on iPhone and have no app.
      if (isIos && !alreadyJoined) {
        setSafari(isSafari);
        setShow(true);
        captureEvent("pwa_hint_shown", { os: "ios", safari: isSafari });
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

  async function join() {
    setWaitState("sending");
    const res = await fetch("/api/v1/waitlist/ios", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, source: safari ? "pwa-hint-safari" : "pwa-hint-inapp" }),
    }).catch(() => null);
    if (res?.ok) {
      try {
        window.localStorage.setItem(WAITLIST_KEY, "1");
      } catch {
        // ignore
      }
      captureEvent("ios_waitlist_joined", { safari });
      setWaitState("done");
      window.setTimeout(() => setShow(false), 2500);
    } else {
      setWaitState("error");
    }
  }

  return (
    <div className="fixed inset-x-3 bottom-20 z-40 mx-auto flex max-w-md items-start gap-3 rounded-[14px] border border-border bg-surface p-4 text-sm shadow-lg sm:hidden">
      <div className="flex-1">
        <p className="font-semibold">{t("pwa.waitTitle")}</p>
        {waitState === "done" ? (
          <p className="mt-1 text-muted">{t("pwa.waitThanks")}</p>
        ) : (
          <>
            <p className="mt-1 text-muted">{t("pwa.waitText")}</p>
            <form
              className="mt-2 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void join();
              }}
            >
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("pwa.waitPlaceholder")}
                className="min-w-0 flex-1 rounded-[10px] border border-border bg-background px-3 py-2 text-[15px] outline-none focus:border-[var(--accent-from)]"
              />
              <button type="submit" disabled={waitState === "sending"} className="accent-gradient shrink-0 rounded-[10px] px-3 text-sm font-semibold text-white disabled:opacity-60">
                {t("pwa.waitButton")}
              </button>
            </form>
            {waitState === "error" && <p className="mt-1 text-xs text-danger">{t("pwa.waitError")}</p>}
            {safari && <p className="mt-3 text-xs text-muted">{t("pwa.iosSteps")}</p>}
          </>
        )}
      </div>
      <button type="button" onClick={dismiss} aria-label={t("a11y.close")} className="shrink-0 rounded-full p-1 text-muted hover:bg-surface">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
