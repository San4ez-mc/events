"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "@/lib/locale-context";
import { getAccessToken } from "@/lib/api-client";
import type { AdminUserSummary, CursorPage } from "@/lib/admin-types";
import { TextField } from "@/components/ui/text-field";

export default function AdminUsersPage() {
  const { t } = useTranslations();
  const [users, setUsers] = useState<AdminUserSummary[] | null>(null);
  const [search, setSearch] = useState("");

  const load = useCallback(async (query: string) => {
    const token = getAccessToken();
    if (!token) return;
    const params = query ? `?search=${encodeURIComponent(query)}` : "";
    const res = await fetch(`/api/v1/admin/users${params}`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) setUsers((await res.json() as CursorPage<AdminUserSummary>).items);
  }, []);

  useEffect(() => {
    queueMicrotask(() => void load(""));
  }, [load]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="mb-6 text-2xl font-bold">{t("admin.users.title")}</h1>

      <div className="mb-6">
        <TextField
          label={t("admin.users.search")}
          value={search}
          onChange={(value) => {
            setSearch(value);
            void load(value);
          }}
        />
      </div>

      {users === null && <p className="text-muted">{t("common.loading")}</p>}

      {users !== null && (
        <ul className="flex flex-col gap-2">
          {users.map((user) => (
            <li key={user.id}>
              <Link
                href={`/admin/users/${user.id}`}
                className="flex items-center justify-between rounded-lg border border-border p-3 text-sm hover:bg-surface"
              >
                <div>
                  <p className="font-medium">{user.name ?? user.nickname ?? user.email}</p>
                  <p className="text-xs text-muted">{user.email}</p>
                </div>
                <div className="text-right text-xs text-muted">
                  <p>{user.role}</p>
                  <p>{user.status}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
