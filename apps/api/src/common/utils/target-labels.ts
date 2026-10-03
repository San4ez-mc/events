import type { PrismaService } from "../../prisma/prisma.service";

export interface TargetInfo {
  /** Human-readable name of the thing a report/case/audit row points at (an event title, a user's name...). */
  label: string;
  /** Present for events (and reviews, via their event) so clients can open the public page. */
  slug?: string;
  /** Present for users so clients can open their profile. */
  userId?: string;
  /** A short excerpt of the content, so a moderator can judge it without opening anything. */
  excerpt?: string;
}

export interface TargetRef {
  type: string;
  id: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const key = (type: string, id: string) => `${type.toUpperCase()}:${id}`;
const cut = (s: string | null | undefined, n: number) => (s ? (s.length > n ? `${s.slice(0, n)}…` : s) : undefined);
const personName = (u: { name: string | null; nickname: string | null; email: string }) => u.name ?? u.nickname ?? u.email;

/**
 * Admin screens used to show "EVENT (3f2a…uuid)" for reports, moderation cases and audit rows — meaningless to a
 * human. This resolves those type+id pairs to a readable label (and a slug/user id to open) in three batched queries.
 * Unknown types or ids (deleted rows, non-entity audit rows) simply have no entry.
 */
export async function resolveTargets(prisma: PrismaService, refs: TargetRef[]): Promise<Map<string, TargetInfo>> {
  const out = new Map<string, TargetInfo>();
  const idsOf = (type: string) => [...new Set(refs.filter((r) => r.type.toUpperCase() === type && UUID.test(r.id)).map((r) => r.id))];

  const [events, users, reviews] = await Promise.all([
    idsOf("EVENT").length
      ? prisma.event.findMany({ where: { id: { in: idsOf("EVENT") } }, select: { id: true, title: true, slug: true, description: true } })
      : [],
    idsOf("USER").length
      ? prisma.user.findMany({ where: { id: { in: idsOf("USER") } }, select: { id: true, name: true, nickname: true, email: true } })
      : [],
    idsOf("REVIEW").length
      ? prisma.eventReview.findMany({
          where: { id: { in: idsOf("REVIEW") } },
          select: { id: true, text: true, rating: true, event: { select: { title: true, slug: true } } },
        })
      : [],
  ]);

  for (const e of events) out.set(key("EVENT", e.id), { label: e.title, slug: e.slug, excerpt: cut(e.description, 240) });
  for (const u of users) out.set(key("USER", u.id), { label: personName(u), userId: u.id });
  for (const r of reviews) {
    out.set(key("REVIEW", r.id), { label: r.event.title, slug: r.event.slug, excerpt: cut(r.text, 240) ?? `★ ${r.rating}` });
  }
  return out;
}

export function targetFor(map: Map<string, TargetInfo>, type: string, id: string): TargetInfo | null {
  return map.get(key(type, id)) ?? null;
}
