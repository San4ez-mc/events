"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "@/lib/locale-context";
import { api } from "@/lib/api-client";
import type { Category } from "@/lib/geo-types";
import { TextField } from "@/components/ui/text-field";
import type { StepProps } from "./types";

export function StepBasics({ data, onChange }: StepProps) {
  const { t, locale } = useTranslations();
  const [categories, setCategories] = useState<Category[] | null>(null);

  useEffect(() => {
    (async () => {
      const res = await api.GET("/api/v1/categories");
      if (res.data) setCategories(res.data as Category[]);
    })();
  }, []);

  return (
    <div className="flex flex-col gap-5">
      <TextField
        label={t("events.wizard.title")}
        value={data.title}
        onChange={(title) => onChange({ title })}
        required
        placeholder={t("events.wizard.titlePlaceholder")}
      />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="description" className="text-sm font-medium">
          {t("events.wizard.description")}
        </label>
        <textarea
          id="description"
          value={data.description}
          onChange={(e) => onChange({ description: e.target.value })}
          rows={5}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--accent-from)]"
          placeholder={t("events.wizard.descriptionPlaceholder")}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="category" className="text-sm font-medium">
          {t("events.wizard.category")}
        </label>
        <select
          id="category"
          value={data.categoryId ?? ""}
          onChange={(e) => onChange({ categoryId: e.target.value || null })}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm"
        >
          <option value="">{t("events.wizard.categoryPlaceholder")}</option>
          {categories === null && (
            <option disabled>{t("common.loading")}</option>
          )}
          {categories?.map((category) => (
            <optgroup
              key={category.id}
              label={locale === "uk" ? category.nameUk : category.nameEn}
            >
              <option value={category.id}>
                {locale === "uk" ? category.nameUk : category.nameEn}
              </option>
              {category.children.map((child) => (
                <option key={child.id} value={child.id}>
                  &nbsp;&nbsp;{locale === "uk" ? child.nameUk : child.nameEn}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>
    </div>
  );
}
