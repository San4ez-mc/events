"use client";

import { captureEvent } from "@/lib/product-analytics";

/**
 * The main action, always within reach on phones and tablets: price on the left, the button on the right, floating
 * above the tab bar. Events that sell/register elsewhere open the organizer's link; the rest scroll to the form.
 * (On wide screens the registration card is already pinned beside the photo, so this bar is hidden there.)
 */
export function EventCtaBar({
  eventId,
  priceLabel,
  label,
  externalUrl,
}: {
  eventId: string;
  priceLabel: string;
  label: string;
  externalUrl: string | null;
}) {
  const classes =
    "accent-gradient inline-flex min-h-11 flex-1 items-center justify-center rounded-[10px] px-4 text-center text-sm font-semibold leading-tight text-white active:opacity-80 sm:flex-none sm:px-6 sm:text-[15px]";
  return (
    <div className="fixed inset-x-0 bottom-[calc(3.9rem+env(safe-area-inset-bottom))] z-30 border-t border-border bg-background px-4 py-2.5 sm:bottom-0 lg:hidden">
      <div className="mx-auto flex max-w-2xl items-center justify-between gap-4">
        <span className="text-base font-extrabold">{priceLabel}</span>
        {externalUrl ? (
          <a
            href={externalUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => captureEvent("external_registration_click", { event_id: eventId })}
            className={classes}
          >
            {label}
          </a>
        ) : (
          <button type="button" onClick={() => document.getElementById("register")?.scrollIntoView({ behavior: "smooth", block: "start" })} className={classes}>
            {label}
          </button>
        )}
      </div>
    </div>
  );
}
