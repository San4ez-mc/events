import { Injectable } from "@nestjs/common";
import { PAGINATION } from "@kiro/config";
import type { CursorPage } from "@kiro/types";
import { PrismaService } from "../prisma/prisma.service";
import { buildPublicEventWhere } from "../common/utils/public-event-filters";
import { EVENT_CARD_INCLUDE, type EventCard } from "../common/utils/event-card-include";
import { decodeScoredCursor, encodeScoredCursor, sliceAfterScoredCursor } from "../common/utils/scored-cursor";
import type { SearchQueryDto } from "./dto/search-query.dto";

/** Same safety valve as discovery — see DiscoveryService for rationale. */
const SEARCH_CANDIDATE_CAP = 500;

interface RelevanceRow {
  id: string;
  relevance: number;
}

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * §56 — search by title, description, category, organizer, city, district
   * via pg_trgm fuzzy matching (`%` operator + `similarity()`), scoped to
   * whichever events already pass the structured filters (§57's filter set,
   * shared with discovery). Ranking + cursor pagination mirror the discovery
   * feed's score+id cursor (see DiscoveryService / scored-cursor.ts) — here
   * "score" is trigram relevance instead of the rule-based feed score.
   */
  async search(query: SearchQueryDto): Promise<CursorPage<EventCard>> {
    const limit = Math.min(query.limit ?? PAGINATION.defaultLimit, PAGINATION.maxLimit);
    const cursor = query.cursor ? decodeScoredCursor(query.cursor) : null;
    const now = new Date();

    const candidateIds = (
      await this.prisma.event.findMany({
        where: buildPublicEventWhere(query, now),
        select: { id: true },
        take: SEARCH_CANDIDATE_CAP,
      })
    ).map((e) => e.id);

    if (candidateIds.length === 0) {
      return { items: [], nextCursor: null, hasMore: false };
    }

    const ranked = await this.prisma.$queryRaw<RelevanceRow[]>`
      SELECT e.id,
        GREATEST(
          similarity(e.title, ${query.q}),
          similarity(coalesce(e.description, ''), ${query.q}),
          similarity(coalesce(c."nameUk", ''), ${query.q}),
          similarity(coalesce(c."nameEn", ''), ${query.q}),
          similarity(coalesce(ci."nameUk", ''), ${query.q}),
          similarity(coalesce(ci."nameEn", ''), ${query.q}),
          similarity(coalesce(d."nameUk", ''), ${query.q}),
          similarity(coalesce(u.name, ''), ${query.q}),
          similarity(coalesce(u.nickname, ''), ${query.q})
        ) AS relevance
      FROM events e
      LEFT JOIN categories c ON c.id = e."categoryId"
      LEFT JOIN cities ci ON ci.id = e."cityId"
      LEFT JOIN districts d ON d.id = e."districtId"
      LEFT JOIN users u ON u.id = e."ownerId"
      WHERE e.id = ANY(${candidateIds}::uuid[])
        AND (
          e.title % ${query.q}
          OR e.description % ${query.q}
          OR c."nameUk" % ${query.q}
          OR c."nameEn" % ${query.q}
          OR ci."nameUk" % ${query.q}
          OR ci."nameEn" % ${query.q}
          OR d."nameUk" % ${query.q}
          OR u.name % ${query.q}
          OR u.nickname % ${query.q}
          OR e.title ILIKE ${"%" + query.q + "%"}
        )
      ORDER BY relevance DESC, e.id ASC
      LIMIT ${SEARCH_CANDIDATE_CAP}
    `;

    const scored = ranked.map((row) => ({ id: row.id, score: Number(row.relevance) }));
    const sliced = sliceAfterScoredCursor(scored, cursor);
    const hasMore = sliced.length > limit;
    const page = hasMore ? sliced.slice(0, limit) : sliced;
    const last = page[page.length - 1];

    const events = await this.prisma.event.findMany({
      where: { id: { in: page.map((p) => p.id) } },
      include: EVENT_CARD_INCLUDE,
    });
    const eventById = new Map(events.map((e) => [e.id, e]));
    const items = page.map((p) => eventById.get(p.id)).filter((e): e is EventCard => e != null);

    return {
      items,
      nextCursor: hasMore && last ? encodeScoredCursor(last.score, last.id) : null,
      hasMore,
    };
  }
}

