"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "@/lib/locale-context";
import { captureEvent } from "@/lib/product-analytics";
import { Button } from "@/components/ui/button";
import { enableWebPush, needsInstallForPush, webPushSupported } from "@/lib/web-push";

/** Profile switch for browser notifications. On iPhone it explains that the site has to be on the Home Screen first. */
export function WebPushToggle() {
  const { t } = useTranslations();
  const [state, setState] = useState<"hidden" | "off" | "on" | "denied" | "install" | "busy">("hidden");

  useEffect(() => {
    queueMicrotask(() => {
      if (/iPhone|iPad|iPod/.test(navigator.userAgent) && needsInstallForPush()) return setState("install");
      if (!webPushSupported()) return setState("hidden");
      setState(Notification.permission === "granted" ? "on" : Notification.permission === "denied" ? "denied" : "off");
    });
  }, []);

  if (state === "hidden") return null;
  return (
    <div className="flex flex-col gap-2 rounded-[14px] border border-border bg-surface p-4 text-sm">
      <p className="font-semibold">{t("webpush.title")}</p>
      {state === "on" && <p className="text-success">{t("webpush.on")}</p>}
      {state === "denied" && <p className="text-muted">{t("webpush.denied")}</p>}
      {state === "install" && <p className="text-muted">{t("webpush.iosInstall")}</p>}
      {(state === "off" || state === "busy") && (
        <>
          <p className="text-muted">{t("webpush.text")}</p>
          <div>
            <Button
              loading={state === "busy"}
              onClick={async () => {
                setState("busy");
                const outcome = await enableWebPush();
                captureEvent("webpush_enable", { outcome, from: "profile" });
                setState(outcome === "ok" ? "on" : outcome === "denied" ? "denied" : "off");
              }}
            >
              {t("webpush.enable")}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
