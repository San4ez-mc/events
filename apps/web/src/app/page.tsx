"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useTranslations } from "@/lib/locale-context";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  const { user } = useAuth();
  const { locale } = useTranslations();

  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center gap-6 px-4 py-24 text-center">
      <h1 className="text-4xl font-extrabold accent-gradient-text">Кіро</h1>
      <p className="max-w-md text-lg text-muted">
        {locale === "uk"
          ? "Платформа пошуку подій та розваг. Гортай, обирай, записуйся."
          : "A platform for finding events and things to do. Swipe, pick, register."}
      </p>
      <p className="max-w-md text-sm text-muted">
        {locale === "uk"
          ? "Стрічка подій у розробці. Поки що ви можете створити подію як організатор."
          : "The discovery feed is under construction. For now you can create an event as an organizer."}
      </p>
      <Link href={user ? "/organizer/events" : "/register"}>
        <Button>
          {locale === "uk" ? "Створити подію" : "Create an event"}
        </Button>
      </Link>
    </div>
  );
}
