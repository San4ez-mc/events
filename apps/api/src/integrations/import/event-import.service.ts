import { Injectable, Logger } from "@nestjs/common";
import { DEFAULT_MEDIA_LIMITS } from "@kiro/config";
import * as argon2 from "argon2";
import { randomBytes } from "node:crypto";
import { fetchImageSafely } from "../../common/utils/safe-image-fetch";
import { PrismaService } from "../../prisma/prisma.service";
import { EventsService } from "../../events/events.service";
import { EventMediaService } from "../../event-media/event-media.service";
import { matchCity, hintCity, type CityRow } from "./cities";
import { OTTRY_SOURCE, ottryUrls, parseOttryEvent } from "./ottry";
import { parseJsonLdEvent, parseKontramarkaEvent, sitemapLocs } from "./jsonld";
import type { ExternalEvent, ParseResult } from "./types";

/** The one profile every imported event is published under, so we never create a profile per organizer. */
export const EXTERNAL_ORGANIZER_EMAIL = "external-organizer@listings.kiro.invalid";
const EXTERNAL_ORGANIZER_NAME = "Зовнішній організатор";
const EXTERNAL_ORGANIZER_BIO = "Події з відкритих джерел. Реєстрація й квитки — на сайті організатора: кнопка на сторінці події веде на нього.";
const USER_AGENT = "KiroAfishaBot/1.0 (+https://kiro.fineko.space)";

interface SourceConfig {
  id: string;
  /** Sitemap(s) with the event URLs; a sitemap index is followed one level down (`indexFilter`). */
  sitemaps: string[];
  indexFilter?: RegExp;
  listUrls: (xml: string) => string[];
  parse: (html: string, url: string) => ParseResult;
  /** Pause between page requests. kontramarka.ua asks for 10 seconds in its robots.txt. */
  delayMs: number;
}

export const SOURCES: Record<string, SourceConfig> = {
  ottry: {
    id: OTTRY_SOURCE,
    sitemaps: ["https://ottry.com/sitemap.xml"],
    listUrls: ottryUrls,
    parse: parseOttryEvent,
    delayMs: 300,
  },
  concert_ua: {
    id: "concert_ua",
    sitemaps: ["https://concert.ua/uk/sitemap/eventpages.xml"],
    listUrls: (xml) => sitemapLocs(xml).filter((u) => /^https:\/\/concert\.ua\/uk\/event\/[^/?#]+$/.test(u)),
    parse: (html, url) => parseJsonLdEvent(html, url, "concert_ua"),
    delayMs: 600,
  },
  kontramarka: {
    id: "kontramarka",
    sitemaps: ["https://kontramarka.ua/uk/sitemap.xml"],
    listUrls: (xml) => sitemapLocs(xml).filter((u) => /^https:\/\/kontramarka\.ua\/uk\/[^/?#]+\.html$/.test(u)),
    parse: parseKontramarkaEvent,
    delayMs: 10_000,
  },
};

export interface ImportOptions {
  /** Events to publish at most in this run (default 25). */
  limit?: number;
  /** Source pages to read at most in this run (default 150); rejected pages are re-read next run, so use `offset` to move on. */
  scan?: number;
  offset?: number;
  /** Only events starting on/after / before these dates (ISO). Default: from now. */
  from?: string;
  to?: string;
  /** Only pages whose URL or title match this case-insensitive regex (e.g. "halloween|хелловін"). */
  include?: string;
  /** Only these cities (by our city slug or Ukrainian name). */
  cities?: string[];
  dryRun?: boolean;
}

export interface ImportReport {
  source: string;
  created: Array<{ title: string; city: string; startsAt: string; slug?: string }>;
  skipped: Array<{ url: string; title?: string; reason: string }>;
  failed: Array<{ url: string; error: string }>;
  scanned: number;
  nextOffset: number;
  totalUrls: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

@Injectable()
export class EventImportService {
  private readonly logger = new Logger(EventImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
    private readonly media: EventMediaService,
  ) {}

  async ensureExternalOrganizer(): Promise<string> {
    const existing = await this.prisma.user.findUnique({ where: { email: EXTERNAL_ORGANIZER_EMAIL }, select: { id: true } });
    if (existing) return existing.id;
    const created = await this.prisma.user.create({
      data: {
        email: EXTERNAL_ORGANIZER_EMAIL,
        // Not a person: no usable password, so nobody can sign in as this profile.
        passwordHash: await argon2.hash(randomBytes(32).toString("hex")),
        name: EXTERNAL_ORGANIZER_NAME,
        bio: EXTERNAL_ORGANIZER_BIO,
        status: "ACTIVE",
        role: "USER",
        organizerActivatedAt: new Date(),
      },
      select: { id: true },
    });
    return created.id;
  }

  private async fetchText(url: string): Promise<string> {
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, "Accept-Language": "uk" }, signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    // Postgres rejects NUL bytes in text columns; some listing pages carry them (also as &#0;).
    return (await res.text()).replace(/\u0000/g, "");
  }

  private async collectUrls(cfg: SourceConfig): Promise<string[]> {
    const urls: string[] = [];
    for (const sitemap of cfg.sitemaps) urls.push(...cfg.listUrls(await this.fetchText(sitemap)));
    return [...new Set(urls)];
  }

  async run(sourceId: string, options: ImportOptions = {}): Promise<ImportReport> {
    const cfg = SOURCES[sourceId];
    if (!cfg) throw new Error(`Unknown source "${sourceId}". Known: ${Object.keys(SOURCES).join(", ")}`);
    const limit = options.limit ?? 25;
    const scan = options.scan ?? 150;
    const from = options.from ? new Date(options.from) : new Date();
    const to = options.to ? new Date(options.to) : null;
    const include = options.include ? new RegExp(options.include, "i") : null;
    const wantedCities = options.cities?.map((c) => c.toLowerCase());

    const cities = await this.prisma.city.findMany({ where: { status: "ACTIVE" }, select: { id: true, nameUk: true, nameEn: true, slug: true } });
    const categories = await this.prisma.category.findMany({ where: { status: "ACTIVE" }, select: { id: true, slug: true } });
    const categoryBySlug = new Map(categories.map((c) => [c.slug, c.id]));
    const ownerId = options.dryRun ? "" : await this.ensureExternalOrganizer();

    const all = await this.collectUrls(cfg);
    const known = new Set(
      (await this.prisma.event.findMany({ where: { source: cfg.id }, select: { sourceRef: true } })).map((e) => e.sourceRef),
    );

    const report: ImportReport = { source: cfg.id, created: [], skipped: [], failed: [], scanned: 0, nextOffset: options.offset ?? 0, totalUrls: all.length };
    let i = options.offset ?? 0;
    for (; i < all.length && report.scanned < scan && report.created.length < limit; i++) {
      const url = all[i]!;
      const ref = url.startsWith("https://ottry.com/") ? url.split("/").pop()! : url.replace(/^https?:\/\/[^/]+/, "").replace(/[?#].*$/, "").replace(/\/$/, "");
      if (known.has(ref)) continue;

      report.scanned++;
      let parsed: ParseResult;
      try {
        parsed = cfg.parse(await this.fetchText(url), url);
      } catch (err) {
        report.failed.push({ url, error: (err as Error).message });
        await sleep(cfg.delayMs);
        continue;
      }
      await sleep(cfg.delayMs);

      if ("skip" in parsed) {
        report.skipped.push({ url, reason: parsed.skip });
        continue;
      }
      const ev = parsed.event;
      if (include && !include.test(`${url} ${ev.title}`)) {
        report.skipped.push({ url, title: ev.title, reason: "does not match filter" });
        continue;
      }
      if (ev.startsAt < from || (to && ev.startsAt >= to)) {
        report.skipped.push({ url, title: ev.title, reason: "outside the date window" });
        continue;
      }
      const city = matchCity(ev.city ?? hintCity(ev.venue, ev.title), cities as CityRow[]);
      if (!city) {
        report.skipped.push({ url, title: ev.title, reason: `city not supported (${ev.city ?? "unknown"}; venue: ${ev.venue ?? "-"})` });
        continue;
      }
      const citySlug = cities.find((c) => c.id === city.id)!.slug;
      if (wantedCities && !wantedCities.includes(citySlug) && !wantedCities.includes(city.nameUk.toLowerCase())) {
        report.skipped.push({ url, title: ev.title, reason: `city filter (${city.nameUk})` });
        continue;
      }
      const categoryId = categoryBySlug.get(ev.categorySlug) ?? categoryBySlug.get("culture");
      if (!categoryId) {
        report.skipped.push({ url, title: ev.title, reason: `no category ${ev.categorySlug}` });
        continue;
      }
      if (!ev.imageUrl) {
        report.skipped.push({ url, title: ev.title, reason: "no cover image" });
        continue;
      }
      if (options.dryRun) {
        report.created.push({ title: ev.title, city: city.nameUk, startsAt: ev.startsAt.toISOString() });
        continue;
      }
      const dup = await this.prisma.event.findFirst({ where: { ownerId, title: ev.title, startsAt: ev.startsAt }, select: { id: true } });
      if (dup) {
        report.skipped.push({ url, title: ev.title, reason: "same title and time already exists" });
        continue;
      }
      try {
        const slug = await this.publish(ownerId, ev, city.id, categoryId);
        known.add(ref);
        report.created.push({ title: ev.title, city: city.nameUk, startsAt: ev.startsAt.toISOString(), slug });
      } catch (err) {
        this.logger.warn(`Import of ${url} failed: ${(err as Error).message}`);
        report.failed.push({ url, error: (err as Error).message });
      }
    }
    report.nextOffset = i;
    return report;
  }

  private async publish(ownerId: string, ev: ExternalEvent, cityId: string, categoryId: string): Promise<string> {
    const image = await fetchImageSafely(ev.imageUrl!, DEFAULT_MEDIA_LIMITS.imageMaxBytes);
    const draft = await this.events.create(ownerId, { title: ev.title }, { skipWelcomeCredits: true });
    try {
      const note = [
        ev.timeKnown ? null : "Точний час початку уточнюйте на сторінці квитків.",
        "Квитки й реєстрація — на сайті організатора: кнопка під описом веде на його сторінку.",
      ]
        .filter(Boolean)
        .join("\n");
      const url = new URL(ev.url);
      url.searchParams.set("utm_source", "kiro");
      url.searchParams.set("utm_medium", "afisha");
      const paid = ev.priceMin !== null && ev.priceMin > 0;
      await this.events.update(draft.id, ownerId, {
        description: `${ev.description}\n\n${note}`.trim().slice(0, 10000),
        categoryId,
        format: "OFFLINE",
        cityId,
        visibility: "PUBLIC",
        startsAt: ev.startsAt.toISOString(),
        ...(ev.endsAt ? { endsAt: ev.endsAt.toISOString() } : {}),
        addressText: (ev.address ?? ev.venue ?? "").slice(0, 300),
        priceType: paid ? "PAID" : "FREE",
        ...(paid ? { price: ev.priceMin!, ...(ev.priceMax ? { priceMax: ev.priceMax } : {}) } : {}),
        ageRestriction: ev.ageRestriction,
        registrationMode: "EXTERNAL",
        externalRegistrationUrl: url.toString(),
      });
      const name = "cover.jpg";
      await this.media.upload(draft.id, ownerId, { buffer: image.buffer, originalname: name, mimetype: image.mimetype, size: image.buffer.length, fieldname: "file" } as Express.Multer.File);
      await this.prisma.event.update({ where: { id: draft.id }, data: { status: "PUBLISHED", publishedAt: new Date(), source: ev.source, sourceRef: ev.sourceRef } });
    } catch (err) {
      await this.prisma.event.delete({ where: { id: draft.id } }).catch(() => undefined);
      throw err;
    }
    return draft.slug;
  }
}
