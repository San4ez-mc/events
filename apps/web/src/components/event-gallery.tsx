"use client";

import { useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import type { EventMedia } from "@/lib/event-types";

/**
 * UX §10 — gallery of up to 10 photos and videos. Native scroll-snap so it
 * swipes on phones and scrolls with the mouse; arrows + counter for desktop.
 */
export function EventGallery({ media }: { media: EventMedia[] }) {
  const scroller = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);

  if (media.length === 0) {
    return (
      <div className="accent-gradient mb-6 flex aspect-[3/4] w-full items-center justify-center rounded-2xl text-white/80">
        <CalendarDays className="h-16 w-16" strokeWidth={1.5} />
      </div>
    );
  }

  function go(delta: number) {
    const el = scroller.current;
    if (!el) return;
    const next = Math.min(media.length - 1, Math.max(0, index + delta));
    el.scrollTo({ left: next * el.clientWidth, behavior: "smooth" });
  }

  return (
    <div className="relative mb-6">
      <div
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget;
          setIndex(Math.round(el.scrollLeft / el.clientWidth));
        }}
        className="flex snap-x snap-mandatory overflow-x-auto rounded-2xl bg-surface [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {media.map((m) => (
          <div key={m.id} className="aspect-[3/4] w-full shrink-0 snap-center">
            {m.type === "VIDEO" ? (
              <video
                src={m.originalUrl}
                poster={m.thumbnailUrl}
                controls
                playsInline
                preload="metadata"
                className="h-full w-full bg-black object-contain"
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element -- external MinIO URLs
              <img
                src={m.displayUrl}
                alt=""
                draggable={false}
                className="h-full w-full object-cover"
                style={
                  m.focalX ? { objectPosition: `${Number(m.focalX) * 100}% ${Number(m.focalY) * 100}%` } : undefined
                }
              />
            )}
          </div>
        ))}
      </div>

      {media.length > 1 && (
        <>
          <span className="absolute right-3 top-3 rounded-full bg-black/55 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur">
            {index + 1} / {media.length}
          </span>
          <button
            type="button"
            onClick={() => go(-1)}
            disabled={index === 0}
            aria-label="Previous"
            className="absolute left-2 top-1/2 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur disabled:opacity-30 sm:flex"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => go(1)}
            disabled={index === media.length - 1}
            aria-label="Next"
            className="absolute right-2 top-1/2 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur disabled:opacity-30 sm:flex"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
          <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center gap-1.5">
            {media.map((m, i) => (
              <span
                key={m.id}
                className={`h-1.5 rounded-full bg-white transition-all ${i === index ? "w-5 opacity-100" : "w-1.5 opacity-50"}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
