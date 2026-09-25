import { Injectable } from "@nestjs/common";
import sharp from "sharp";
import { extractVideoThumbnail } from "./video-thumbnail";
import { fromBuffer as fileTypeFromBuffer } from "file-type";
import { DEFAULT_MEDIA_LIMITS, MAX_EVENT_MEDIA_FILES } from "@kiro/config";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { ApiException } from "../common/exceptions/api.exception";
import { ForbiddenActionException, ResourceNotFoundException } from "../common/exceptions/common-exceptions";

const DISPLAY_MAX_DIMENSION = 1600;
const THUMBNAIL_MAX_DIMENSION = 400;
const JPEG_QUALITY = 85;

@Injectable()
export class EventMediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async upload(eventId: string, userId: string, file: Express.Multer.File) {
    const event = await this.getOwnedEvent(eventId, userId);

    const existingCount = await this.prisma.eventMedia.count({ where: { eventId } });
    if (existingCount >= MAX_EVENT_MEDIA_FILES) {
      throw new ApiException(
        "MEDIA_LIMIT_REACHED",
        `An event can have at most ${MAX_EVENT_MEDIA_FILES} media files`,
        400,
      );
    }

    // §88 — validate actual file content (magic bytes), never trust the
    // client-supplied MIME type or file extension. Pinned to file-type@16.x
    // deliberately — v17+ dropped CJS support, and this app builds to
    // CommonJS (Nest CLI/tsc), so newer majors fail at require() time.
    const sniffed = await fileTypeFromBuffer(file.buffer);
    if (!sniffed) {
      throw new ApiException("INVALID_FILE_TYPE", "Could not determine file type", 400);
    }

    const isImage = (DEFAULT_MEDIA_LIMITS.allowedImageMimeTypes as readonly string[]).includes(sniffed.mime);
    const isVideo = (DEFAULT_MEDIA_LIMITS.allowedVideoMimeTypes as readonly string[]).includes(sniffed.mime);
    if (!isImage && !isVideo) {
      throw new ApiException(
        "INVALID_FILE_TYPE",
        `Unsupported file type: ${sniffed.mime}`,
        400,
      );
    }

    const maxBytes = isImage ? DEFAULT_MEDIA_LIMITS.imageMaxBytes : DEFAULT_MEDIA_LIMITS.videoMaxBytes;
    if (file.buffer.byteLength > maxBytes) {
      throw new ApiException(
        "FILE_TOO_LARGE",
        `File exceeds the ${Math.round(maxBytes / (1024 * 1024))}MB limit`,
        400,
      );
    }

    const sortOrder = existingCount;

    if (isImage) {
      return this.processAndStoreImage(event.id, file.buffer, sniffed.ext, sortOrder);
    }
    return this.storeVideo(event.id, file.buffer, sniffed.ext, sniffed.mime, sortOrder);
  }

  async reorder(eventId: string, userId: string, mediaIds: string[]) {
    await this.getOwnedEvent(eventId, userId);
    const existing = await this.prisma.eventMedia.findMany({ where: { eventId } });
    const existingIds = new Set(existing.map((m) => m.id));

    if (mediaIds.length !== existing.length || !mediaIds.every((id) => existingIds.has(id))) {
      throw new ApiException("VALIDATION_ERROR", "mediaIds must be exactly this event's media set", 400);
    }

    await this.prisma.$transaction(
      mediaIds.map((id, index) =>
        this.prisma.eventMedia.update({ where: { id }, data: { sortOrder: index } }),
      ),
    );

    return this.prisma.eventMedia.findMany({ where: { eventId }, orderBy: { sortOrder: "asc" } });
  }

  async updateFocalPoint(eventId: string, userId: string, mediaId: string, focalX: number, focalY: number) {
    await this.getOwnedEvent(eventId, userId);
    const media = await this.prisma.eventMedia.findUnique({ where: { id: mediaId } });
    if (!media || media.eventId !== eventId) throw new ResourceNotFoundException("Media not found");

    return this.prisma.eventMedia.update({
      where: { id: mediaId },
      data: { focalX, focalY },
    });
  }

  async remove(eventId: string, userId: string, mediaId: string) {
    await this.getOwnedEvent(eventId, userId);
    const media = await this.prisma.eventMedia.findUnique({ where: { id: mediaId } });
    if (!media || media.eventId !== eventId) throw new ResourceNotFoundException("Media not found");

    await this.prisma.eventMedia.delete({ where: { id: mediaId } });
    // Best-effort — an orphaned object in storage costs space, not correctness.
    await Promise.all(
      [media.originalUrl, media.displayUrl, media.thumbnailUrl]
        .map((url) => this.keyFromPublicUrl(url))
        .filter((key): key is string => Boolean(key))
        .map((key) => this.storage.deleteObject(key)),
    );
  }

  private async processAndStoreImage(eventId: string, buffer: Buffer, ext: string, sortOrder: number) {
    const original = sharp(buffer, { failOn: "none" });
    const metadata = await original.metadata();

    // §23 — strip EXIF/metadata by re-encoding (sharp drops it by default
    // unless .withMetadata() is called, which we deliberately don't call).
    const originalKey = this.storage.buildKey(`events/${eventId}/original`, `image.${ext}`);
    await this.storage.putObject(originalKey, buffer, `image/${ext === "jpg" ? "jpeg" : ext}`);

    const displayBuffer = await sharp(buffer, { failOn: "none" })
      .rotate() // apply EXIF orientation before stripping it
      .resize(DISPLAY_MAX_DIMENSION, DISPLAY_MAX_DIMENSION, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: JPEG_QUALITY })
      .toBuffer();
    const displayKey = this.storage.buildKey(`events/${eventId}/display`, "image.jpg");
    await this.storage.putObject(displayKey, displayBuffer, "image/jpeg");

    const thumbnailBuffer = await sharp(buffer, { failOn: "none" })
      .rotate()
      .resize(THUMBNAIL_MAX_DIMENSION, THUMBNAIL_MAX_DIMENSION, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: JPEG_QUALITY })
      .toBuffer();
    const thumbnailKey = this.storage.buildKey(`events/${eventId}/thumbnail`, "image.jpg");
    await this.storage.putObject(thumbnailKey, thumbnailBuffer, "image/jpeg");

    return this.prisma.eventMedia.create({
      data: {
        eventId,
        type: "IMAGE",
        originalUrl: this.storage.publicUrl(originalKey),
        displayUrl: this.storage.publicUrl(displayKey),
        thumbnailUrl: this.storage.publicUrl(thumbnailKey),
        width: metadata.width,
        height: metadata.height,
        sortOrder,
        moderationStatus: "APPROVED", // §41 — no mandatory pre-moderation for MVP
      },
    });
  }

  /**
   * No transcoding — the original is served as both original and display. The thumbnail is a poster frame
   * extracted with ffmpeg when it is installed (see video-thumbnail.ts), otherwise it points at the video itself.
   */
  private async storeVideo(eventId: string, buffer: Buffer, ext: string, mime: string, sortOrder: number) {
    const key = this.storage.buildKey(`events/${eventId}/video`, `video.${ext}`);
    const { url } = await this.storage.putObject(key, buffer, mime);

    // Poster frame (best-effort): falls back to the video URL when ffmpeg isn't available.
    let thumbnailUrl = url;
    const poster = await extractVideoThumbnail(buffer, ext);
    if (poster) {
      const thumbKey = this.storage.buildKey(`events/${eventId}/video-thumb`, "thumb.jpg");
      thumbnailUrl = (await this.storage.putObject(thumbKey, poster, "image/jpeg")).url;
    }

    return this.prisma.eventMedia.create({
      data: {
        eventId,
        type: "VIDEO",
        originalUrl: url,
        displayUrl: url,
        thumbnailUrl,
        sortOrder,
        moderationStatus: "APPROVED",
      },
    });
  }

  private keyFromPublicUrl(url: string): string | null {
    try {
      const parsed = new URL(url);
      // "/bucket/key..." -> "key..."
      const parts = parsed.pathname.split("/").filter(Boolean);
      return parts.slice(1).join("/") || null;
    } catch {
      return null;
    }
  }

  private async getOwnedEvent(eventId: string, userId: string) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) throw new ResourceNotFoundException("Event not found");
    if (event.ownerId !== userId) throw new ForbiddenActionException();
    return event;
  }
}
