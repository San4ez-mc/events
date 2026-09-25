"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth, ApiRequestError } from "@/lib/auth-context";
import { useTranslations } from "@/lib/locale-context";

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
const GSI_SRC = "https://accounts.google.com/gsi/client";

interface GsiWindow {
  google?: {
    accounts: {
      id: {
        initialize: (config: {
          client_id: string;
          callback: (response: { credential: string }) => void;
        }) => void;
        renderButton: (
          parent: HTMLElement,
          options: Record<string, unknown>,
        ) => void;
      };
    };
  };
}

function loadGsi(): Promise<void> {
  return new Promise((resolve, reject) => {
    if ((window as unknown as GsiWindow).google) return resolve();
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${GSI_SRC}"]`,
    );
    const script = existing ?? document.createElement("script");
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener(
      "error",
      () => reject(new Error("gsi load failed")),
      { once: true },
    );
    if (!existing) {
      script.src = GSI_SRC;
      script.async = true;
      document.head.appendChild(script);
    }
  });
}

/** §9 — "Continue with Google". Hidden entirely when no client ID is configured. */
export function GoogleSignInButton({ onSuccess }: { onSuccess: () => void }) {
  const { loginWithGoogle } = useAuth();
  const { t, locale } = useTranslations();
  const container = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!CLIENT_ID) return;
    let cancelled = false;
    loadGsi()
      .then(() => {
        const gsi = (window as unknown as GsiWindow).google;
        if (cancelled || !gsi || !container.current) return;
        gsi.accounts.id.initialize({
          client_id: CLIENT_ID,
          callback: ({ credential }) => {
            setError(null);
            loginWithGoogle(credential)
              .then(onSuccess)
              .catch((err) =>
                setError(
                  err instanceof ApiRequestError
                    ? t(`errors.${err.code}`)
                    : t("common.somethingWentWrong"),
                ),
              );
          },
        });
        gsi.accounts.id.renderButton(container.current, {
          theme: "outline",
          size: "large",
          shape: "pill",
          text: "continue_with",
          locale,
          width: container.current.offsetWidth || 320,
        });
      })
      .catch(() => setError(t("common.somethingWentWrong")));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initialise the Google button once per mount/locale
  }, [locale]);

  if (!CLIENT_ID) return null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3 text-xs text-muted">
        <span className="h-px flex-1 bg-border" />
        {t("auth.orContinueWith")}
        <span className="h-px flex-1 bg-border" />
      </div>
      <div ref={container} className="flex min-h-11 justify-center" />
      {error && (
        <p role="alert" className="text-center text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
