import type { ReactNode } from "react";
import {
  Bike,
  Camera,
  Gamepad2,
  Mic,
  Music,
  PartyPopper,
  Pizza,
  Sparkles,
  Ticket,
} from "lucide-react";

const DECOR = [
  { Icon: PartyPopper, cls: "left-[6%] top-[10%] h-14 w-14 rotate-[-12deg]" },
  { Icon: Music, cls: "right-[8%] top-[14%] h-12 w-12 rotate-[10deg]" },
  { Icon: Gamepad2, cls: "left-[12%] top-[42%] h-16 w-16 rotate-[8deg]" },
  { Icon: Pizza, cls: "right-[10%] top-[46%] h-14 w-14 rotate-[-8deg]" },
  { Icon: Bike, cls: "left-[8%] bottom-[14%] h-14 w-14 rotate-[12deg]" },
  { Icon: Camera, cls: "right-[12%] bottom-[12%] h-12 w-12 rotate-[-10deg]" },
  { Icon: Mic, cls: "left-[44%] top-[4%] h-10 w-10 rotate-[6deg]" },
  { Icon: Ticket, cls: "right-[38%] bottom-[5%] h-12 w-12 rotate-[-6deg]" },
  { Icon: Sparkles, cls: "left-[30%] bottom-[24%] h-10 w-10" },
];

/**
 * Playful backdrop for login / register / forgot-password (UX §48 — the
 * product should feel fun, not like a form). Pure CSS + icons so it is
 * instant and themable; a real photo dropped at /public/auth-bg.jpg is picked
 * up automatically as the bottom layer (a missing file just falls back).
 */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div
      className="relative isolate flex min-h-[calc(100dvh-57px)] items-center justify-center overflow-hidden px-4 py-10"
      style={{
        backgroundImage: "url(/auth-bg.jpg)",
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      <div
        className="accent-gradient absolute inset-0 -z-20 opacity-[0.16]"
        aria-hidden="true"
      />
      <div
        className="absolute -left-24 top-10 -z-10 h-72 w-72 rounded-full bg-[var(--accent-from)] opacity-25 blur-3xl"
        aria-hidden="true"
      />
      <div
        className="absolute -right-24 bottom-0 -z-10 h-80 w-80 rounded-full bg-[var(--accent-to)] opacity-25 blur-3xl"
        aria-hidden="true"
      />

      <div aria-hidden="true">
        {DECOR.map(({ Icon, cls }, i) => (
          <Icon
            key={i}
            className={`absolute -z-10 hidden text-[var(--accent-solid)] opacity-30 sm:block ${cls}`}
            strokeWidth={1.5}
          />
        ))}
        {DECOR.slice(0, 5).map(({ Icon, cls }, i) => (
          <Icon
            key={`m${i}`}
            className={`absolute -z-10 text-[var(--accent-solid)] opacity-20 sm:hidden ${cls}`}
            strokeWidth={1.5}
          />
        ))}
      </div>

      <div className="w-full max-w-sm rounded-3xl border border-border bg-background/85 p-6 shadow-xl backdrop-blur-md sm:p-8">
        {children}
      </div>
    </div>
  );
}
