"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useTranslations } from "@/lib/locale-context";
import { getAccessToken } from "@/lib/api-client";
import type { AdminUserDetail } from "@/lib/admin-types";
import { Button } from "@/components/ui/button";

const STATUSES = ["ACTIVE", "SUSPENDED", "BLOCKED", "DELETED"] as const;
const ROLES = ["USER", "MODERATOR", "ADMIN", "SUPER_ADMIN"] as const;

export default function AdminUserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user: viewer } = useAuth();
  const { t, locale } = useTranslations();
  const [detail, setDetail] = useState<AdminUserDetail | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) return;
    const res = await fetch(`/api/v1/admin/users/${id}`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) setDetail(await res.json());
  }, [id]);

  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  async function setStatus(status: string) {
    const token = getAccessToken();
    if (!token) return;
    setBusy(true);
    try {
      await fetch(`/api/v1/admin/users/${id}/status`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function setRole(role: string) {
    const token = getAccessToken();
    if (!token) return;
    setBusy(true);
    try {
      await fetch(`/api/v1/admin/users/${id}/role`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (detail === null) return <div className="mx-auto max-w-2xl px-4 py-10 text-muted">{t("common.loading")}</div>;

  const isSuperAdmin = viewer?.role === "SUPER_ADMIN";

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="mb-2 text-2xl font-bold">{detail.name ?? detail.nickname ?? detail.email}</h1>
      <p className="mb-6 text-sm text-muted">{detail.email}</p>

      <div className="mb-6 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div className="rounded-lg border border-border p-3 text-center">
          <p className="text-lg font-bold">{detail.eventsCount}</p>
          <p className="text-xs text-muted">{t("admin.users.eventsCount")}</p>
        </div>
        <div className="rounded-lg border border-border p-3 text-center">
          <p className="text-lg font-bold">{detail.registrationsCount}</p>
          <p className="text-xs text-muted">{t("admin.users.registrationsCount")}</p>
        </div>
        <div className="rounded-lg border border-border p-3 text-center">
          <p className="text-xs font-medium">{new Date(detail.createdAt).toLocaleDateString(locale === "uk" ? "uk-UA" : "en-US")}</p>
          <p className="text-xs text-muted">{t("admin.users.memberSince")}</p>
        </div>
        <div className="rounded-lg border border-border p-3 text-center">
          <p className="text-xs font-medium">
            {detail.lastLoginAt ? new Date(detail.lastLoginAt).toLocaleDateString(locale === "uk" ? "uk-UA" : "en-US") : t("admin.users.never")}
          </p>
          <p className="text-xs text-muted">{t("admin.users.lastLogin")}</p>
        </div>
      </div>

      <section className="mb-6">
        <h2 className="mb-2 text-sm font-semibold">{t("admin.users.setStatus")}</h2>
        <div className="flex flex-wrap gap-2">
          {STATUSES.map((status) => (
            <Button
              key={status}
              variant={detail.status === status ? "primary" : "secondary"}
              disabled={busy}
              onClick={() => void setStatus(status)}
            >
              {status}
            </Button>
          ))}
        </div>
      </section>

      {isSuperAdmin && (
        <section>
          <h2 className="mb-2 text-sm font-semibold">{t("admin.users.changeRole")}</h2>
          <div className="flex flex-wrap gap-2">
            {ROLES.map((role) => (
              <Button
                key={role}
                variant={detail.role === role ? "primary" : "secondary"}
                disabled={busy}
                onClick={() => void setRole(role)}
              >
                {role}
              </Button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
