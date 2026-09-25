"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "@/lib/locale-context";
import { getAccessToken } from "@/lib/api-client";
import { Button } from "@/components/ui/button";

interface City {
  id: string;
  nameUk: string;
}
interface AdminDistrict {
  id: string;
  cityId: string;
  nameUk: string;
  nameEn: string | null;
  status: "ACTIVE" | "PENDING" | "MERGED" | "ARCHIVED";
  source: string;
}

const STATUSES = ["ACTIVE", "PENDING", "ARCHIVED"] as const;

/** §37/§77 — community-suggested districts wait here for approval; admins can also rename, archive or merge. */
export default function AdminDistrictsPage() {
  const { t } = useTranslations();
  const [cities, setCities] = useState<City[]>([]);
  const [cityId, setCityId] = useState("");
  const [items, setItems] = useState<AdminDistrict[] | null>(null);
  const [editing, setEditing] = useState<{
    id: string;
    nameUk: string;
    nameEn: string;
  } | null>(null);
  const [mergeFrom, setMergeFrom] = useState<string | null>(null);
  const [mergeTo, setMergeTo] = useState("");
  const [error, setError] = useState(false);

  const headers = () => ({
    Authorization: `Bearer ${getAccessToken() ?? ""}`,
    "Content-Type": "application/json",
  });

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/v1/geography/cities");
      if (res.ok) setCities(await res.json());
    })();
  }, []);

  const load = useCallback(async () => {
    setError(false);
    const qs = cityId ? `?cityId=${cityId}` : "";
    const res = await fetch(`/api/v1/admin/districts${qs}`, {
      headers: headers(),
    });
    if (res.ok) setItems(await res.json());
    else setError(true);
  }, [cityId]);

  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  async function send(url: string, method: string, body: unknown) {
    setError(false);
    const res = await fetch(url, {
      method,
      headers: headers(),
      body: JSON.stringify(body),
    });
    if (!res.ok) setError(true);
    await load();
    return res.ok;
  }

  const pending = (items ?? []).filter((d) => d.status === "PENDING");
  const rest = (items ?? []).filter((d) => d.status !== "PENDING");
  const cityName = (id: string) =>
    cities.find((c) => c.id === id)?.nameUk ?? "";
  const mergeable = (items ?? []).filter(
    (d) =>
      d.status === "ACTIVE" &&
      d.id !== mergeFrom &&
      d.cityId === items?.find((x) => x.id === mergeFrom)?.cityId,
  );

  function row(d: AdminDistrict) {
    const isEditing = editing?.id === d.id;
    return (
      <li
        key={d.id}
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
                  await send(`/api/v1/admin/districts/${d.id}`, "PATCH", {
                    nameUk: editing.nameUk,
                    ...(editing.nameEn ? { nameEn: editing.nameEn } : {}),
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
              <strong>{d.nameUk}</strong>{" "}
              <span className="text-muted">· {cityName(d.cityId)}</span>
              {d.source === "USER_CREATED" && (
                <span className="ml-2 rounded-full bg-surface px-2 py-0.5 text-xs">
                  user
                </span>
              )}
            </span>
            <span className="flex flex-wrap items-center gap-2">
              {d.status === "MERGED" ? (
                <span className="text-xs text-muted">MERGED</span>
              ) : (
                <>
                  {d.status === "PENDING" && (
                    <Button
                      onClick={() =>
                        void send(`/api/v1/admin/districts/${d.id}`, "PATCH", {
                          status: "ACTIVE",
                        })
                      }
                    >
                      {t("admin.categories.approve")}
                    </Button>
                  )}
                  <select
                    value={d.status}
                    onChange={(e) =>
                      void send(`/api/v1/admin/districts/${d.id}`, "PATCH", {
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
                        id: d.id,
                        nameUk: d.nameUk,
                        nameEn: d.nameEn ?? "",
                      })
                    }
                  >
                    {t("admin.categories.rename")}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setMergeFrom(d.id);
                      setMergeTo("");
                    }}
                  >
                    {t("admin.districts.merge")}
                  </Button>
                </>
              )}
            </span>
          </div>
        )}
        {mergeFrom === d.id && (
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={mergeTo}
              onChange={(e) => setMergeTo(e.target.value)}
              className="rounded-md border border-border bg-background px-2 py-1.5 text-xs"
              aria-label={t("admin.districts.targetId")}
            >
              <option value="">{t("admin.districts.targetId")}</option>
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
                  await send(`/api/v1/admin/districts/${d.id}/merge`, "POST", {
                    targetDistrictId: mergeTo,
                  })
                )
                  setMergeFrom(null);
              }}
            >
              {t("admin.districts.merge")}
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
      <h1 className="mb-6 text-2xl font-bold">{t("admin.districts.title")}</h1>

      <div className="mb-6 flex flex-col gap-1.5">
        <label htmlFor="city" className="text-sm font-medium">
          {t("welcome.city")}
        </label>
        <select
          id="city"
          value={cityId}
          onChange={(e) => setCityId(e.target.value)}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm"
        >
          <option value="">—</option>
          {cities.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nameUk}
            </option>
          ))}
        </select>
      </div>

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
