"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth, ApiRequestError } from "@/lib/auth-context";
import { useTranslations } from "@/lib/locale-context";
import { TextField } from "@/components/ui/text-field";
import { Button } from "@/components/ui/button";

export default function RegisterPage() {
  const { register } = useAuth();
  const { t } = useTranslations();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await register({ email, password, name: name || undefined });
      router.push("/organizer/events");
    } catch (err) {
      setError(err instanceof ApiRequestError ? t(`errors.${err.code}`) : t("common.somethingWentWrong"));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-6 px-4 py-16">
      <h1 className="text-2xl font-bold">{t("auth.register.title")}</h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        <TextField label={t("auth.register.name")} value={name} onChange={setName} autoComplete="name" />
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
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}

        <Button type="submit" loading={isSubmitting}>
          {t("auth.register.submit")}
        </Button>
      </form>

      <p className="text-sm text-muted">
        {t("auth.register.hasAccount")}{" "}
        <Link href="/login" className="font-medium text-foreground underline">
          {t("auth.register.signIn")}
        </Link>
      </p>
    </div>
  );
}
