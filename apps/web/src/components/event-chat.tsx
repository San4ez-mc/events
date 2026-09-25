"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MessageCircle, Send, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { getAccessToken } from "@/lib/api-client";
import { useTranslations } from "@/lib/locale-context";

interface Message {
  id: string;
  text: string;
  createdAt: string;
  author: { id: string; name: string | null; avatarUrl: string | null };
  mine: boolean;
}

/**
 * UX §28 — simple group chat for confirmed participants and organizers.
 * Rendered only for people the API lets in (a 403 hides the block entirely);
 * new messages arrive by light polling — no websockets needed for the MVP.
 */
export function EventChat({ eventId }: { eventId: string }) {
  const { t, locale } = useTranslations();
  const { user, isLoading } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [moderator, setModerator] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const lastCount = useRef(0);

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) return;
    const res = await fetch(`/api/v1/events/${eventId}/chat`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 403 || res.status === 401) {
      setAllowed(false);
      return;
    }
    if (!res.ok) return;
    const body = (await res.json()) as {
      items: Message[];
      isModerator: boolean;
    };
    setAllowed(true);
    setModerator(body.isModerator);
    setMessages(body.items);
  }, [eventId]);

  useEffect(() => {
    if (isLoading || !user) return;
    queueMicrotask(() => void load());
    const poll = window.setInterval(() => void load(), 6000);
    // Access can change the moment a registration does (register -> chat appears, cancel -> gone).
    window.addEventListener("kiro:registration-changed", load);
    return () => {
      window.clearInterval(poll);
      window.removeEventListener("kiro:registration-changed", load);
    };
  }, [isLoading, user, load]);

  useEffect(() => {
    if (messages.length > lastCount.current)
      endRef.current?.scrollIntoView({ block: "nearest" });
    lastCount.current = messages.length;
  }, [messages]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const value = text.trim();
    if (!value) return;
    setSending(true);
    try {
      const res = await fetch(`/api/v1/events/${eventId}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getAccessToken() ?? ""}`,
        },
        body: JSON.stringify({ text: value }),
      });
      if (res.ok) {
        const created = (await res.json()) as Message;
        setMessages((m) => [...m, created]);
        setText("");
      }
    } finally {
      setSending(false);
    }
  }

  async function remove(id: string) {
    setMessages((m) => m.filter((x) => x.id !== id));
    await fetch(`/api/v1/events/${eventId}/chat/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${getAccessToken() ?? ""}` },
    }).catch(() => {});
  }

  if (!user || allowed !== true) return null;

  const time = (iso: string) =>
    new Date(iso).toLocaleTimeString(locale === "uk" ? "uk-UA" : "en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <section className="mb-8">
      <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <MessageCircle className="h-4 w-4" aria-hidden="true" />
        {t("chat.title")}
      </h2>
      <div className="flex h-80 flex-col overflow-hidden rounded-2xl border border-border">
        <div className="flex-1 space-y-2 overflow-y-auto p-3">
          {messages.length === 0 && (
            <p className="py-8 text-center text-sm text-muted">
              {t("chat.empty")}
            </p>
          )}
          {messages.map((m) => (
            <div
              key={m.id}
              className={`flex ${m.mine ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`group max-w-[80%] rounded-2xl px-3 py-2 text-sm ${m.mine ? "accent-gradient text-white" : "bg-surface"}`}
              >
                {!m.mine && (
                  <p className="mb-0.5 text-xs font-semibold text-accent">
                    {m.author.name}
                  </p>
                )}
                <p className="whitespace-pre-wrap break-words">{m.text}</p>
                <p
                  className={`mt-0.5 flex items-center justify-end gap-2 text-[10px] ${m.mine ? "text-white/70" : "text-muted"}`}
                >
                  {time(m.createdAt)}
                  {(m.mine || moderator) && (
                    <button
                      type="button"
                      onClick={() => void remove(m.id)}
                      aria-label={t("chat.delete")}
                      className="opacity-0 transition group-hover:opacity-100 focus:opacity-100"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </p>
              </div>
            </div>
          ))}
          <div ref={endRef} />
        </div>
        <form
          onSubmit={send}
          className="flex items-center gap-2 border-t border-border p-2"
        >
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={1000}
            placeholder={t("chat.placeholder")}
            aria-label={t("chat.placeholder")}
            className="h-10 flex-1 rounded-full border border-border bg-background px-4 text-sm outline-none"
          />
          <button
            type="submit"
            disabled={sending || !text.trim()}
            aria-label={t("chat.send")}
            className="accent-gradient flex h-10 w-10 items-center justify-center rounded-full text-white disabled:opacity-40"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>
    </section>
  );
}
