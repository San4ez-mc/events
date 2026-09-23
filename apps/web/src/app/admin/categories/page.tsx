"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "@/lib/locale-context";
import { getAccessToken } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";

interface CategoryNode {
  id: string;
  nameUk: string;
  nameEn: string;
  status: string;
  children: CategoryNode[];
}

function flatten(nodes: CategoryNode[], depth = 0): { id: string; label: string; status: string }[] {
  return nodes.flatMap((node) => [
    { id: node.id, label: `${"— ".repeat(depth)}${node.nameUk}`, status: node.status },
    ...flatten(node.children, depth + 1),
  ]);
}

export default function AdminCategoriesPage() {
  const { t } = useTranslations();
  const [categories, setCategories] = useState<{ id: string; label: string; status: string }[] | null>(null);
  const [sourceId, setSourceId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/v1/categories");
      if (res.ok) setCategories(flatten(await res.json()));
    })();
  }, []);

  async function merge() {
    const token = getAccessToken();
    if (!token || !sourceId || !targetId) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/v1/admin/categories/${sourceId}/merge`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ targetCategoryId: targetId }),
      });
      setMessage(res.ok ? "OK" : "ERROR");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="mb-6 text-2xl font-bold">{t("admin.categories.title")}</h1>

      <div className="mb-6 flex flex-col gap-1.5">
        <TextField label={t("admin.categories.sourceId")} value={sourceId} onChange={setSourceId} />
      </div>
      <div className="mb-4 flex flex-col gap-1.5">
        <TextField label={t("admin.categories.targetId")} value={targetId} onChange={setTargetId} />
      </div>
      {message === "OK" && <p className="mb-3 text-sm text-success">✓</p>}
      {message === "ERROR" && <p className="mb-3 text-sm text-danger">{t("common.somethingWentWrong")}</p>}
      <Button disabled={!sourceId || !targetId} loading={busy} onClick={() => void merge()}>
        {t("admin.categories.merge")}
      </Button>

      <h2 className="mt-10 mb-3 text-sm font-semibold">{t("admin.nav.categories")}</h2>
      {categories === null && <p className="text-muted">{t("common.loading")}</p>}
      {categories !== null && (
        <ul className="flex flex-col gap-1 text-sm">
          {categories.map((c) => (
            <li key={c.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
              <span>{c.label}</span>
              <span className="flex items-center gap-2 text-xs text-muted">
                <code>{c.id}</code>
                <span>{c.status}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
