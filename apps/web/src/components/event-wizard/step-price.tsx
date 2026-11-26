"use client";

import { useTranslations } from "@/lib/locale-context";
import { sanitizeAmount, sanitizeCount } from "@/lib/price-input";
import type { StepProps } from "./types";

export function StepPrice({ data, onChange }: StepProps) {
  const { t } = useTranslations();

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">
          {t("events.wizard.priceType")}
        </span>
        <div className="flex gap-2">
          {(["FREE", "PAID", "DONATION"] as const).map((priceType) => (
            <button
              key={priceType}
              type="button"
              onClick={() => onChange({ priceType })}
              className={`rounded-md border px-4 py-2 text-sm font-medium ${
                data.priceType === priceType
                  ? "border-transparent accent-gradient text-white"
                  : "border-border hover:bg-surface"
              }`}
            >
              {priceType === "FREE"
                ? t("events.wizard.priceFree")
                : priceType === "DONATION"
                  ? t("events.wizard.priceDonation")
                  : t("events.wizard.pricePaid")}
            </button>
          ))}
        </div>
      </div>

      {data.priceType === "DONATION" && (
        <p className="text-sm text-muted">{t("events.wizard.donationHint")}</p>
      )}

      {data.priceType === "PAID" && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="price" className="text-sm font-medium">
            {t("events.wizard.priceAmount")}
          </label>
          <input
            id="price"
            type="text"
            inputMode="decimal"
            value={data.price}
            onChange={(e) => onChange({ price: sanitizeAmount(e.target.value) })}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
          <p className="text-xs text-muted">{t("events.wizard.priceDigitsHint")}</p>
          <label htmlFor="priceMax" className="mt-2 text-sm font-medium">
            {t("events.wizard.priceMax")}
          </label>
          <input
            id="priceMax"
            type="text"
            inputMode="decimal"
            value={data.priceMax}
            onChange={(e) => onChange({ priceMax: sanitizeAmount(e.target.value) })}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">
          {t("events.wizard.registrationMode")}
        </span>
        <div className="flex gap-2">
          {(["INTERNAL", "EXTERNAL"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => onChange({ registrationMode: mode })}
              className={`rounded-md border px-4 py-2 text-sm font-medium ${
                data.registrationMode === mode
                  ? "border-transparent accent-gradient text-white"
                  : "border-border hover:bg-surface"
              }`}
            >
              {mode === "INTERNAL"
                ? t("events.wizard.regInternal")
                : t("events.wizard.regExternal")}
            </button>
          ))}
        </div>
      </div>

      {data.registrationMode === "EXTERNAL" && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="externalRegistrationUrl" className="text-sm font-medium">
            {t("events.wizard.externalUrl")}
          </label>
          <input
            id="externalRegistrationUrl"
            type="url"
            placeholder="https://"
            value={data.externalRegistrationUrl}
            onChange={(e) =>
              onChange({ externalRegistrationUrl: e.target.value })
            }
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
          <p className="text-xs text-muted-foreground">
            {t("events.wizard.externalHint")}
          </p>
        </div>
      )}

      {data.registrationMode === "INTERNAL" && (
        <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="minParticipants" className="text-sm font-medium">
            {t("events.wizard.minParticipants")}
          </label>
          <input
            id="minParticipants"
            type="text"
            inputMode="numeric"
            value={data.minParticipants}
            onChange={(e) => onChange({ minParticipants: sanitizeCount(e.target.value) })}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="capacity" className="text-sm font-medium">
            {t("events.wizard.capacity")}
          </label>
          <input
            id="capacity"
            type="text"
            inputMode="numeric"
            value={data.capacity}
            onChange={(e) => onChange({ capacity: sanitizeCount(e.target.value) })}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="presetParticipants" className="text-sm font-medium">
            {t("events.wizard.presetParticipants")}
          </label>
          <input
            id="presetParticipants"
            type="text"
            inputMode="numeric"
            value={data.presetParticipants}
            onChange={(e) => onChange({ presetParticipants: sanitizeCount(e.target.value) })}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
          <p className="text-xs text-muted-foreground">
            {t("events.wizard.presetParticipantsHint")}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">
          {t("events.wizard.approvalMode")}
        </span>
        <div className="flex gap-2">
          {(["AUTO", "ORGANIZER_APPROVAL"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => onChange({ approvalMode: mode })}
              className={`rounded-md border px-4 py-2 text-sm font-medium ${
                data.approvalMode === mode
                  ? "border-transparent accent-gradient text-white"
                  : "border-border hover:bg-surface"
              }`}
            >
              {mode === "AUTO"
                ? t("events.wizard.approvalAuto")
                : t("events.wizard.approvalManual")}
            </button>
          ))}
        </div>
      </div>
        </>
      )}
    </div>
  );
}
