"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth, ApiRequestError } from "@/lib/auth-context";
import { useTranslations } from "@/lib/locale-context";
import { TextField } from "@/components/ui/text-field";
import { Button } from "@/components/ui/button";
import { AuthShell } from "@/components/auth-shell";
import { GoogleSignInButton } from "@/components/google-sign-in-button";

export default function LoginPage() {
  const { login } = useAuth();
  const { t } = useTranslations();
  const router = useRouter();
  const searchParams = useSearchParams();

  const reasonKey = searchParams.get("reason");
  const reason = reasonKey && ["save", "going", "register"].includes(reasonKey) ? t(`auth.login.reason_${reasonKey}`) : null;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await login(email, password, rememberMe);
      router.push(searchParams.get("next") ?? "/");
    } catch (err) {
      setError(
        err instanceof ApiRequestError
          ? t(`errors.${err.code}`)
          : t("common.somethingWentWrong"),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthShell>
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-bold">{t("auth.login.title")}</h1>
        {reason && <p className="-mt-3 text-sm text-muted">{reason}</p>}

        {/* One tap first: most visitors arrive on a phone with a Google account already signed in. */}
        <GoogleSignInButton onSuccess={() => router.push(searchParams.get("next") ?? "/")} />
        <p className="-my-2 text-center text-xs uppercase tracking-wide text-muted">{t("auth.login.or")}</p>

        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-4"
          noValidate
        >
          <TextField
            label={t("auth.login.email")}
            type="email"
            value={email}
            onChange={setEmail}
            required
            autoComplete="email"
          />
          <TextField
            label={t("auth.login.password")}
            type="password"
            value={password}
            onChange={setPassword}
            required
            autoComplete="current-password"
          />

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="h-4 w-4 accent-[var(--accent-from)]"
            />
            {t("auth.login.rememberMe")}
          </label>

          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}

          <Button type="submit" loading={isSubmitting}>
            {t("auth.login.submit")}
          </Button>
        </form>

        <div className="flex flex-col gap-2 text-sm text-muted">
          <p>
            {t("auth.login.noAccount")}{" "}
            <Link
              href="/register"
              className="font-medium text-foreground underline"
            >
              {t("auth.login.signUp")}
            </Link>
          </p>
          <p>
            <Link href="/forgot-password" className="underline">
              {t("auth.login.forgotPassword")}
            </Link>
          </p>
        </div>
      </div>
    </AuthShell>
  );
}
