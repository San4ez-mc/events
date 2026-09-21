"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "@/lib/locale-context";
import { getAccessToken } from "@/lib/api-client";
import { ApiRequestError } from "@/lib/auth-context";
import type { EventDetail, EventMedia } from "@/lib/event-types";
import { Button } from "@/components/ui/button";
import { StepBasics } from "./step-basics";
import { StepDatePlace } from "./step-date-place";
import { StepPrice } from "./step-price";
import { StepMedia } from "./step-media";
import { StepPreview } from "./step-preview";
import { EMPTY_WIZARD_DATA, type WizardData } from "./types";

function toWizardData(event: EventDetail): WizardData {
  return {
    title: event.title,
    description: event.description ?? "",
    categoryId: event.categoryId,
    format: event.format,
    startsAt: event.startsAt ? toLocalInputValue(event.startsAt) : "",
    endsAt: event.endsAt ? toLocalInputValue(event.endsAt) : "",
    cityId: event.cityId,
    districtId: event.districtId,
    addressText: event.addressText ?? "",
    onlineUrl: event.onlineUrl ?? "",
    priceType: event.priceType,
    price: event.price ?? "",
    capacity: event.capacity?.toString() ?? "",
    minParticipants: event.minParticipants?.toString() ?? "",
    approvalMode: event.approvalMode,
  };
}

function toLocalInputValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Only sends fields that are meaningfully set — avoids clobbering unrelated fields with empty strings. */
function toUpdatePayload(data: WizardData): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    title: data.title || undefined,
    description: data.description || undefined,
    categoryId: data.categoryId ?? undefined,
    format: data.format,
    startsAt: data.startsAt ? new Date(data.startsAt).toISOString() : undefined,
    endsAt: data.endsAt ? new Date(data.endsAt).toISOString() : undefined,
    priceType: data.priceType,
    approvalMode: data.approvalMode,
  };
  if (data.format === "OFFLINE") {
    payload.cityId = data.cityId ?? undefined;
    payload.districtId = data.districtId ?? undefined;
    payload.addressText = data.addressText || undefined;
  } else {
    payload.onlineUrl = data.onlineUrl || undefined;
  }
  if (data.priceType === "PAID" && data.price) payload.price = Number(data.price);
  if (data.capacity) payload.capacity = Number(data.capacity);
  if (data.minParticipants) payload.minParticipants = Number(data.minParticipants);
  return payload;
}

type Step = "basics" | "media" | "datePlace" | "price" | "preview";
const STEPS: Step[] = ["basics", "media", "datePlace", "price", "preview"];
const STEP_LABEL_KEYS: Record<Step, string> = {
  basics: "events.wizard.stepBasics",
  media: "events.wizard.stepMedia",
  datePlace: "events.wizard.stepDatePlace",
  price: "events.wizard.stepPrice",
  preview: "events.wizard.stepPreview",
};

export function EventWizard({ initialEvent }: { initialEvent?: EventDetail }) {
  const { t } = useTranslations();
  const router = useRouter();

  const [eventId, setEventId] = useState<string | null>(initialEvent?.id ?? null);
  const [slug, setSlug] = useState<string | null>(initialEvent?.slug ?? null);
  const [data, setData] = useState<WizardData>(initialEvent ? toWizardData(initialEvent) : EMPTY_WIZARD_DATA);
  const [media, setMedia] = useState<EventMedia[]>(initialEvent?.media ?? []);
  const [stepIndex, setStepIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const step = STEPS[stepIndex]!;

  const handleChange = useCallback((patch: Partial<WizardData>) => {
    setData((prev) => ({ ...prev, ...patch }));
  }, []);

  async function persist(): Promise<boolean> {
    setError(null);
    setSaving(true);
    try {
      // Use a local variable, not the `eventId` state, for the rest of this
      // call — setEventId() below won't have flushed yet within the same
      // async function, so reading the state var here would still see null.
      let id = eventId;

      if (!id) {
        if (!data.title.trim()) {
          setError(t("events.wizard.title"));
          return false;
        }
        const res = await fetch("/api/v1/events", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Client-Platform": "web",
            Authorization: `Bearer ${getAccessToken() ?? ""}`,
          },
          credentials: "include",
          body: JSON.stringify({ title: data.title }),
        });
        const body = await res.json();
        if (!res.ok) throw new ApiRequestError(body);
        id = body.id;
        setEventId(body.id);
        setSlug(body.slug);
        router.replace(`/organizer/events/${body.id}/edit`);
      }

      const patchRes = await fetch(`/api/v1/events/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "X-Client-Platform": "web",
          Authorization: `Bearer ${getAccessToken() ?? ""}`,
        },
        credentials: "include",
        body: JSON.stringify(toUpdatePayload(data)),
      });
      const patchBody = await patchRes.json();
      if (!patchRes.ok) throw new ApiRequestError(patchBody);
      setSlug((patchBody as EventDetail).slug);
      return true;
    } catch (err) {
      setError(err instanceof ApiRequestError ? t(`errors.${err.code}`) : t("common.somethingWentWrong"));
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function goNext() {
    const ok = await persist();
    if (ok && stepIndex < STEPS.length - 1) setStepIndex((i) => i + 1);
  }

  function goBack() {
    setStepIndex((i) => Math.max(0, i - 1));
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <ol className="mb-8 flex flex-wrap gap-2 text-xs font-medium">
        {STEPS.map((s, i) => (
          <li
            key={s}
            className={`rounded-full px-3 py-1 ${
              i === stepIndex ? "accent-gradient text-white" : i < stepIndex ? "bg-surface text-muted" : "text-muted"
            }`}
          >
            {t(STEP_LABEL_KEYS[s])}
          </li>
        ))}
      </ol>

      <div className="mb-8">
        {step === "basics" && <StepBasics data={data} onChange={handleChange} />}
        {step === "media" &&
          (eventId ? (
            <StepMedia eventId={eventId} media={media} onMediaChange={setMedia} />
          ) : (
            <p className="text-sm text-muted">{t("common.loading")}</p>
          ))}
        {step === "datePlace" && <StepDatePlace data={data} onChange={handleChange} />}
        {step === "price" && <StepPrice data={data} onChange={handleChange} />}
        {step === "preview" && slug && <StepPreview slug={slug} />}
      </div>

      {error && (
        <p role="alert" className="mb-4 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="flex items-center justify-between">
        <Button variant="secondary" onClick={goBack} disabled={stepIndex === 0}>
          {t("common.back")}
        </Button>
        {stepIndex < STEPS.length - 1 ? (
          <Button onClick={goNext} loading={saving}>
            {t("common.next")}
          </Button>
        ) : (
          <Button onClick={() => router.push("/organizer/events")}>{t("common.done")}</Button>
        )}
      </div>
    </div>
  );
}
