"use client";

import { useState } from "react";
import { useTranslations } from "@/lib/locale-context";

/** Whole days, both ends included (yyyy-mm-dd). */
export interface Period {
  from: string;
  to: string;
}

export type PeriodPreset = "day" | "week" | "month" | "all" | "custom";

/** The day before the first account and the first visit: "весь час" means everything since the launch. */
export const ALL_TIME_FROM = "2026-09-20";

const pad = (n: number) => String(n).padStart(2, "0");
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function presetPeriod(preset: Exclude<PeriodPreset, "custom">): Period {
  const to = new Date();
  if (preset === "all") return { from: ALL_TIME_FROM, to: dayKey(to) };
  const from = new Date();
  from.setDate(from.getDate() - (preset === "day" ? 0 : preset === "week" ? 6 : 29));
  return { from: dayKey(from), to: dayKey(to) };
}

/** Query string for the admin analytics endpoints. */
export const periodQuery = (p: Period): string => `from=${p.from}&to=${p.to}`;

function formatPeriod(p: Period, allLabel: string): string {
  if (p.from === ALL_TIME_FROM) return allLabel;
  const short = (k: string) => `${Number(k.slice(8))}.${k.slice(5, 7)}`;
  return p.from === p.to ? short(p.from) : `${short(p.from)} – ${short(p.to)}`;
}

/** Day / week / month / all time / any dates: the same filter as the app's admin analytics. Controlled: the parent owns the period. */
export function AdminPeriodFilter({ period, onChange }: { period: Period; onChange: (next: Period) => void }) {
  const { t } = useTranslations();
  const [preset, setPreset] = useState<PeriodPreset>("month");
  const options: { key: PeriodPreset; label: string }[] = [
    { key: "day", label: t("admin.period.day") },
    { key: "week", label: t("admin.period.week") },
    { key: "month", label: t("admin.period.month") },
    { key: "all", label: t("admin.period.all") },
    { key: "custom", label: t("admin.period.custom") },
  ];

  function choose(next: PeriodPreset) {
    setPreset(next);
    if (next !== "custom") onChange(presetPeriod(next));
  }

  return (
    <div className="mb-4 flex flex-col gap-2">
      <div className="flex flex-wrap gap-2" role="group">
        {options.map((o) => (
          <button
            key={o.key}
            type="button"
            aria-pressed={preset === o.key}
            onClick={() => choose(o.key)}
            className={`rounded-full border px-4 py-2 text-[13px] font-bold ${preset === o.key ? "accent-gradient border-transparent text-white" : "border-border"}`}
          >
            {o.label}
          </button>
        ))}
      </div>
      {preset === "custom" && (
        <div className="flex flex-wrap items-center gap-2">
          <input type="date" value={period.from} max={period.to} onChange={(e) => e.target.value && onChange({ ...period, from: e.target.value })} className="rounded-md border border-border bg-background px-3 py-2 text-sm" />
          <span className="text-muted">–</span>
          <input type="date" value={period.to} min={period.from} onChange={(e) => e.target.value && onChange({ ...period, to: e.target.value })} className="rounded-md border border-border bg-background px-3 py-2 text-sm" />
        </div>
      )}
      <p className="text-xs text-muted">{t("admin.period.showing").replace("{period}", formatPeriod(period, t("admin.period.all").toLowerCase()))}</p>
    </div>
  );
}
