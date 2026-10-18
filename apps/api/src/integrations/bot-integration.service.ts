import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as argon2 from "argon2";
import { randomUUID } from "node:crypto";
import type { EnvConfig } from "../config/env.validation";
import { ApiException } from "../common/exceptions/api.exception";
import { PrismaService } from "../prisma/prisma.service";
import { AuthService } from "../auth/auth.service";
import { EventsService } from "../events/events.service";
import type { UpdateEventDto } from "../events/dto/update-event.dto";
import type { BotEventDraftDto } from "./dto/bot-event-draft.dto";

@Injectable()
export class BotIntegrationService {
  private readonly logger = new Logger(BotIntegrationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly events: EventsService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  async createDraft(dto: BotEventDraftDto) {
    const { userId, accountCreated } = await this.findOrCreateOrganizer(dto);

    const draft = await this.events.create(userId, { title: dto.title });

    const [categoryId, cityId] = await Promise.all([
      dto.category ? this.resolveCategory(dto.category) : undefined,
      dto.city ? this.resolveCity(dto.city) : undefined,
    ]);

    const patch: UpdateEventDto = {};
    if (dto.description) patch.description = dto.description;
    if (categoryId) patch.categoryId = categoryId;
    if (dto.format) patch.format = dto.format;
    if (cityId) patch.cityId = cityId;
    if (dto.addressText) patch.addressText = dto.addressText;
    if (dto.onlineUrl) patch.onlineUrl = dto.onlineUrl;
    if (dto.startsAt) patch.startsAt = dto.startsAt;
    if (dto.endsAt) patch.endsAt = dto.endsAt;
    if (dto.capacity) patch.capacity = dto.capacity;
    const priceType = dto.priceType ?? (dto.price && dto.price > 0 ? "PAID" : undefined);
    if (priceType) patch.priceType = priceType;
    if (priceType === "PAID" && dto.price !== undefined) patch.price = dto.price;
    if (dto.externalRegistrationUrl) {
      patch.registrationMode = "EXTERNAL";
      patch.externalRegistrationUrl = dto.externalRegistrationUrl;
    }

    // A bad value from the chat (e.g. end before start) must not lose the whole draft: keep the bare draft
    // and tell the funnel what didn't make it so it can say so to the organizer.
    let rejected: string | null = null;
    if (Object.keys(patch).length > 0) {
      try {
        await this.events.update(draft.id, userId, patch);
      } catch (err) {
        rejected = err instanceof Error ? err.message : "update failed";
        this.logger.warn(`bot draft ${draft.id}: patch rejected (${rejected})`);
      }
    }

    const saved = await this.prisma.event.findUniqueOrThrow({ where: { id: draft.id } });
    const missing = this.missingForPublish(saved);
    const appUrl = this.config.get("APP_URL", { infer: true });

    return {
      eventId: saved.id,
      slug: saved.slug,
      status: saved.status,
      editUrl: `${appUrl}/organizer/events/${saved.id}/edit`,
      loginUrl: `${appUrl}/login`,
      accountCreated,
      categoryResolved: dto.category ? Boolean(categoryId) : null,
      cityResolved: dto.city ? Boolean(cityId) : null,
      missingForPublish: missing,
      rejected,
    };
  }

  /**
   * The organizer is identified only by the email they typed in the chat. A new account gets a random password
   * and a "set your password" mail, so the person can sign in to the draft; for an existing account we add a DRAFT
   * only (nothing becomes public without that person publishing it themselves).
   */
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
    await this.auth.forgotPassword(user.email).catch((err) => this.logger.warn(`set-password mail failed: ${err}`));
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
