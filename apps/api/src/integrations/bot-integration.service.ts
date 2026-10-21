import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as argon2 from "argon2";
import { randomUUID } from "node:crypto";
import { DEFAULT_MEDIA_LIMITS } from "@kiro/config";
import type { EnvConfig } from "../config/env.validation";
import { ApiException } from "../common/exceptions/api.exception";
import { hasUtcOffset, kyivLocalToDate } from "../common/utils/kyiv-time";
import { fetchImageSafely } from "../common/utils/safe-image-fetch";
import { PrismaService } from "../prisma/prisma.service";
import { AuthService } from "../auth/auth.service";
import { MailService } from "../mail/mail.service";
import { EventsService } from "../events/events.service";
import { EventMediaService } from "../event-media/event-media.service";
import type { UpdateEventDto } from "../events/dto/update-event.dto";
import type { BotEventDraftDto } from "./dto/bot-event-draft.dto";

/** Stored in `events.source` for everything the Telegram funnel creates (conversion reporting, cleanup, photo upload guard). */
export const BOT_SOURCE = "telegram_bot";
/** Per person and per day: more than this from one address is a loop or abuse, not an organizer. */
const MAX_DRAFTS_PER_EMAIL_PER_DAY = 5;
/** Across everyone: accounts the bot may create per day. */
const MAX_NEW_ACCOUNTS_PER_DAY = 100;
const PLAY_URL = "https://play.google.com/store/apps/details?id=space.fineko.kiro";

@Injectable()
export class BotIntegrationService {
  private readonly logger = new Logger(BotIntegrationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly events: EventsService,
    private readonly media: EventMediaService,
    private readonly mail: MailService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  /**
   * Creates the draft, or — when the funnel passes the same `externalRef` again (a retry, or the person changed an answer) —
   * updates the one it already made. Never publishes.
   */
  async createDraft(dto: BotEventDraftDto) {
    const appUrl = this.config.get("APP_URL", { infer: true });
    const existing = dto.externalRef
      ? await this.prisma.event.findUnique({ where: { source_sourceRef: { source: BOT_SOURCE, sourceRef: dto.externalRef } }, include: { owner: { select: { email: true } } } })
      : null;
    if (existing && existing.owner.email !== dto.email) {
      throw new ApiException("FORBIDDEN", "This reference belongs to another organizer", 403);
    }

    let userId: string;
    let accountCreated = false;
    let eventId: string;
    let created = false;
    let locked = false;

    if (existing) {
      userId = existing.ownerId;
      eventId = existing.id;
      locked = existing.status !== "DRAFT"; // already published/held: the funnel can't change it any more
    } else {
      ({ userId, accountCreated } = await this.findOrCreateOrganizer(dto));
      await this.assertWithinLimits(userId, accountCreated);
      const draft = await this.events.create(userId, { title: dto.title }, { skipWelcomeCredits: accountCreated });
      eventId = draft.id;
      created = true;
      await this.prisma.event.update({ where: { id: eventId }, data: { source: BOT_SOURCE, sourceRef: dto.externalRef ?? null } });
    }

    const rejected = locked ? null : await this.applyAnswers(eventId, userId, dto, !created);

    const saved = await this.prisma.event.findUniqueOrThrow({ where: { id: eventId } });
    const editUrl = `${appUrl}/organizer/events/${saved.id}/edit`;

    if (created) await this.sendCreatedEmail(dto, userId, accountCreated, saved.title, editUrl);

    return {
      eventId: saved.id,
      slug: saved.slug,
      status: saved.status,
      editUrl,
      loginUrl: `${appUrl}/login`,
      accountCreated,
      created,
      alreadyPublished: locked,
      categoryResolved: dto.category ? Boolean(saved.categoryId) : null,
      cityResolved: dto.city ? Boolean(saved.cityId) : null,
      missingForPublish: this.missingForPublish(saved),
      rejected: rejected?.message ?? null,
      rejectedFields: rejected?.fields ?? [],
    };
  }

  /** Adds the cover photo the person sent in the chat (a file, or an https link the funnel got from Telegram). */
  async attachPhoto(eventId: string, imageUrl: string | undefined, file: Express.Multer.File | undefined) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId }, select: { id: true, ownerId: true, status: true, source: true } });
    if (!event || event.source !== BOT_SOURCE) throw new ApiException("NOT_FOUND", "Draft not found", 404);
    if (event.status !== "DRAFT") throw new ApiException("FORBIDDEN", "The event is already published", 403);

    let upload = file;
    if (!upload) {
      if (!imageUrl) throw new ApiException("VALIDATION_ERROR", "Send a file or an imageUrl", 400, { file: ["Required"] });
      const { buffer, mimetype } = await fetchImageSafely(imageUrl, DEFAULT_MEDIA_LIMITS.imageMaxBytes);
      upload = { buffer, mimetype, size: buffer.length, originalname: `telegram-photo.${mimetype.split("/")[1] ?? "jpg"}`, fieldname: "file" } as Express.Multer.File;
    }
    return this.media.upload(event.id, event.ownerId, upload);
  }

  /** Reads the answers into the draft. A bad value (e.g. end before start) must not lose the whole draft. */
  private async applyAnswers(eventId: string, userId: string, dto: BotEventDraftDto, isUpdate: boolean): Promise<{ message: string; fields: string[] } | null> {
    const [categoryId, cityId] = await Promise.all([
      dto.category ? this.resolveCategory(dto.category) : undefined,
      dto.city ? this.resolveCity(dto.city) : undefined,
    ]);

    const patch: UpdateEventDto = {};
    if (isUpdate && dto.title) patch.title = dto.title;
    if (dto.description) patch.description = dto.description;
    if (categoryId) patch.categoryId = categoryId;
    if (dto.format) patch.format = dto.format;
    if (cityId) patch.cityId = cityId;
    if (dto.addressText) patch.addressText = dto.addressText;
    if (dto.onlineUrl) patch.onlineUrl = dto.onlineUrl;
    if (dto.startsAt) patch.startsAt = this.toInstant(dto.startsAt);
    if (dto.endsAt) patch.endsAt = this.toInstant(dto.endsAt);
    if (dto.capacity) patch.capacity = dto.capacity;
    const priceType = dto.priceType ?? (dto.price && dto.price > 0 ? "PAID" : undefined);
    if (priceType) patch.priceType = priceType;
    if (priceType === "PAID" && dto.price !== undefined) patch.price = dto.price;
    if (dto.externalRegistrationUrl) {
      patch.registrationMode = "EXTERNAL";
      patch.externalRegistrationUrl = dto.externalRegistrationUrl;
    }
    if (Object.keys(patch).length === 0) return null;

    try {
      await this.events.update(eventId, userId, patch);
      return null;
    } catch (err) {
      const message = err instanceof Error ? err.message : "update failed";
      this.logger.warn(`bot draft ${eventId}: patch rejected (${message})`);
      const details = err instanceof ApiException ? err.details : undefined;
      return { message, fields: details ? Object.keys(details).filter((k) => k !== "_") : [] };
    }
  }

  /** A time without a zone from the chat means Kyiv wall-clock time; the server itself runs in UTC. */
  private toInstant(value: string): string {
    if (hasUtcOffset(value)) return value;
    const local = kyivLocalToDate(value);
    return local ? local.toISOString() : value;
  }

  private async assertWithinLimits(userId: string, newAccount: boolean): Promise<void> {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const mine = await this.prisma.event.count({ where: { ownerId: userId, source: BOT_SOURCE, createdAt: { gte: since } } });
    if (mine >= MAX_DRAFTS_PER_EMAIL_PER_DAY) throw new ApiException("RATE_LIMITED", "Too many drafts from this address today", 429);
    if (newAccount) {
      const accounts = await this.prisma.event.count({ where: { source: BOT_SOURCE, owner: { createdAt: { gte: since } } } });
      if (accounts >= MAX_NEW_ACCOUNTS_PER_DAY) throw new ApiException("RATE_LIMITED", "Too many new organizers today", 429);
    }
  }

  /**
   * Mail to the address typed in the chat. The organizer is identified only by that email, so the mail is also what proves
   * the person owns it: a new account gets a link to set its password (and the draft follows them in), an existing one gets
   * a notice that a draft was added (so someone typing a stranger's address is visible and harmless).
   */
  private async sendCreatedEmail(dto: BotEventDraftDto, userId: string, accountCreated: boolean, title: string, editUrl: string): Promise<void> {
    try {
      if (accountCreated) {
        const eventPath = new URL(editUrl).pathname;
        const setPasswordUrl = await this.auth.issueSetPasswordUrl(userId, eventPath);
        await this.mail.sendBotDraftWelcomeEmail(dto.email, { title, setPasswordUrl, playUrl: PLAY_URL });
      } else {
        await this.mail.sendBotDraftAddedEmail(dto.email, { title, editUrl });
      }
    } catch (err) {
      this.logger.warn(`bot draft email to ${userId} failed: ${err}`);
    }
  }

  private async findOrCreateOrganizer(dto: BotEventDraftDto): Promise<{ userId: string; accountCreated: boolean }> {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      if (existing.status !== "ACTIVE") {
        throw new ApiException("FORBIDDEN", "This account can't create events", 403);
      }
      return { userId: existing.id, accountCreated: false };
    }

    const passwordHash = await argon2.hash(randomUUID() + randomUUID(), { type: argon2.argon2id });
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        name: dto.organizerName,
        locale: "uk",
        preferences: { create: {} },
      },
    });
    return { userId: user.id, accountCreated: true };
  }

  private async resolveCategory(input: string): Promise<string | undefined> {
    const q = input.trim();
    const hit =
      (await this.prisma.category.findFirst({ where: { slug: q.toLowerCase(), status: "ACTIVE" } })) ??
      (await this.prisma.category.findFirst({
        where: { status: "ACTIVE", nameUk: { contains: q, mode: "insensitive" } },
        orderBy: { sortOrder: "asc" },
      }));
    return hit?.id;
  }

  private async resolveCity(input: string): Promise<string | undefined> {
    const q = input.trim();
    const hit =
      (await this.prisma.city.findFirst({ where: { slug: q.toLowerCase(), status: "ACTIVE" } })) ??
      (await this.prisma.city.findFirst({
        where: { status: "ACTIVE", nameUk: { equals: q, mode: "insensitive" } },
      })) ??
      (await this.prisma.city.findFirst({
        where: { status: "ACTIVE", nameUk: { contains: q, mode: "insensitive" } },
        orderBy: { population: "desc" },
      }));
    return hit?.id;
  }

  /** Same list the publish step enforces, so the funnel can tell the organizer exactly what is left. */
  private missingForPublish(e: {
    categoryId: string | null;
    startsAt: Date | null;
    description: string | null;
    format: string;
    cityId: string | null;
    onlineUrl: string | null;
  }): string[] {
    const missing: string[] = [];
    if (!e.categoryId) missing.push("category");
    if (!e.startsAt) missing.push("startsAt");
    if (!e.description?.trim()) missing.push("description");
    if (e.format === "OFFLINE" && !e.cityId) missing.push("city");
    if (e.format === "ONLINE" && !e.onlineUrl) missing.push("onlineUrl");
    return missing;
  }
}
