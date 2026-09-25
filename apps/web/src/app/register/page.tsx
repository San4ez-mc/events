"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth, ApiRequestError } from "@/lib/auth-context";
import { useTranslations } from "@/lib/locale-context";
import { TextField } from "@/components/ui/text-field";
import { Button } from "@/components/ui/button";
import { AuthShell } from "@/components/auth-shell";
import { GoogleSignInButton } from "@/components/google-sign-in-button";

export default function RegisterPage() {
  const { register } = useAuth();
  const { t } = useTranslations();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [emailTaken, setEmailTaken] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setEmailTaken(false);
    setIsSubmitting(true);
    try {
      await register({ email, password, name: name || undefined });
      router.push("/organizer/events");
    } catch (err) {
      setEmailTaken(
        err instanceof ApiRequestError &&
          err.code === "EMAIL_ALREADY_REGISTERED",
      );
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
        <h1 className="text-2xl font-bold">{t("auth.register.title")}</h1>

        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-4"
          noValidate
        >
          <TextField
            label={t("auth.register.name")}
            value={name}
            onChange={setName}
            autoComplete="name"
          />
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
            autoComplete="new-password"
          />

          {error && (
            <div className="flex flex-col gap-2">
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
              {emailTaken && (
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  <Link href="/login" className="font-medium underline">
                    {t("auth.register.signIn")}
                  </Link>
                  <Link
                    href="/forgot-password"
                    className="font-medium underline"
                  >
                    {t("auth.login.forgotPassword")}
                  </Link>
                </div>
              )}
            </div>
          )}

          <Button type="submit" loading={isSubmitting}>
            {t("auth.register.submit")}
          </Button>
        </form>

        <GoogleSignInButton
          onSuccess={() => router.push("/organizer/events")}
        />

        <p className="text-sm text-muted">
          {t("auth.register.hasAccount")}{" "}
          <Link href="/login" className="font-medium text-foreground underline">
            {t("auth.register.signIn")}
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}
