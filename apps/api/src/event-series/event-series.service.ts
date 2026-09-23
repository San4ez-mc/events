import { Injectable } from "@nestjs/common";
import type { Prisma, Event } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { ApiException } from "../common/exceptions/api.exception";
import { EventAccessService } from "../organizer/event-access.service";
import { slugifyUnique } from "../common/utils/slugify";
import { generateOccurrenceDates } from "./recurrence";
import type { CreateSeriesDto } from "./dto/create-series.dto";

/** Copies every field from the template onto a new occurrence except identity/dates/status/series linkage. */
function copyableFields(template: Event): Omit<Prisma.EventUncheckedCreateInput, "ownerId" | "slug" | "startsAt" | "endsAt" | "seriesId"> {
  return {
    title: template.title,
    description: template.description,
    categoryId: template.categoryId,
    language: template.language,
    visibility: template.visibility,
    format: template.format,
    timezone: template.timezone,
    cityId: template.cityId,
    districtId: template.districtId,
    addressText: template.addressText,
    addressDetails: template.addressDetails as Prisma.InputJsonValue,
    googlePlaceId: template.googlePlaceId,
    latitude: template.latitude,
    longitude: template.longitude,
    onlineUrl: template.onlineUrl,
    capacity: template.capacity,
    minParticipants: template.minParticipants,
    approvalMode: template.approvalMode,
    ageRestriction: template.ageRestriction,
    rules: template.rules,
    priceType: template.priceType,
    price: template.price,
    currency: template.currency,
    paymentUrl: template.paymentUrl,
  };
}

/** §29 — recurring events. Each occurrence is a normal, independent Event row (own status, registrations, credit). */
@Injectable()
export class EventSeriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventAccess: EventAccessService,
  ) {}

  async createSeries(templateEventId: string, userId: string, dto: CreateSeriesDto) {
    const template = await this.eventAccess.assertPermission(templateEventId, userId, "EDIT_EVENT");
    if (template.seriesId) {
      throw new ApiException("VALIDATION_ERROR", "This event is already part of a series", 400);
    }
    if (!template.startsAt) {
      throw new ApiException("VALIDATION_ERROR", "Set a start date before turning this event into a series", 400, {
        startsAt: ["Required"],
      });
    }

    const durationMs = template.endsAt ? template.endsAt.getTime() - template.startsAt.getTime() : null;
    const occurrenceDates = generateOccurrenceDates(template.startsAt, {
      recurrenceType: dto.recurrenceType,
      interval: dto.interval,
      count: dto.count,
      until: dto.until,
    });

    const registrationFields = await this.prisma.registrationField.findMany({ where: { eventId: templateEventId } });

    return this.prisma.$transaction(async (tx) => {
      const series = await tx.eventSeries.create({
        data: {
          ownerId: template.ownerId,
          recurrenceType: dto.recurrenceType,
          recurrenceRuleJson: { interval: dto.interval, count: dto.count, until: dto.until },
          templateEventId,
        },
      });

      await tx.event.update({ where: { id: templateEventId }, data: { seriesId: series.id } });

      const templateData = copyableFields(template);

      const occurrences = [template];
      for (const startsAt of occurrenceDates.slice(1)) {
        const endsAt = durationMs != null ? new Date(startsAt.getTime() + durationMs) : null;
        const occurrence = await tx.event.create({
          data: {
            ...templateData,
            ownerId: template.ownerId,
            seriesId: series.id,
            slug: slugifyUnique(template.title),
            startsAt,
            endsAt,
          },
        });
        if (registrationFields.length > 0) {
          await tx.registrationField.createMany({
            data: registrationFields.map((f) => ({
              eventId: occurrence.id,
              label: f.label,
              type: f.type,
              required: f.required,
              optionsJson: f.optionsJson as Prisma.InputJsonValue,
              sortOrder: f.sortOrder,
            })),
          });
        }
        occurrences.push(occurrence);
      }

      return { series, occurrences };
    });
  }

  async listOccurrences(seriesId: string, userId: string) {
    const series = await this.prisma.eventSeries.findUnique({ where: { id: seriesId } });
    if (series && series.ownerId !== userId) {
      // Same "don't leak existence" stance as event drafts.
      return [];
    }
    return this.prisma.event.findMany({
      where: { seriesId },
      orderBy: { startsAt: "asc" },
      include: { media: { take: 1, orderBy: { sortOrder: "asc" } } },
    });
  }
}
