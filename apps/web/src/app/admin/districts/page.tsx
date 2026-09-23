"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "@/lib/locale-context";
import { getAccessToken } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";

interface CityOption {
  id: string;
  nameUk: string;
}
interface DistrictOption {
  id: string;
  nameUk: string;
  status: string;
}

export default function AdminDistrictsPage() {
  const { t } = useTranslations();
  const [cities, setCities] = useState<CityOption[] | null>(null);
  const [cityId, setCityId] = useState("");
  const [districts, setDistricts] = useState<DistrictOption[] | null>(null);
  const [sourceId, setSourceId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/v1/geography/cities");
      if (res.ok) setCities(await res.json());
    })();
  }, []);

  useEffect(() => {
    if (!cityId) {
      queueMicrotask(() => setDistricts(null));
      return;
    }
    (async () => {
      const res = await fetch(`/api/v1/geography/districts?cityId=${cityId}`);
      if (res.ok) setDistricts(await res.json());
    })();
  }, [cityId]);

  async function merge() {
    const token = getAccessToken();
    if (!token || !sourceId || !targetId) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/v1/admin/districts/${sourceId}/merge`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ targetDistrictId: targetId }),
      });
      setMessage(res.ok ? "OK" : "ERROR");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="mb-6 text-2xl font-bold">{t("admin.districts.title")}</h1>

      <div className="mb-6 flex flex-col gap-1.5">
        <label className="text-sm font-medium">{t("admin.nav.districts")}</label>
        <select
          value={cityId}
          onChange={(e) => setCityId(e.target.value)}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm"
        >
          <option value="">—</option>
          {cities?.map((city) => (
            <option key={city.id} value={city.id}>
              {city.nameUk}
            </option>
          ))}
        </select>
      </div>

      <div className="mb-6 flex flex-col gap-1.5">
        <TextField label={t("admin.districts.sourceId")} value={sourceId} onChange={setSourceId} />
      </div>
      <div className="mb-4 flex flex-col gap-1.5">
        <TextField label={t("admin.districts.targetId")} value={targetId} onChange={setTargetId} />
      </div>
      {message === "OK" && <p className="mb-3 text-sm text-success">✓</p>}
      {message === "ERROR" && <p className="mb-3 text-sm text-danger">{t("common.somethingWentWrong")}</p>}
      <Button disabled={!sourceId || !targetId} loading={busy} onClick={() => void merge()}>
        {t("admin.districts.merge")}
      </Button>

      {districts !== null && (
        <ul className="mt-10 flex flex-col gap-1 text-sm">
          {districts.map((d) => (
            <li key={d.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
              <span>{d.nameUk}</span>
              <span className="flex items-center gap-2 text-xs text-muted">
                <code>{d.id}</code>
                <span>{d.status}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
