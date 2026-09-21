"use client";

import Link from "next/link";
import { useTranslations } from "@/lib/locale-context";
import { Button } from "@/components/ui/button";

export function StepPreview({ slug }: { slug: string }) {
  const { t } = useTranslations();

  return (
    <div className="flex flex-col items-center gap-4 rounded-lg border border-dashed border-border p-10 text-center">
      <p className="text-muted">{t("events.wizard.previewHint")}</p>
      <Link href={`/events/${slug}`} target="_blank">
        <Button>{t("events.wizard.openPreview")}</Button>
      </Link>
    </div>
  );
}
