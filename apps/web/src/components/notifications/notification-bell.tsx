"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useTranslations } from "@/lib/locale-context";
import { getAccessToken } from "@/lib/api-client";
import type { CursorPage } from "@/lib/event-types";
import type { AppNotification } from "@/lib/notification-types";

const ORGANIZER_TYPES = new Set(["REGISTRATION_RECEIVED", "PAYMENT_PENDING", "EVENT_MIN_PARTICIPANTS_WARNING"]);
const ATTENDEE_TYPES = new Set([
  "REGISTRATION_APPROVED",
  "REGISTRATION_REJECTED",
  "PAYMENT_CONFIRMED",
  "WAITLIST_SPOT_OPENED",
  "EVENT_CHANGED",
  "EVENT_CANCELLED",
  "EVENT_REMINDER_24H",
  "EVENT_REMINDER_1H",
]);

/** No deep link to the specific event yet (payload only carries an id, not a slug) — routes to the relevant list instead. */
function linkFor(notification: AppNotification): string | null {
  if (ORGANIZER_TYPES.has(notification.type)) return "/organizer/events";
  if (ATTENDEE_TYPES.has(notification.type)) return "/my-registrations";
  return null;
}

/** §40/§115 Phase 5 — in-app notification bell: unread badge + recent list, polled (no real-time transport yet). */
export function NotificationBell() {
  const { t, locale } = useTranslations();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [items, setItems] = useState<AppNotification[] | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;
    async function poll() {
      const token = getAccessToken();
      if (!token) return;
      const res = await fetch("/api/v1/notifications/unread-count", { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setUnreadCount((await res.json()).count);
    }
    void poll();
    const interval = setInterval(() => void poll(), 60_000);
    return () => clearInterval(interval);
  }, [user]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  async function toggleOpen() {
    const next = !open;
    setOpen(next);
    if (next && items === null) {
      const token = getAccessToken();
      if (!token) return;
      const res = await fetch("/api/v1/notifications", { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const body = (await res.json()) as CursorPage<AppNotification>;
        setItems(body.items);
      }
    }
  }

  async function markRead(id: string) {
    const token = getAccessToken();
    if (!token) return;
    setItems((prev) => prev?.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n)) ?? null);
    setUnreadCount((c) => Math.max(0, c - 1));
    await fetch(`/api/v1/notifications/${id}/read`, { method: "PATCH", headers: { Authorization: `Bearer ${token}` } });
  }

  async function markAllRead() {
    const token = getAccessToken();
    if (!token) return;
    setItems((prev) => prev?.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })) ?? null);
    setUnreadCount(0);
    await fetch("/api/v1/notifications/read-all", { method: "PATCH", headers: { Authorization: `Bearer ${token}` } });
  }

  if (!user) return null;

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => void toggleOpen()}
        className="relative flex h-8 w-8 items-center justify-center rounded-full hover:bg-surface"
        aria-label={t("nav.notifications")}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        🔔
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 max-h-96 w-80 overflow-y-auto rounded-lg border border-border bg-background py-2 shadow-lg"
        >
          <div className="flex items-center justify-between px-3 pb-2">
            <span className="text-sm font-semibold">{t("nav.notifications")}</span>
            {unreadCount > 0 && (
              <button type="button" onClick={() => void markAllRead()} className="text-xs text-muted hover:underline">
                {t("notifications.markAllRead")}
              </button>
            )}
          </div>

          {items === null && <p className="px-3 py-4 text-center text-sm text-muted">{t("common.loading")}</p>}
          {items !== null && items.length === 0 && (
            <p className="px-3 py-4 text-center text-sm text-muted">{t("common.empty")}</p>
          )}

          {items?.map((notification) => {
            const href = linkFor(notification);
            const content = (
              <div className={`flex flex-col gap-0.5 px-3 py-2 text-sm ${!notification.readAt ? "bg-surface" : ""}`}>
                <span className="font-medium">{notification.title}</span>
                <span className="text-xs text-muted">{notification.body}</span>
                <span className="text-[10px] text-muted">
                  {new Date(notification.createdAt).toLocaleString(locale === "uk" ? "uk-UA" : "en-US")}
                </span>
              </div>
            );
            return (
              <button
                key={notification.id}
                type="button"
                onClick={() => {
                  if (!notification.readAt) void markRead(notification.id);
                  setOpen(false);
                }}
                className="block w-full text-left hover:bg-surface"
              >
                {href ? <Link href={href}>{content}</Link> : content}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
