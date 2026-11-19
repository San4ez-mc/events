"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "@/lib/locale-context";
import { formatDateTime } from "@/lib/format";
import { getAccessToken } from "@/lib/api-client";
import { Spinner } from "@/components/ui/spinner";

interface Person {
  id: string;
  name: string;
  email: string;
  joinedAt: string;
  isOrganizer: boolean;
  eventsPublished: number;
}
interface InviterRow {
  inviter: { id: string; name: string; email: string };
  clicks: number;
  downloadClicks: number;
  invited: number;
  organizers: number;
  eventsPublished: number;
  people: Person[];
}
interface Overview {
  inviters: InviterRow[];
  totals: { inviters: number; invited: number; organizers: number };
}

/** Who invited whom: every person with a personal link, how many opened it, signed up and became organizers. */
export default function AdminInvitesPage() {
  const { t, locale } = useTranslations();
  const [data, setData] = useState<Overview | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/v1/admin/invites", { headers: { Authorization: `Bearer ${getAccessToken() ?? ""}` } }).catch(() => null);
      if (res?.ok) setData((await res.json()) as Overview);
      else setFailed(true);
    })();
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-extrabold">{t("admin.invites.adminTitle")}</h1>
        <p className="text-sm text-muted">{t("admin.invites.adminHint")}</p>
      </div>

      {failed && <p className="text-danger">{t("common.somethingWentWrong")}</p>}
      {!failed && data === null && <Spinner />}

      {data && (
        <>
          <p className="text-sm font-semibold">
            {t("admin.invites.adminTotals")
              .replace("{inviters}", String(data.totals.inviters))
              .replace("{invited}", String(data.totals.invited))
              .replace("{organizers}", String(data.totals.organizers))}
          </p>
          {data.inviters.length === 0 && <p className="text-muted">{t("admin.invites.adminEmpty")}</p>}
          <ul className="flex flex-col gap-3">
            {data.inviters.map((row) => (
              <li key={row.inviter.id} className="rounded-xl border border-border bg-surface p-4">
                <button type="button" onClick={() => setOpen(open === row.inviter.id ? null : row.inviter.id)} className="flex w-full items-start justify-between gap-3 text-left" aria-expanded={open === row.inviter.id}>
                  <span className="min-w-0">
                    <span className="block truncate font-bold">{row.inviter.name}</span>
                    <span className="block truncate text-xs text-muted">{row.inviter.email}</span>
                  </span>
                  <span className="flex shrink-0 gap-4 text-center text-xs">
                    <span>
                      <span className="block text-lg font-extrabold">{row.clicks}</span>
                      {t("admin.invites.linkClicks")}
                    </span>
                    <span>
                      <span className="block text-lg font-extrabold">{row.downloadClicks}</span>
                      {t("admin.invites.downloadClicks")}
                    </span>
                    <span>
                      <span className="block text-lg font-extrabold">{row.invited}</span>
                      {t("admin.invites.people")}
                    </span>
                    <span>
                      <span className="block text-lg font-extrabold">{row.organizers}</span>
                      {t("admin.invites.organizerBadge")}
                    </span>
                  </span>
                </button>
                {open === row.inviter.id && (
                  <ul className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
                    {row.people.map((p) => (
                      <li key={p.id} className="flex items-center justify-between gap-3 text-sm">
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{p.name}</span>
                          <span className="block truncate text-xs text-muted">
                            {p.email} · {formatDateTime(p.joinedAt, locale)}
                          </span>
                        </span>
                        <span className="shrink-0 text-xs">
                          {p.isOrganizer ? (
                            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 font-bold text-emerald-600">
                              {t("admin.invites.organizerBadge")} · {p.eventsPublished} {t("admin.invites.events")}
                            </span>
                          ) : null}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
