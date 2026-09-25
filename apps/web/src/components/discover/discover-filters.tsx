"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Check, Search, X } from "lucide-react";
import { useTranslations } from "@/lib/locale-context";
import { api } from "@/lib/api-client";
import type { Category, City, District } from "@/lib/geo-types";
import { Button } from "@/components/ui/button";
import {
  EMPTY_FILTERS,
  PRICE_SLIDER_MAX,
  type DatePreset,
  type DiscoveryFilters,
  type FormatFilter,
  type GroupSize,
  type TimePreset,
} from "./filters";

export type { DiscoveryFilters } from "./filters";

interface Option {
  id: string;
  label: string;
  indent?: boolean;
}

function Chips<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition ${
            value === o.value
              ? "accent-gradient border-transparent text-white"
              : "border-border hover:bg-surface"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5 border-t border-border py-4 first:border-t-0 first:pt-0">
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
    </section>
  );
}

/** Search box + scrollable list; single- or multi-select. §7 "Місто/Район/Категорія" with a search field. */
function SearchPicker({
  options,
  selected,
  multi,
  onChange,
  placeholder,
  emptyLabel,
}: {
  options: Option[];
  selected: string[];
  multi: boolean;
  onChange: (ids: string[]) => void;
  placeholder: string;
  emptyLabel: string;
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q
      ? options.filter((o) => o.label.toLowerCase().includes(q))
      : options;
  }, [options, query]);

  function toggle(id: string) {
    if (multi)
      onChange(
        selected.includes(id)
          ? selected.filter((s) => s !== id)
          : [...selected, id],
      );
    else onChange(selected.includes(id) ? [] : [id]);
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <div className="flex items-center gap-2 border-b border-border px-3">
        <Search className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          className="h-10 w-full bg-transparent text-sm outline-none"
        />
      </div>
      <ul className="max-h-44 overflow-y-auto">
        {filtered.length === 0 && (
          <li className="px-3 py-3 text-sm text-muted">{emptyLabel}</li>
        )}
        {filtered.map((o) => {
          const on = selected.includes(o.id);
          return (
            <li key={o.id}>
              <button
                type="button"
                onClick={() => toggle(o.id)}
                aria-pressed={on}
                className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-surface ${o.indent ? "pl-7" : ""}`}
              >
                <span className={on ? "font-semibold" : ""}>{o.label}</span>
                {on && (
                  <Check className="h-4 w-4 text-accent" aria-hidden="true" />
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const inputCls =
  "h-10 rounded-lg border border-border bg-background px-3 text-sm";

/**
 * UX §7 — the complete filter set: city, district, categories (many), date,
 * time of day, price range, free, format, age, group size. Opened as a bottom
 * sheet on phones. Mounted only while open, so `draft` re-seeds from the
 * applied filters each time.
 */
export function DiscoverFilters({
  filters,
  onApply,
  onClose,
}: {
  filters: DiscoveryFilters;
  onApply: (filters: DiscoveryFilters) => void;
  onClose: () => void;
}) {
  const { t, locale } = useTranslations();
  const [cities, setCities] = useState<City[]>([]);
  const [districts, setDistricts] = useState<District[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [draft, setDraft] = useState(filters);
  const set = (patch: Partial<DiscoveryFilters>) =>
    setDraft((d) => ({ ...d, ...patch }));
  const name = (uk: string, en: string | null) =>
    locale === "uk" ? uk : (en ?? uk);

  useEffect(() => {
    (async () => {
      const [citiesRes, categoriesRes] = await Promise.all([
        api.GET("/api/v1/geography/cities", { params: { query: {} } }),
        api.GET("/api/v1/categories"),
      ]);
      if (citiesRes.data) setCities(citiesRes.data as City[]);
      if (categoriesRes.data) setCategories(categoriesRes.data as Category[]);
    })();
  }, []);

  useEffect(() => {
    if (!draft.cityId) {
      queueMicrotask(() => setDistricts([]));
      return;
    }
    let cancelled = false;
    (async () => {
      const res = await api.GET("/api/v1/geography/districts", {
        params: { query: { cityId: draft.cityId! } },
      });
      if (!cancelled && res.data) setDistricts(res.data as District[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [draft.cityId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const cityOptions: Option[] = cities.map((c) => ({
    id: c.id,
    label: name(c.nameUk, c.nameEn),
  }));
  const districtOptions: Option[] = districts.map((d) => ({
    id: d.id,
    label: name(d.nameUk, d.nameEn),
  }));
  const categoryOptions: Option[] = categories.flatMap((c) => [
    { id: c.id, label: name(c.nameUk, c.nameEn) },
    ...c.children.map((ch) => ({
      id: ch.id,
      label: name(ch.nameUk, ch.nameEn),
      indent: true,
    })),
  ]);

  const dateOptions: { value: DatePreset; label: string }[] = [
    { value: "any", label: t("filters.dateAny") },
    { value: "today", label: t("filters.dateToday") },
    { value: "tomorrow", label: t("filters.dateTomorrow") },
    { value: "weekend", label: t("filters.dateWeekend") },
    { value: "date", label: t("filters.datePick") },
    { value: "range", label: t("filters.dateRange") },
  ];
  const timeOptions: { value: TimePreset; label: string }[] = [
    { value: "any", label: t("filters.timeAny") },
    { value: "morning", label: t("filters.timeMorning") },
    { value: "day", label: t("filters.timeDay") },
    { value: "evening", label: t("filters.timeEvening") },
    { value: "night", label: t("filters.timeNight") },
    { value: "custom", label: t("filters.timeCustom") },
  ];
  const formatOptions: { value: FormatFilter; label: string }[] = [
    { value: "any", label: t("filters.formatAny") },
    { value: "OFFLINE", label: t("filters.formatOffline") },
    { value: "ONLINE", label: t("filters.formatOnline") },
  ];
  const groupOptions: { value: GroupSize; label: string }[] = [
    { value: "any", label: t("filters.groupAny") },
    { value: "1-5", label: "1–5" },
    { value: "5-10", label: "5–10" },
    { value: "10-20", label: "10–20" },
    { value: "20+", label: "20+" },
  ];

  const min = draft.minPrice ?? 0;
  const max = draft.maxPrice ?? PRICE_SLIDER_MAX;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("filters.title")}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-3xl bg-background shadow-2xl sm:rounded-3xl"
      >
        <header className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-lg font-bold">{t("filters.title")}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("discover.closeFilters")}
            className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-surface"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <Section title={t("filters.city")}>
            <SearchPicker
              options={cityOptions}
              selected={draft.cityId ? [draft.cityId] : []}
              multi={false}
              onChange={(ids) =>
                set({ cityId: ids[0] ?? null, districtIds: [] })
              }
              placeholder={t("filters.search")}
              emptyLabel={t("filters.noResults")}
            />
          </Section>

          {draft.cityId && districtOptions.length > 0 && (
            <Section
              title={`${t("filters.district")}${draft.districtIds.length ? ` · ${draft.districtIds.length}` : ""}`}
            >
              <SearchPicker
                options={districtOptions}
                selected={draft.districtIds}
                multi
                onChange={(ids) => set({ districtIds: ids })}
                placeholder={t("filters.search")}
                emptyLabel={t("filters.noResults")}
              />
            </Section>
          )}

          <Section
            title={`${t("filters.category")}${draft.categoryIds.length ? ` · ${draft.categoryIds.length}` : ""}`}
          >
            <SearchPicker
              options={categoryOptions}
              selected={draft.categoryIds}
              multi
              onChange={(ids) => set({ categoryIds: ids })}
              placeholder={t("filters.search")}
              emptyLabel={t("filters.noResults")}
            />
          </Section>

          <Section title={t("filters.date")}>
            <Chips
              value={draft.datePreset}
              options={dateOptions}
              onChange={(v) => set({ datePreset: v })}
            />
            {(draft.datePreset === "date" || draft.datePreset === "range") && (
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  aria-label={t("filters.from")}
                  value={draft.dateFrom}
                  onChange={(e) => set({ dateFrom: e.target.value })}
                  className={`${inputCls} flex-1`}
                />
                {draft.datePreset === "range" && (
                  <>
                    <span className="text-muted">–</span>
                    <input
                      type="date"
                      aria-label={t("filters.to")}
                      value={draft.dateTo}
                      min={draft.dateFrom || undefined}
                      onChange={(e) => set({ dateTo: e.target.value })}
                      className={`${inputCls} flex-1`}
                    />
                  </>
                )}
              </div>
            )}
          </Section>

          <Section title={t("filters.time")}>
            <Chips
              value={draft.timePreset}
              options={timeOptions}
              onChange={(v) => set({ timePreset: v })}
            />
            {draft.timePreset === "custom" && (
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={23}
                  aria-label={t("filters.hourFrom")}
                  value={draft.hourFrom}
                  onChange={(e) =>
                    set({
                      hourFrom: Math.min(
                        23,
                        Math.max(0, Number(e.target.value) || 0),
                      ),
                    })
                  }
                  className={`${inputCls} w-24`}
                />
                <span className="text-muted">–</span>
                <input
                  type="number"
                  min={0}
                  max={24}
                  aria-label={t("filters.hourTo")}
                  value={draft.hourTo}
                  onChange={(e) =>
                    set({
                      hourTo: Math.min(
                        24,
                        Math.max(0, Number(e.target.value) || 0),
                      ),
                    })
                  }
                  className={`${inputCls} w-24`}
                />
              </div>
            )}
          </Section>

          <Section title={t("filters.price")}>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={draft.freeOnly}
                onChange={(e) => set({ freeOnly: e.target.checked })}
              />
              {t("filters.free")}
            </label>
            {!draft.freeOnly && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between text-sm font-semibold">
                  <span>
                    {t("filters.priceMin")} {min} ₴
                  </span>
                  <span>
                    {t("filters.priceMax")}{" "}
                    {max >= PRICE_SLIDER_MAX ? `${PRICE_SLIDER_MAX}+` : max} ₴
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={PRICE_SLIDER_MAX}
                  step={50}
                  value={min}
                  aria-label={t("filters.priceMin")}
                  onChange={(e) =>
                    set({
                      minPrice: Math.min(Number(e.target.value), max),
                      maxPrice: draft.maxPrice,
                    })
                  }
                  className="w-full accent-[var(--accent-solid)]"
                />
                <input
                  type="range"
                  min={0}
                  max={PRICE_SLIDER_MAX}
                  step={50}
                  value={max}
                  aria-label={t("filters.priceMax")}
                  onChange={(e) =>
                    set({ maxPrice: Math.max(Number(e.target.value), min) })
                  }
                  className="w-full accent-[var(--accent-solid)]"
                />
              </div>
            )}
          </Section>

          <Section title={t("filters.format")}>
            <Chips
              value={draft.format}
              options={formatOptions}
              onChange={(v) => set({ format: v })}
            />
          </Section>

          <Section title={t("filters.age")}>
            <Chips
              value={draft.adultsOnly ? "adults" : "all"}
              options={[
                { value: "all", label: t("filters.ageAll") },
                { value: "adults", label: t("filters.ageAdults") },
              ]}
              onChange={(v) => set({ adultsOnly: v === "adults" })}
            />
          </Section>

          <Section title={t("filters.group")}>
            <Chips
              value={draft.groupSize}
              options={groupOptions}
              onChange={(v) => set({ groupSize: v })}
            />
          </Section>
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-border px-5 py-4">
          <Button variant="ghost" onClick={() => setDraft(EMPTY_FILTERS)}>
            {t("filters.reset")}
          </Button>
          <Button
            onClick={() => {
              onApply(draft);
              onClose();
            }}
          >
            {t("filters.apply")}
          </Button>
        </footer>
      </div>
    </div>
  );
}
