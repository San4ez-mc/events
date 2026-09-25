import { Injectable } from "@nestjs/common";
import type { RegistrationStatus } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";

/** Registrations that count as "going" — the same set the event page uses. */
const ACTIVE_STATUSES: RegistrationStatus[] = ["REGISTERED", "PAYMENT_PENDING", "CONFIRMED"];
const PREVIEW_LIMIT = 5;

export interface AttendeePreview {
  id: string;
  name: string | null;
  avatarUrl: string | null;
}

/** UX §3 / §83 — what a card shows besides the photo. Only counts + opt-in previews, never contact data. */
export interface SocialProof {
  registeredCount: number;
  attendeePreviews: AttendeePreview[];
  friendsGoingCount: number;
  organizerRating: { average: number | null; reviewsCount: number };
}

@Injectable()
export class SocialProofService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Batch-decorates a page of events with social proof: a handful of queries total
   * regardless of page size (no N+1). `viewerId` personalises the friends count.
   */
  async attach<T extends { id: string; ownerId: string }>(
    events: T[],
    viewerId: string | undefined,
  ): Promise<(T & { social: SocialProof })[]> {
    if (events.length === 0) return [];
    const eventIds = events.map((e) => e.id);
    const ownerIds = [...new Set(events.map((e) => e.ownerId))];

    const [counts, previewRows, friendIds, ownerRating] = await Promise.all([
      this.prisma.registration.groupBy({
        by: ["eventId"],
        where: { eventId: { in: eventIds }, status: { in: ACTIVE_STATUSES } },
        _count: { _all: true },
      }),
      this.prisma.registration.findMany({
        where: { eventId: { in: eventIds }, status: { in: ACTIVE_STATUSES }, showAsParticipant: true },
        orderBy: { registeredAt: "asc" },
        select: { eventId: true, user: { select: { id: true, name: true, nickname: true, avatarUrl: true } } },
      }),
      this.getFriendIds(viewerId),
      this.organizerRatings(ownerIds),
    ]);

    const countByEvent = new Map(counts.map((c) => [c.eventId, c._count._all]));

    const previewsByEvent = new Map<string, AttendeePreview[]>();
    for (const row of previewRows) {
      const list = previewsByEvent.get(row.eventId) ?? [];
      if (list.length < PREVIEW_LIMIT) {
        list.push({ id: row.user.id, name: row.user.name ?? row.user.nickname, avatarUrl: row.user.avatarUrl });
        previewsByEvent.set(row.eventId, list);
      }
    }

    const friendsGoing = new Map<string, number>();
    if (friendIds.size > 0) {
      const rows = await this.prisma.registration.groupBy({
        by: ["eventId"],
        where: { eventId: { in: eventIds }, status: { in: ACTIVE_STATUSES }, userId: { in: [...friendIds] } },
        _count: { _all: true },
      });
      for (const r of rows) friendsGoing.set(r.eventId, r._count._all);
    }

    return events.map((event) => ({
      ...event,
      social: {
        registeredCount: countByEvent.get(event.id) ?? 0,
        attendeePreviews: previewsByEvent.get(event.id) ?? [],
        friendsGoingCount: friendsGoing.get(event.id) ?? 0,
        organizerRating: ownerRating.get(event.ownerId) ?? { average: null, reviewsCount: 0 },
      },
    }));
  }

  private async getFriendIds(viewerId: string | undefined): Promise<Set<string>> {
    if (!viewerId) return new Set();
    const friendships = await this.prisma.friendship.findMany({
      where: { status: "ACCEPTED", OR: [{ requesterId: viewerId }, { addresseeId: viewerId }] },
      select: { requesterId: true, addresseeId: true },
    });
    return new Set(friendships.map((f) => (f.requesterId === viewerId ? f.addresseeId : f.requesterId)));
  }

  /** Organizer rating = average over all published reviews of their events (§38). */
  private async organizerRatings(ownerIds: string[]) {
    const rows = await this.prisma.eventReview.findMany({
      where: { status: "PUBLISHED", event: { ownerId: { in: ownerIds } } },
      select: { rating: true, event: { select: { ownerId: true } } },
    });
    const sums = new Map<string, { total: number; count: number }>();
    for (const r of rows) {
      const acc = sums.get(r.event.ownerId) ?? { total: 0, count: 0 };
      acc.total += r.rating;
      acc.count += 1;
      sums.set(r.event.ownerId, acc);
    }
    return new Map(
      [...sums].map(([ownerId, { total, count }]) => [ownerId, { average: Math.round((total / count) * 10) / 10, reviewsCount: count }]),
    );
  }
}
