"use client";

import type { RegistrationField } from "@/lib/event-types";

/** UX §14 — one input per organizer-defined custom question. */
export function RegistrationFieldInput({
  field,
  value,
  onChange,
}: {
  field: RegistrationField;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const options = field.optionsJson ?? [];

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={field.id} className="text-sm font-medium">
        {field.label}
        {field.required && <span aria-hidden="true"> *</span>}
      </label>

      {field.type === "TEXTAREA" && (
        <textarea
          id={field.id}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
      )}

      {(field.type === "TEXT" || field.type === "PHONE" || field.type === "EMAIL") && (
        <input
          id={field.id}
          type={field.type === "EMAIL" ? "email" : field.type === "PHONE" ? "tel" : "text"}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
      )}

      {field.type === "NUMBER" && (
        <input
          id={field.id}
          type="number"
          value={typeof value === "number" || typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
      )}

      {field.type === "DATE" && (
        <input
          id={field.id}
          type="date"
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
      )}

      {field.type === "SELECT" && (
        <select
          id={field.id}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm"
        >
          <option value="" />
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      )}

      {field.type === "MULTISELECT" && (
        <div className="flex flex-wrap gap-2">
          {options.map((option) => {
            const selected = Array.isArray(value) && value.includes(option);
            return (
              <button
                key={option}
                type="button"
                onClick={() => {
                  const current = Array.isArray(value) ? value : [];
                  onChange(selected ? current.filter((v) => v !== option) : [...current, option]);
                }}
                className={`rounded-full border px-3 py-1 text-xs font-medium ${
                  selected ? "border-transparent accent-gradient text-white" : "border-border hover:bg-surface"
                }`}
              >
                {option}
              </button>
            );
          })}
        </div>
      )}

      {field.type === "CHECKBOX" && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} />
          {field.label}
        </label>
      )}
    </div>
  );
}

