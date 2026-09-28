"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "@/lib/locale-context";
import { api, getAccessToken } from "@/lib/api-client";
import type { Category } from "@/lib/geo-types";
import { TextField } from "@/components/ui/text-field";
import { Button } from "@/components/ui/button";
import type { StepProps } from "./types";

export function StepBasics({ data, onChange }: StepProps) {
  const { t, locale } = useTranslations();
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [addingCategory, setAddingCategory] = useState(false);
  const [categoryAdded, setCategoryAdded] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await api.GET("/api/v1/categories");
      if (res.data) setCategories(res.data as Category[]);
    })();
  }, []);

  // §16/§38 — a category missing from the list gets suggested to the API and stays PENDING
  // (invisible to other users) until an admin approves it, but is attached to this event now.
  async function addCategory() {
    const nameUk = newCategoryName.trim();
    const token = getAccessToken();
    if (!nameUk || !token) return;
    setAddingCategory(true);
    try {
      const res = await fetch("/api/v1/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ nameUk }),
      });
      if (!res.ok) return;
      // The create response is a raw row with no `children` relation loaded — normalize it to the
      // same shape listTree() returns before appending, or the render below crashes on `.children.map`.
      const created = { ...((await res.json()) as Omit<Category, "children">), children: [] };
      setCategories((prev) => [...(prev ?? []), created]);
      onChange({ categoryId: created.id });
      setNewCategoryName("");
      setCategoryAdded(true);
    } finally {
      setAddingCategory(false);
    }
  }

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
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={newCategoryName}
            onChange={(e) => {
              setNewCategoryName(e.target.value);
              setCategoryAdded(false);
            }}
            placeholder={t("events.wizard.addCategoryPlaceholder")}
            className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
          <Button
            type="button"
            variant="secondary"
            loading={addingCategory}
            disabled={!newCategoryName.trim()}
            onClick={() => void addCategory()}
          >
            {t("events.wizard.addDistrictAdd")}
          </Button>
        </div>
        <p className="text-xs text-muted">
          {categoryAdded
            ? t("events.wizard.addCategorySubmitted")
            : t("events.wizard.addCategory")}
        </p>
      </div>
    </div>
  );
}
