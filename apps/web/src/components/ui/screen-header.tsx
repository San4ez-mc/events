import type { IconType } from "react-icons";
import type { ReactNode } from "react";

/** Page title in the app's style: an accent badge with the section's icon, a big bold title and a muted subtitle. */
export function ScreenHeader({ title, subtitle, Icon, action }: { title: string; subtitle?: string; Icon: IconType; action?: ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="accent-gradient flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-[14px] text-white">
        <Icon className="h-6 w-6" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <h1 className="text-[26px] font-extrabold leading-tight sm:text-[28px]">{title}</h1>
        {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

/** Centered icon + message for empty lists and hints (the app's EmptyState). */
export function EmptyState({ Icon, title, text }: { Icon: IconType; title?: string; text: string }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      <span className="flex h-20 w-20 items-center justify-center rounded-full bg-[var(--accent-from)]/10 text-[var(--accent-from)]">
        <Icon className="h-10 w-10" aria-hidden="true" />
      </span>
      {title && <h2 className="mt-2 text-lg font-bold">{title}</h2>}
      <p className="max-w-xs text-sm text-muted">{text}</p>
    </div>
  );
}
