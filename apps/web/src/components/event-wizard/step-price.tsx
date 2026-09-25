"use client";

import { useTranslations } from "@/lib/locale-context";
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
          {(["FREE", "PAID"] as const).map((priceType) => (
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
                : t("events.wizard.pricePaid")}
            </button>
          ))}
        </div>
      </div>

      {data.priceType === "PAID" && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="price" className="text-sm font-medium">
            {t("events.wizard.priceAmount")}
          </label>
          <input
            id="price"
            type="number"
            min={0}
            step="0.01"
            value={data.price}
            onChange={(e) => onChange({ price: e.target.value })}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="minParticipants" className="text-sm font-medium">
            {t("events.wizard.minParticipants")}
          </label>
          <input
            id="minParticipants"
            type="number"
            min={1}
            value={data.minParticipants}
            onChange={(e) => onChange({ minParticipants: e.target.value })}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="capacity" className="text-sm font-medium">
            {t("events.wizard.capacity")}
          </label>
          <input
            id="capacity"
            type="number"
            min={1}
            value={data.capacity}
            onChange={(e) => onChange({ capacity: e.target.value })}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
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
    </div>
  );
}
