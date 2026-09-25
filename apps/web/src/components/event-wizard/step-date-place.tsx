"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "@/lib/locale-context";
import { api } from "@/lib/api-client";
import type { City, District } from "@/lib/geo-types";
import { TextField } from "@/components/ui/text-field";
import { AddressAutocomplete } from "./address-autocomplete";
import type { StepProps } from "./types";

export function StepDatePlace({ data, onChange }: StepProps) {
  const { t, locale } = useTranslations();
  const [cities, setCities] = useState<City[] | null>(null);
  // Tracks which city `districts` was fetched for, so a stale list from the
  // previously selected city is never rendered while a new fetch is in
  // flight — avoids needing to synchronously clear state on every keystroke
  // change of cityId (react-hooks/set-state-in-effect).
  const [districts, setDistricts] = useState<{
    cityId: string;
    items: District[];
  } | null>(null);

  useEffect(() => {
    (async () => {
      const res = await api.GET("/api/v1/geography/cities", {
        params: { query: {} },
      });
      if (res.data) setCities(res.data as City[]);
    })();
  }, []);

  useEffect(() => {
    if (!data.cityId) return;
    let cancelled = false;
    (async () => {
      const res = await api.GET("/api/v1/geography/districts", {
        params: { query: { cityId: data.cityId! } },
      });
      if (!cancelled && res.data)
        setDistricts({ cityId: data.cityId!, items: res.data as District[] });
    })();
    return () => {
      cancelled = true;
    };
  }, [data.cityId]);

  const districtsForCurrentCity =
    districts?.cityId === data.cityId ? districts.items : [];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">{t("events.wizard.format")}</span>
        <div className="flex gap-2">
          {(["OFFLINE", "ONLINE"] as const).map((format) => (
            <button
              key={format}
              type="button"
              onClick={() => onChange({ format })}
              className={`rounded-md border px-4 py-2 text-sm font-medium ${
                data.format === format
                  ? "border-transparent accent-gradient text-white"
                  : "border-border hover:bg-surface"
              }`}
            >
              {format === "OFFLINE"
                ? t("events.wizard.formatOffline")
                : t("events.wizard.formatOnline")}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="startsAt" className="text-sm font-medium">
            {t("events.wizard.startsAt")}
          </label>
          <input
            id="startsAt"
            type="datetime-local"
            value={data.startsAt}
            onChange={(e) => onChange({ startsAt: e.target.value })}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="endsAt" className="text-sm font-medium">
            {t("events.wizard.endsAt")}
          </label>
          <input
            id="endsAt"
            type="datetime-local"
            value={data.endsAt}
            onChange={(e) => onChange({ endsAt: e.target.value })}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </div>
      </div>

      {data.format === "OFFLINE" ? (
        <>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="city" className="text-sm font-medium">
              {t("events.wizard.city")}
            </label>
            <select
              id="city"
              value={data.cityId ?? ""}
              onChange={(e) =>
                onChange({ cityId: e.target.value || null, districtId: null })
              }
              className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="">{t("events.wizard.cityPlaceholder")}</option>
              {cities === null && (
                <option disabled>{t("common.loading")}</option>
              )}
              {cities?.map((city) => (
                <option key={city.id} value={city.id}>
                  {locale === "uk" ? city.nameUk : city.nameEn}
                </option>
              ))}
            </select>
          </div>

          {data.cityId && districtsForCurrentCity.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="district" className="text-sm font-medium">
                {t("events.wizard.district")}
              </label>
              <select
                id="district"
                value={data.districtId ?? ""}
                onChange={(e) =>
                  onChange({ districtId: e.target.value || null })
                }
                className="rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="">
                  {t("events.wizard.districtPlaceholder")}
                </option>
                {districtsForCurrentCity.map((district) => (
                  <option key={district.id} value={district.id}>
                    {locale === "uk"
                      ? district.nameUk
                      : (district.nameEn ?? district.nameUk)}
                  </option>
                ))}
              </select>
            </div>
          )}

          <AddressAutocomplete
            label={t("events.wizard.addressText")}
            value={data.addressText}
            latitude={data.latitude}
            longitude={data.longitude}
            onPick={(place) => onChange(place)}
            placeholder={t("events.wizard.addressPlaceholder")}
          />
        </>
      ) : (
        <TextField
          label={t("events.wizard.onlineUrl")}
          type="url"
          value={data.onlineUrl}
          onChange={(onlineUrl) => onChange({ onlineUrl })}
          placeholder="https://..."
        />
      )}
    </div>
  );
}
