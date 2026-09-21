"use client";

import { useState } from "react";
import { useTranslations } from "@/lib/locale-context";
import { TextField } from "@/components/ui/text-field";
import { Button } from "@/components/ui/button";

export default function ForgotPasswordPage() {
  const { t } = useTranslations();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      // §9 — response is identical whether the email exists or not, so the
      // frontend never learns anything from a difference in error handling here.
      await fetch("/api/v1/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
    } finally {
      setIsSubmitting(false);
      setSent(true);
    }
  }

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-6 px-4 py-16">
      <h1 className="text-2xl font-bold">{t("auth.forgotPassword.title")}</h1>

      {sent ? (
        <p className="text-sm text-muted">{t("auth.forgotPassword.sent")}</p>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          <TextField
            label={t("auth.login.email")}
            type="email"
            value={email}
            onChange={setEmail}
            required
            autoComplete="email"
          />
          <Button type="submit" loading={isSubmitting}>
            {t("auth.forgotPassword.submit")}
          </Button>
        </form>
      )}
    </div>
  );
}
