"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "@/lib/locale-context";
import { TextField } from "@/components/ui/text-field";
import { Button } from "@/components/ui/button";

function ResetPasswordForm() {
  const { t } = useTranslations();
  const token = useSearchParams().get("token");

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError(t("auth.resetPassword.mismatch"));
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/v1/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      if (res.ok) {
        setDone(true);
      } else if (res.status === 400 || res.status === 401 || res.status === 404) {
        setError(t("auth.resetPassword.invalidLink"));
      } else {
        setError(t("common.somethingWentWrong"));
      }
    } catch {
      setError(t("common.somethingWentWrong"));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!token) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-danger">{t("auth.resetPassword.invalidLink")}</p>
        <Link href="/forgot-password" className="text-sm font-medium underline">
          {t("auth.resetPassword.requestNew")}
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-success">{t("auth.resetPassword.success")}</p>
        <Link href="/login" className="accent-gradient rounded-md px-4 py-2 text-center text-sm font-semibold text-white">
          {t("auth.login.title")}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <TextField
        label={t("auth.resetPassword.password")}
        type="password"
        value={password}
        onChange={setPassword}
        required
        autoComplete="new-password"
      />
      <TextField
        label={t("auth.resetPassword.confirm")}
        type="password"
        value={confirm}
        onChange={setConfirm}
        required
        autoComplete="new-password"
      />
      <p className="text-xs text-muted">{t("auth.resetPassword.hint")}</p>

      {error && (
        <div className="flex flex-col gap-2">
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
          {error === t("auth.resetPassword.invalidLink") && (
            <Link href="/forgot-password" className="text-sm font-medium underline">
              {t("auth.resetPassword.requestNew")}
            </Link>
          )}
        </div>
      )}

      <Button type="submit" loading={isSubmitting}>
        {t("auth.resetPassword.submit")}
      </Button>
    </form>
  );
}

export default function ResetPasswordPage() {
  const { t } = useTranslations();
  return (
    <div className="mx-auto flex max-w-sm flex-col gap-6 px-4 py-16">
      <h1 className="text-2xl font-bold">{t("auth.resetPassword.title")}</h1>
      <Suspense fallback={null}>
        <ResetPasswordForm />
      </Suspense>
    </div>
  );
}
