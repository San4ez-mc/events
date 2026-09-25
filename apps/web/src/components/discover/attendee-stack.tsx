import type { SocialProof } from "@/lib/event-types";

type Person = SocialProof["attendeePreviews"][number];

function Avatar({ person, size }: { person: Person; size: number }) {
  const initial = (person.name ?? "?").slice(0, 1).toUpperCase();
  const style = { width: size, height: size };
  return person.avatarUrl ? (
    // eslint-disable-next-line @next/next/no-img-element -- external avatar URLs
    <img
      src={person.avatarUrl}
      alt={person.name ?? ""}
      draggable={false}
      style={style}
      className="rounded-full border-2 border-black/40 object-cover"
    />
  ) : (
    <span
      style={style}
      className="accent-gradient flex items-center justify-center rounded-full border-2 border-black/40 text-[10px] font-bold text-white"
    >
      {initial}
    </span>
  );
}

/** Overlapping avatars + "+N" for the rest — the "👤 👤 👤 +11" from UX §3. Only opt-in participants are ever passed in (§83). */
export function AttendeeStack({
  people,
  total,
  size = 26,
}: {
  people: Person[];
  total: number;
  size?: number;
}) {
  if (total <= 0) return null;
  const extra = Math.max(0, total - people.length);
  return (
    <span className="inline-flex items-center">
      {people.map((p, i) => (
        <span
          key={p.id}
          className={i === 0 ? "" : "-ml-2"}
          title={p.name ?? undefined}
        >
          <Avatar person={p} size={size} />
        </span>
      ))}
      {extra > 0 && (
        <span
          style={{ height: size, minWidth: size }}
          className={`${people.length ? "-ml-2" : ""} flex items-center justify-center rounded-full border-2 border-black/40 bg-white/25 px-1.5 text-[11px] font-bold text-white backdrop-blur`}
        >
          +{extra}
        </span>
      )}
    </span>
  );
}
