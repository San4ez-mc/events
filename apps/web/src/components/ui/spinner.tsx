"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "@/lib/locale-context";

/** A moving loader with a text; after a few seconds it says the wait is expected so a slow report doesn't look hung. */
export function Spinner({ label }: { label?: string }) {
  const { t } = useTranslations();
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), 4000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div role="status" className="flex flex-col items-center gap-3 py-10 text-center text-sm text-muted">
      <span className="h-10 w-10 animate-spin rounded-full border-4 border-border border-t-[var(--accent-from)]" aria-hidden="true" />
      <span>{slow ? t("admin.loadingSlow") : (label ?? t("common.loading"))}</span>
    </div>
  );
}
