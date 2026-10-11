"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IoChatbubbles } from "react-icons/io5";
import { useAuth } from "@/lib/auth-context";
import { useTranslations } from "@/lib/locale-context";
import { getAccessToken } from "@/lib/api-client";
import { personName, type InquiryListItem } from "@/lib/inbox-types";
import { EmptyState, ScreenHeader } from "@/components/ui/screen-header";
import { Spinner } from "@/components/ui/spinner";

/** Conversations with organizers (as an asker) and questions people sent to your events (as an organizer). */
export function InboxList() {
  const { t, locale } = useTranslations();
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<InquiryListItem[] | null>(null);

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.replace("/login?next=/inbox");
      return;
    }
    let cancelled = false;
    const load = async () => {
      const res = await fetch("/api/v1/inquiries", { headers: { Authorization: `Bearer ${getAccessToken() ?? ""}` } }).catch(() => null);
      if (res?.ok && !cancelled) setItems((await res.json()) as InquiryListItem[]);
    };
    void load();
    const timer = window.setInterval(() => void load(), 20000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [isLoading, user, router]);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-6 pb-24 sm:py-10">
      <ScreenHeader title={t("inbox.title")} subtitle={t("inbox.subtitle")} Icon={IoChatbubbles} />
      {items === null && <Spinner />}
      {items?.length === 0 && <EmptyState Icon={IoChatbubbles} text={t("inbox.empty")} />}
      <div className="flex flex-col gap-2.5">
        {items?.map((i) => (
          <Link key={i.id} href={`/inbox/${i.id}`} className="flex gap-3 rounded-[14px] border border-border bg-surface p-3.5 transition hover:border-[var(--accent-from)]/50">
            <span className="accent-gradient flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-lg font-bold text-white">
              {(personName(i.counterpart) || "?").slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate font-semibold">{personName(i.counterpart)}</p>
                <span className="shrink-0 text-xs text-muted">{new Date(i.lastMessageAt).toLocaleDateString(locale === "uk" ? "uk-UA" : "en-GB", { day: "numeric", month: "short" })}</span>
              </div>
              <p className="truncate text-xs text-muted">
                {i.role === "ORGANIZER" ? t("inbox.withAsker") : t("inbox.withOrganizer")} · {i.event.title}
              </p>
              {i.lastMessage && (
                <p className={`truncate text-sm ${i.unread > 0 ? "font-semibold" : "text-muted"}`}>
                  {i.lastMessage.mine ? `${t("inbox.you")}: ` : ""}
                  {i.lastMessage.text}
                </p>
              )}
            </div>
            {i.unread > 0 && <span className="self-center rounded-full bg-[var(--accent-to)] px-2 py-0.5 text-xs font-bold text-white">{t("inbox.unread")}</span>}
          </Link>
        ))}
      </div>
    </div>
  );
}
