"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IoSend } from "react-icons/io5";
import { useAuth } from "@/lib/auth-context";
import { useTranslations } from "@/lib/locale-context";
import { getAccessToken } from "@/lib/api-client";
import { personName, type InquiryByEvent, type InquiryThread } from "@/lib/inbox-types";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

const auth = () => ({ Authorization: `Bearer ${getAccessToken() ?? ""}`, "Content-Type": "application/json" });

/**
 * One conversation. Opened with `inquiryId` it shows the thread (and polls for new messages); opened with `eventId`
 * it first looks for the person's existing conversation about that event, or shows the box for the first question.
 */
export function InquiryView({ inquiryId, eventId }: { inquiryId?: string; eventId?: string }) {
  const { t } = useTranslations();
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const [thread, setThread] = useState<InquiryThread | null>(null);
  const [byEvent, setByEvent] = useState<InquiryByEvent | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadThread = useCallback(async (id: string) => {
    const res = await fetch(`/api/v1/inquiries/${id}`, { headers: auth() }).catch(() => null);
    if (res?.ok) setThread((await res.json()) as InquiryThread);
  }, []);

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.replace(`/login?next=${encodeURIComponent(window.location.pathname)}`);
      return;
    }
    let timer: number | undefined;
    (async () => {
      if (inquiryId) {
        await loadThread(inquiryId);
        timer = window.setInterval(() => void loadThread(inquiryId), 12000);
      } else if (eventId) {
        const res = await fetch(`/api/v1/inquiries/by-event/${eventId}`, { headers: auth() }).catch(() => null);
        if (!res?.ok) return;
        const body = (await res.json()) as InquiryByEvent;
        if (body.id) router.replace(`/inbox/${body.id}`);
        else setByEvent(body);
      }
    })();
    return () => window.clearInterval(timer);
  }, [isLoading, user, inquiryId, eventId, router, loadThread]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [thread?.messages.length]);

  async function send() {
    const value = text.trim();
    if (!value || sending) return;
    setSending(true);
    setError(null);
    try {
      const url = inquiryId ? `/api/v1/inquiries/${inquiryId}/messages` : `/api/v1/events/${eventId}/inquiries`;
      const res = await fetch(url, { method: "POST", headers: auth(), body: JSON.stringify({ text: value }) });
      if (!res.ok) {
        const code = ((await res.json().catch(() => null)) as { error?: { code?: string } } | null)?.error?.code;
        setError(code === "USER_BLOCKED" ? t("inbox.blocked") : t("inbox.failed"));
        return;
      }
      setText("");
      const body = (await res.json()) as { id: string };
      if (inquiryId) await loadThread(inquiryId);
      else router.replace(`/inbox/${body.id}`);
    } finally {
      setSending(false);
    }
  }

  const composer = (
    <form
      className="flex items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        void send();
      }}
    >
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={1000}
        rows={2}
        placeholder={t("inbox.placeholder")}
        className="min-w-0 flex-1 rounded-[10px] border border-border bg-surface px-3.5 py-2.5 text-[15px] outline-none focus:border-[var(--accent-from)]"
      />
      <Button type="submit" loading={sending} disabled={!text.trim()} aria-label={t("inbox.send")}>
        <IoSend className="h-5 w-5" aria-hidden="true" />
      </Button>
    </form>
  );

  // First question about an event
  if (!inquiryId) {
    if (!byEvent) return <Spinner />;
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-6 pb-24 sm:py-10">
        <h1 className="text-2xl font-extrabold">{t("inbox.writeTitle")}</h1>
        <Link href={`/events/${byEvent.event.slug}`} className="rounded-[14px] border border-border bg-surface p-3.5 text-sm hover:border-[var(--accent-from)]/50">
          <span className="text-muted">{t("inbox.aboutEvent")}: </span>
          <b>{byEvent.event.title}</b>
        </Link>
        {byEvent.isOwner ? (
          <p className="text-muted">{t("inbox.yourEvent")}</p>
        ) : byEvent.event.registrationMode === "EXTERNAL" && byEvent.event.externalRegistrationUrl ? (
          <>
            <p className="text-muted">{t("inbox.externalHint")}</p>
            <a href={byEvent.event.externalRegistrationUrl} target="_blank" rel="noopener noreferrer">
              <Button className="w-full">{t("inbox.askOnSite")}</Button>
            </a>
          </>
        ) : (
          <>
            <p className="text-sm text-muted">{t("inbox.startHint")}</p>
            {composer}
            {error && <p role="alert" className="text-sm text-danger">{error}</p>}
          </>
        )}
      </div>
    );
  }

  if (!thread) return <Spinner />;
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-6 pb-24 sm:py-10">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-extrabold">{personName(thread.counterpart)}</h1>
        <Link href={`/events/${thread.event.slug}`} className="text-sm text-[var(--accent-from)] hover:underline">
          {thread.event.title}
        </Link>
      </div>
      <div className="flex flex-col gap-2 rounded-[14px] border border-border bg-surface p-3">
        {thread.messages.map((m) => (
          <div key={m.id} className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-[15px] ${m.mine ? "accent-gradient self-end text-white" : "self-start bg-background"}`}>
            {m.text}
            <span className={`mt-1 block text-[11px] ${m.mine ? "text-white/70" : "text-muted"}`}>
              {new Date(m.createdAt).toLocaleString("uk-UA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      {composer}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </div>
  );
}
