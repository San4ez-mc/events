"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useTranslations } from "@/lib/locale-context";
import { captureEvent } from "@/lib/product-analytics";
import { enableWebPush, isStandaloneApp, refreshWebPushRegistration, webPushSupported } from "@/lib/web-push";

const DISMISSED_KEY = "kiro-webpush-dismissed-at";
const HIDE_DAYS = 14;

/**
 * For people who installed Kiro to their Home Screen: ask once (and not again for two weeks after "later") whether to
 * allow notifications, since that is the only channel that reaches an iPhone user. Signed-in users who already allowed
 * them are quietly re-registered so reminders keep arriving after a new sign-in.
 */
export function WebPushPrompt() {
  const { user, isLoading } = useAuth();
  const { t } = useTranslations();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (isLoading || !user || !webPushSupported()) return;
    if (Notification.permission === "granted") {
      void refreshWebPushRegistration();
      return;
    }
    if (Notification.permission !== "default" || !isStandaloneApp()) return;
    try {
      const at = Number(window.localStorage.getItem(DISMISSED_KEY) ?? 0);
      if (at > 0 && Date.now() - at < HIDE_DAYS * 24 * 60 * 60 * 1000) return;
    } catch {
      // Storage blocked — show it, it just can't be remembered.
    }
    const timer = window.setTimeout(() => {
      setShow(true);
      captureEvent("webpush_prompt_shown");
    }, 6000);
    return () => window.clearTimeout(timer);
  }, [isLoading, user]);

  if (!show) return null;

  const later = () => {
    try {
      window.localStorage.setItem(DISMISSED_KEY, String(Date.now()));
    } catch {
      // ignore
    }
    setShow(false);
  };

  return (
    <div className="fixed inset-x-3 bottom-20 z-40 mx-auto flex max-w-md items-start gap-3 rounded-[14px] border border-border bg-surface p-4 text-sm shadow-lg">
      <div className="flex-1">
        <p className="font-semibold">{t("webpush.title")}</p>
        <p className="mt-1 text-muted">{t("webpush.text")}</p>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={async () => {
              const outcome = await enableWebPush();
              captureEvent("webpush_enable", { outcome, from: "prompt" });
              if (outcome === "denied") later();
              else setShow(false);
            }}
            className="accent-gradient rounded-[10px] px-4 py-2 text-sm font-semibold text-white"
          >
            {t("webpush.enable")}
          </button>
          <button type="button" onClick={later} className="rounded-[10px] border border-border px-4 py-2 text-sm font-semibold">
            {t("webpush.later")}
          </button>
        </div>
      </div>
      <button type="button" onClick={later} aria-label={t("a11y.close")} className="shrink-0 rounded-full p-1 text-muted hover:bg-surface">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
