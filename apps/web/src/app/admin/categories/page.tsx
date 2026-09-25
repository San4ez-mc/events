"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "@/lib/locale-context";
import { getAccessToken } from "@/lib/api-client";
import { Button } from "@/components/ui/button";

interface AdminCategory {
  id: string;
  parentId: string | null;
  nameUk: string;
  nameEn: string;
  status: "ACTIVE" | "PENDING" | "MERGED" | "HIDDEN" | "ARCHIVED";
  source: string;
}

const STATUSES = ["ACTIVE", "PENDING", "HIDDEN", "ARCHIVED"] as const;

/** §76 — every category incl. user-suggested ones awaiting approval: approve/hide, rename, merge into another. */
export default function AdminCategoriesPage() {
  const { t } = useTranslations();
  const [items, setItems] = useState<AdminCategory[] | null>(null);
  const [editing, setEditing] = useState<{
    id: string;
    nameUk: string;
    nameEn: string;
  } | null>(null);
  const [mergeFrom, setMergeFrom] = useState<string | null>(null);
  const [mergeTo, setMergeTo] = useState("");
  const [error, setError] = useState(false);

  const auth = () => ({
    Authorization: `Bearer ${getAccessToken() ?? ""}`,
    "Content-Type": "application/json",
  });

  const load = useCallback(async () => {
    const res = await fetch("/api/v1/admin/categories", { headers: auth() });
    if (res.ok) setItems(await res.json());
    else setError(true);
  }, []);

  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  async function send(url: string, method: string, body: unknown) {
    setError(false);
    const res = await fetch(url, {
      method,
      headers: auth(),
      body: JSON.stringify(body),
    });
    if (!res.ok) setError(true);
    await load();
    return res.ok;
  }

  const pending = (items ?? []).filter((c) => c.status === "PENDING");
  const rest = (items ?? []).filter((c) => c.status !== "PENDING");
  const mergeable = (items ?? []).filter(
    (c) => c.status === "ACTIVE" && c.id !== mergeFrom,
  );

  function row(c: AdminCategory) {
    const isEditing = editing?.id === c.id;
    return (
      <li
        key={c.id}
        className="flex flex-col gap-2 rounded-2xl border border-border p-3 text-sm"
      >
        {isEditing ? (
          <div className="flex flex-wrap gap-2">
            <input
              value={editing.nameUk}
              onChange={(e) =>
                setEditing({ ...editing, nameUk: e.target.value })
              }
              aria-label="UK"
              className="min-w-0 flex-1 rounded-md border border-border bg-background px-3 py-2"
            />
            <input
              value={editing.nameEn}
              onChange={(e) =>
                setEditing({ ...editing, nameEn: e.target.value })
              }
              aria-label="EN"
              className="min-w-0 flex-1 rounded-md border border-border bg-background px-3 py-2"
            />
            <Button
              onClick={async () => {
                if (
                  await send(`/api/v1/admin/categories/${c.id}`, "PATCH", {
                    nameUk: editing.nameUk,
                    nameEn: editing.nameEn,
                  })
                )
                  setEditing(null);
              }}
            >
              {t("common.save")}
            </Button>
            <Button variant="secondary" onClick={() => setEditing(null)}>
              {t("common.cancel")}
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>
              {c.parentId ? "— " : ""}
              <strong>{c.nameUk}</strong>{" "}
              <span className="text-muted">/ {c.nameEn}</span>
              {c.source === "USER_CREATED" && (
                <span className="ml-2 rounded-full bg-surface px-2 py-0.5 text-xs">
                  user
                </span>
              )}
            </span>
            <span className="flex flex-wrap items-center gap-2">
              {c.status === "MERGED" ? (
                <span className="text-xs text-muted">MERGED</span>
              ) : (
                <>
                  {c.status === "PENDING" && (
                    <Button
                      onClick={() =>
                        void send(`/api/v1/admin/categories/${c.id}`, "PATCH", {
                          status: "ACTIVE",
                        })
                      }
                    >
                      {t("admin.categories.approve")}
                    </Button>
                  )}
                  <select
                    value={c.status}
                    onChange={(e) =>
                      void send(`/api/v1/admin/categories/${c.id}`, "PATCH", {
                        status: e.target.value,
                      })
                    }
                    aria-label={t("admin.users.status")}
                    className="rounded-md border border-border bg-background px-2 py-1.5 text-xs"
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  <Button
                    variant="secondary"
                    onClick={() =>
                      setEditing({
                        id: c.id,
                        nameUk: c.nameUk,
                        nameEn: c.nameEn,
                      })
                    }
                  >
                    {t("admin.categories.rename")}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setMergeFrom(c.id);
                      setMergeTo("");
                    }}
                  >
                    {t("admin.categories.merge")}
                  </Button>
                </>
              )}
            </span>
          </div>
        )}
        {mergeFrom === c.id && (
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={mergeTo}
              onChange={(e) => setMergeTo(e.target.value)}
              className="rounded-md border border-border bg-background px-2 py-1.5 text-xs"
              aria-label={t("admin.categories.targetId")}
            >
              <option value="">{t("admin.categories.targetId")}</option>
              {mergeable.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nameUk}
                </option>
              ))}
            </select>
            <Button
              disabled={!mergeTo}
              onClick={async () => {
                if (
                  await send(`/api/v1/admin/categories/${c.id}/merge`, "POST", {
                    targetCategoryId: mergeTo,
                  })
                )
                  setMergeFrom(null);
              }}
            >
              {t("admin.categories.merge")}
            </Button>
            <Button variant="secondary" onClick={() => setMergeFrom(null)}>
              {t("common.cancel")}
            </Button>
          </div>
        )}
      </li>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="mb-6 text-2xl font-bold">{t("admin.categories.title")}</h1>
      {error && (
        <p className="mb-3 text-sm text-danger">
          {t("common.somethingWentWrong")}
        </p>
      )}
      {items === null && !error && (
        <p className="text-muted">{t("common.loading")}</p>
      )}

      {pending.length > 0 && (
        <>
          <h2 className="mb-3 text-sm font-semibold">
            {t("admin.categories.pending")}
          </h2>
          <ul className="mb-8 flex flex-col gap-2">{pending.map(row)}</ul>
        </>
      )}
      <ul className="flex flex-col gap-2">{rest.map(row)}</ul>
    </div>
  );
}
