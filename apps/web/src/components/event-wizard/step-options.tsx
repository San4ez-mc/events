"use client";

import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "@/lib/locale-context";
import { TextField } from "@/components/ui/text-field";
import type { RegistrationFieldType } from "@kiro/types";
import type { StepProps, WizardField } from "./types";

const FIELD_TYPES: RegistrationFieldType[] = [
  "TEXT",
  "TEXTAREA",
  "NUMBER",
  "PHONE",
  "EMAIL",
  "SELECT",
  "CHECKBOX",
];
const input = "rounded-md border border-border bg-background px-3 py-2 text-sm";

/** §25/§39/§68 — advanced organizer settings: visibility, deadline, 18+, rules, payment link, custom registration questions. */
export function StepOptions({ data, onChange }: StepProps) {
  const { t } = useTranslations();

  function updateField(index: number, patch: Partial<WizardField>) {
    onChange({
      fields: data.fields.map((f, i) => (i === index ? { ...f, ...patch } : f)),
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">
          {t("events.wizard.visibility")}
        </span>
        <div className="flex gap-2">
          {(["PUBLIC", "PRIVATE"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => onChange({ visibility: v })}
              className={`rounded-md border px-4 py-2 text-sm font-medium ${data.visibility === v ? "accent-gradient border-transparent text-white" : "border-border hover:bg-surface"}`}
            >
              {v === "PUBLIC"
                ? t("events.wizard.visibilityPublic")
                : t("events.wizard.visibilityLink")}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted">
          {t("events.wizard.visibilityHint")}
        </p>
      </div>

      <TextField
        label={t("events.wizard.registrationDeadline")}
        type="datetime-local"
        value={data.registrationDeadline}
        onChange={(v) => onChange({ registrationDeadline: v })}
      />

      <label className="flex items-center justify-between gap-4 text-sm">
        <span>
          <span className="font-medium">{t("events.wizard.adultsOnly")}</span>
          <span className="block text-xs text-muted">
            {t("events.wizard.adultsOnlyHint")}
          </span>
        </span>
        <input
          type="checkbox"
          className="h-5 w-5 accent-[var(--accent-from)]"
          checked={data.adultsOnly}
          onChange={(e) => onChange({ adultsOnly: e.target.checked })}
        />
      </label>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="rules" className="text-sm font-medium">
          {t("events.wizard.rules")}
        </label>
        <textarea
          id="rules"
          rows={4}
          maxLength={10000}
          value={data.rules}
          onChange={(e) => onChange({ rules: e.target.value })}
          className={input}
        />
      </div>

      {data.priceType === "PAID" && (
        <TextField
          label={t("events.wizard.paymentUrl")}
          type="url"
          value={data.paymentUrl}
          onChange={(v) => onChange({ paymentUrl: v })}
          placeholder="https://"
        />
      )}

      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold">
          {t("events.wizard.questions")}
        </h3>
        <p className="text-xs text-muted">{t("events.wizard.questionsHint")}</p>
        {data.fields.map((field, i) => (
          <div
            key={field.id ?? `new-${i}`}
            className="flex flex-col gap-2 rounded-2xl border border-border p-3"
          >
            <div className="flex gap-2">
              <input
                value={field.label}
                onChange={(e) => updateField(i, { label: e.target.value })}
                maxLength={200}
                placeholder={t("events.wizard.questionLabel")}
                aria-label={t("events.wizard.questionLabel")}
                className={`${input} flex-1`}
              />
              <button
                type="button"
                onClick={() =>
                  onChange({
                    fields: data.fields.filter((_, idx) => idx !== i),
                  })
                }
                aria-label={t("common.delete")}
                className="flex h-10 w-10 items-center justify-center rounded-md border border-border hover:bg-surface"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <select
                value={field.type}
                onChange={(e) =>
                  updateField(i, {
                    type: e.target.value as RegistrationFieldType,
                  })
                }
                className={input}
                aria-label={t("events.wizard.questionType")}
              >
                {FIELD_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {t(`events.wizard.fieldTypes.${type}`)}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[var(--accent-from)]"
                  checked={field.required}
                  onChange={(e) =>
                    updateField(i, { required: e.target.checked })
                  }
                />
                {t("events.wizard.questionRequired")}
              </label>
            </div>
            {field.type === "SELECT" && (
              <input
                value={field.options}
                onChange={(e) => updateField(i, { options: e.target.value })}
                placeholder={t("events.wizard.questionOptions")}
                aria-label={t("events.wizard.questionOptions")}
                className={input}
              />
            )}
          </div>
        ))}
        {data.fields.length < 30 && (
          <button
            type="button"
            onClick={() =>
              onChange({
                fields: [
                  ...data.fields,
                  { label: "", type: "TEXT", required: false, options: "" },
                ],
              })
            }
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-dashed border-border text-sm font-medium hover:bg-surface"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            {t("events.wizard.addQuestion")}
          </button>
        )}
      </section>
      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold">{t("events.wizard.faq")}</h3>
        <p className="text-xs text-muted">{t("events.wizard.faqHint")}</p>
        {data.faq.map((item, i) => (
          <div
            key={i}
            className="flex flex-col gap-2 rounded-2xl border border-border p-3"
          >
            <div className="flex gap-2">
              <input
                value={item.question}
                maxLength={200}
                onChange={(e) =>
                  onChange({
                    faq: data.faq.map((f, idx) =>
                      idx === i ? { ...f, question: e.target.value } : f,
                    ),
                  })
                }
                placeholder={t("events.wizard.faqQuestion")}
                aria-label={t("events.wizard.faqQuestion")}
                className={`${input} flex-1`}
              />
              <button
                type="button"
                onClick={() =>
                  onChange({ faq: data.faq.filter((_, idx) => idx !== i) })
                }
                aria-label={t("common.delete")}
                className="flex h-10 w-10 items-center justify-center rounded-md border border-border hover:bg-surface"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <textarea
              value={item.answer}
              rows={2}
              maxLength={2000}
              onChange={(e) =>
                onChange({
                  faq: data.faq.map((f, idx) =>
                    idx === i ? { ...f, answer: e.target.value } : f,
                  ),
                })
              }
              placeholder={t("events.wizard.faqAnswer")}
              aria-label={t("events.wizard.faqAnswer")}
              className={input}
            />
          </div>
        ))}
        {data.faq.length < 20 && (
          <button
            type="button"
            onClick={() =>
              onChange({ faq: [...data.faq, { question: "", answer: "" }] })
            }
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-dashed border-border text-sm font-medium hover:bg-surface"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            {t("events.wizard.addFaq")}
          </button>
        )}
      </section>
    </div>
  );
}
