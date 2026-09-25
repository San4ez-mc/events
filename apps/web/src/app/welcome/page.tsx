"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useTranslations } from "@/lib/locale-context";
import { getAccessToken } from "@/lib/api-client";
import { Button } from "@/components/ui/button";

interface Named {
  id: string;
  nameUk: string;
  nameEn: string;
}
interface CategoryNode extends Named {
  children: Named[];
}

/** UX §2 — first-run onboarding: city, interests, district, budget preference. Everything is skippable and editable later. */
export default function WelcomePage() {
  const { user, isLoading } = useAuth();
  const { t, locale } = useTranslations();
  const router = useRouter();

  const [cities, setCities] = useState<Named[]>([]);
  const [districts, setDistricts] = useState<Named[]>([]);
  const [categories, setCategories] = useState<Named[]>([]);
  const [cityId, setCityId] = useState("");
  const [districtIds, setDistrictIds] = useState<string[]>([]);
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [freeOnly, setFreeOnly] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  const name = (n: Named) => (locale === "uk" ? n.nameUk : n.nameEn);

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.replace("/login?next=/welcome");
      return;
    }
    (async () => {
      const [c, cat] = await Promise.all([
        fetch("/api/v1/geography/cities"),
        fetch("/api/v1/categories"),
      ]);
      if (c.ok) setCities(await c.json());
      if (cat.ok) {
        const tree = (await cat.json()) as CategoryNode[];
        setCategories(
          tree.flatMap((n) => (n.children.length > 0 ? n.children : [n])),
        );
      }
    })();
  }, [isLoading, user, router]);

  useEffect(() => {
    if (!cityId) return;
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/v1/geography/districts?cityId=${cityId}`);
      if (!cancelled && res.ok) setDistricts(await res.json());
    })();
    return () => {
      cancelled = true;
    };
  }, [cityId]);

  const toggle = (list: string[], set: (v: string[]) => void, id: string) =>
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  async function save() {
    setSaving(true);
    setFailed(false);
    try {
      const res = await fetch("/api/v1/users/me/preferences", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getAccessToken() ?? ""}`,
        },
        body: JSON.stringify({
          preferredCityId: cityId || undefined,
          preferredDistrictIds: cityId ? districtIds : undefined,
          preferredCategoryIds: categoryIds,
          freeOnly,
        }),
      });
      if (res.ok) router.push("/");
      else setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  }

  const chip = (active: boolean) =>
    `rounded-full border px-4 py-1.5 text-sm ${active ? "accent-gradient border-transparent text-white" : "border-border hover:bg-surface"}`;

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-8 px-4 py-10">
      <header>
        <h1 className="text-2xl font-bold">{t("welcome.title")}</h1>
        <p className="mt-1 text-sm text-muted">{t("welcome.subtitle")}</p>
      </header>

      <section>
        <h2 className="mb-3 text-sm font-semibold">{t("welcome.city")}</h2>
        <div className="flex flex-wrap gap-2">
          {cities.map((c) => (
            <button
              key={c.id}
              type="button"
              className={chip(cityId === c.id)}
              onClick={() => {
                setCityId(c.id);
                setDistrictIds([]);
              }}
            >
              {name(c)}
            </button>
          ))}
        </div>
      </section>

      {cityId && districts.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold">
            {t("welcome.districts")}
          </h2>
          <div className="flex flex-wrap gap-2">
            {districts.map((d) => (
              <button
                key={d.id}
                type="button"
                className={chip(districtIds.includes(d.id))}
                onClick={() => toggle(districtIds, setDistrictIds, d.id)}
              >
                {name(d)}
              </button>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold">{t("welcome.interests")}</h2>
        <div className="flex flex-wrap gap-2">
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              className={chip(categoryIds.includes(c.id))}
              onClick={() => toggle(categoryIds, setCategoryIds, c.id)}
            >
              {name(c)}
            </button>
          ))}
        </div>
      </section>

      <label className="flex items-center justify-between gap-4 text-sm">
        <span>{t("welcome.freeOnly")}</span>
        <input
          type="checkbox"
          className="h-5 w-5 accent-[var(--accent-from)]"
          checked={freeOnly}
          onChange={(e) => setFreeOnly(e.target.checked)}
        />
      </label>

      {failed && (
        <p role="alert" className="text-sm text-danger">
          {t("common.somethingWentWrong")}
        </p>
      )}

      <div className="flex items-center gap-3">
        <Button onClick={save} loading={saving}>
          {t("welcome.done")}
        </Button>
        <button
          type="button"
          onClick={() => router.push("/")}
          className="text-sm text-muted hover:underline"
        >
          {t("welcome.skip")}
        </button>
      </div>
    </div>
  );
}
