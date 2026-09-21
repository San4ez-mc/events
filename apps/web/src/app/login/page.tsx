"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth, ApiRequestError } from "@/lib/auth-context";
import { useTranslations } from "@/lib/locale-context";
import { TextField } from "@/components/ui/text-field";
import { Button } from "@/components/ui/button";

export default function LoginPage() {
  const { login } = useAuth();
  const { t } = useTranslations();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await login(email, password);
      router.push(searchParams.get("next") ?? "/organizer/events");
    } catch (err) {
      setError(err instanceof ApiRequestError ? t(`errors.${err.code}`) : t("common.somethingWentWrong"));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-6 px-4 py-16">
      <h1 className="text-2xl font-bold">{t("auth.login.title")}</h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
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
          <Link href="/register" className="font-medium text-foreground underline">
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
  );
}
