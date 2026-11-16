import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ResourceNotFoundException } from "../common/exceptions/common-exceptions";
import { priceLabel, renderShareImage, themeFor, venueLabel, type ShareImageFormat, type ShareImageVariant } from "./share-image.render";

export type { ShareImageFormat, ShareImageVariant };

/**
 * Marketing §referral — pre-made, ready-to-post images for "share this event": three designs, each as a story or a post.
 * This service loads the event; the drawing itself (layout, colours, safe zones) lives in share-image.render.ts.
 * Every design carries the @kiro.ukraine handle, which is what the referral program checks for.
 */
@Injectable()
export class ShareImageService {
  constructor(private readonly prisma: PrismaService) {}

  async generate(eventId: string, variant: ShareImageVariant = 1, format: ShareImageFormat = "story"): Promise<Buffer> {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: {
        title: true,
        description: true,
        startsAt: true,
        status: true,
        priceType: true,
        price: true,
        priceMax: true,
        currency: true,
        addressText: true,
        city: { select: { nameUk: true } },
        category: { select: { slug: true, parent: { select: { slug: true } } } },
        media: { orderBy: { sortOrder: "asc" }, take: 1, select: { displayUrl: true, type: true } },
      },
    });
    if (!event || !["PUBLISHED", "COMPLETED"].includes(event.status)) throw new ResourceNotFoundException("Event not found");

    const photo = event.media[0]?.type === "IMAGE" ? event.media[0] : null;
    const city = event.city?.nameUk ?? "";
    return renderShareImage({
      title: event.title,
      startsAt: event.startsAt,
      city,
      venue: venueLabel(event.addressText, city),
      price: priceLabel(event.priceType, event.price == null ? null : Number(event.price), event.priceMax == null ? null : Number(event.priceMax), event.currency),
      theme: themeFor({
        title: event.title,
        description: event.description,
        free: event.priceType === "FREE",
        categorySlugs: [event.category?.slug, event.category?.parent?.slug],
      }),
      photo: photo ? await this.fetchPhoto(photo.displayUrl) : null,
      variant,
      format,
    });
  }

  private async fetchPhoto(url: string): Promise<Buffer | null> {
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      return Buffer.from(await res.arrayBuffer());
    } catch {
      return null;
    }
  }
}
