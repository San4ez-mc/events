"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { EventWizard } from "@/components/event-wizard/event-wizard";

export default function NewEventPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !user) router.replace("/login?next=/organizer/events/new");
  }, [isLoading, user, router]);

  if (isLoading || !user) return null;

  return <EventWizard />;
}
