"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "@/lib/locale-context";
import { api } from "@/lib/api-client";
import type { City, Category } from "@/lib/geo-types";
import { Button } from "@/components/ui/button";

export interface DiscoveryFilters {
  cityId: string | null;
  categoryId: string | null;
  freeOnly: boolean;
}

/**
 * UX §7 — a trimmed-down MVP filter set (city, category, free-only). Date/
 * time/price-range/age/group-size filters from the spec aren't wired up yet
 * — a documented gap, not silently dropped.
 */
/**
 * Mounted only while open (the parent renders `{filtersOpen && <DiscoverFilters .../>}`)
 * so `draft`'s `useState(filters)` initializer naturally re-seeds from the
 * latest applied filters every time the panel is reopened, with no effect
 * needed to resync it.
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
  const [cities, setCities] = useState<City[] | null>(null);
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [draft, setDraft] = useState(filters);

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

  return (
    <div className="absolute inset-x-0 top-full z-10 mt-2 rounded-xl border border-border bg-background p-4 shadow-lg">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="discover-city" className="text-sm font-medium">
            {t("events.wizard.city")}
          </label>
          <select
            id="discover-city"
            value={draft.cityId ?? ""}
            onChange={(e) => setDraft((d) => ({ ...d, cityId: e.target.value || null }))}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="">{t("discover.anyCity")}</option>
            {cities?.map((city) => (
              <option key={city.id} value={city.id}>
                {locale === "uk" ? city.nameUk : city.nameEn}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="discover-category" className="text-sm font-medium">
            {t("events.wizard.category")}
          </label>
          <select
            id="discover-category"
            value={draft.categoryId ?? ""}
            onChange={(e) => setDraft((d) => ({ ...d, categoryId: e.target.value || null }))}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="">{t("discover.anyCategory")}</option>
            {categories?.map((category) => (
              <optgroup key={category.id} label={locale === "uk" ? category.nameUk : category.nameEn}>
                <option value={category.id}>{locale === "uk" ? category.nameUk : category.nameEn}</option>
                {category.children.map((child) => (
                  <option key={child.id} value={child.id}>
                    &nbsp;&nbsp;{locale === "uk" ? child.nameUk : child.nameEn}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={draft.freeOnly}
            onChange={(e) => setDraft((d) => ({ ...d, freeOnly: e.target.checked }))}
          />
          {t("discover.freeOnly")}
        </label>

        <div className="flex items-center justify-between gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>
            {t("discover.closeFilters")}
          </Button>
          <Button
            onClick={() => {
              onApply(draft);
              onClose();
            }}
          >
            {t("discover.applyFilters")}
          </Button>
        </div>
      </div>
    </div>
  );
}
