import { Injectable } from "@nestjs/common";
import sharp from "sharp";
import { PrismaService } from "../prisma/prisma.service";
import { ResourceNotFoundException } from "../common/exceptions/common-exceptions";

const WIDTH = 1080;
const HEIGHT = 1920;
const PHOTO_HEIGHT = 1150;
const PANEL_HEIGHT = HEIGHT - PHOTO_HEIGHT;

/** Brand gradient (`accentFrom` -> `accentTo` in apps/mobile/src/lib/theme.tsx and the web's accent-gradient utility). */
const ACCENT_FROM = "#8b5cf6";
const ACCENT_TO = "#ec4899";

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Crude but good-enough word wrap for a fixed-width SVG text block — no text-measurement API available server-side. */
function wrapText(text: string, maxCharsPerLine: number, maxLines: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxCharsPerLine && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
    if (lines.length === maxLines - 1) break;
  }
  if (current) lines.push(current);
  if (lines.length > maxLines) lines.length = maxLines;
  const consumed = lines.join(" ").length;
  if (consumed < text.length) {
    const last = lines[lines.length - 1]!;
    lines[lines.length - 1] = last.length > 3 ? `${last.slice(0, last.length - 1)}…` : `${last}…`;
  }
  return lines;
}

/**
 * Marketing §referral — a pre-made, ready-to-post image for "share this event" (story/post format,
 * 1080x1920). Composed server-side with sharp/SVG rather than asking the user to design anything:
 * the event's own cover photo in a fixed slot up top, title/date/city and the @kiro.ukraine handle
 * in a branded gradient panel below. No native image-editing or design work needed on either client.
 */
@Injectable()
export class ShareImageService {
  constructor(private readonly prisma: PrismaService) {}

  async generate(eventId: string): Promise<Buffer> {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: {
        title: true,
        startsAt: true,
        status: true,
        city: { select: { nameUk: true } },
        media: { orderBy: { sortOrder: "asc" }, take: 1, select: { displayUrl: true, type: true } },
      },
    });
    if (!event) throw new ResourceNotFoundException("Event not found");
    if (!["PUBLISHED", "COMPLETED"].includes(event.status)) {
      throw new ResourceNotFoundException("Event not found");
    }

    const photo = event.media[0]?.type === "IMAGE" ? event.media[0] : null;
    const photoBuffer = photo ? await this.fetchPhoto(photo.displayUrl) : null;

    const dateLine = event.startsAt
      ? new Date(event.startsAt).toLocaleDateString("uk-UA", { day: "2-digit", month: "long", year: "numeric" })
      : "";
    const metaLine = [dateLine, event.city?.nameUk].filter(Boolean).join(" · ");

    const titleLines = wrapText(event.title, 22, 3);

    const layers: sharp.OverlayOptions[] = [];

    if (photoBuffer) {
      const cropped = await sharp(photoBuffer)
        .resize(WIDTH, PHOTO_HEIGHT, { fit: "cover" })
        .toBuffer();
      layers.push({ input: cropped, top: 0, left: 0 });
      // A soft fade where the photo meets the gradient panel, so the seam doesn't look like a hard cut.
      layers.push({
        input: Buffer.from(
          `<svg width="${WIDTH}" height="160"><defs><linearGradient id="f" x1="0" y1="0" x2="0" y2="1">` +
            `<stop offset="0" stop-color="#000000" stop-opacity="0"/><stop offset="1" stop-color="#000000" stop-opacity="0.35"/>` +
            `</linearGradient></defs><rect width="${WIDTH}" height="160" fill="url(#f)"/></svg>`,
        ),
        top: PHOTO_HEIGHT - 160,
        left: 0,
      });
    }

    const titleSvgLines = titleLines
      .map((line, i) => `<tspan x="64" y="${96 + i * 76}">${escapeXml(line)}</tspan>`)
      .join("");

    const panelSvg = `
      <svg width="${WIDTH}" height="${PANEL_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="${ACCENT_FROM}"/>
            <stop offset="1" stop-color="${ACCENT_TO}"/>
          </linearGradient>
        </defs>
        <rect width="${WIDTH}" height="${PANEL_HEIGHT}" fill="${photoBuffer ? "url(#bg)" : "url(#bg)"}"/>
        <text font-family="DejaVu Sans" font-weight="bold" font-size="64" fill="#ffffff">${titleSvgLines}</text>
        ${metaLine ? `<text x="64" y="${96 + titleLines.length * 76 + 56}" font-family="DejaVu Sans" font-size="36" fill="rgba(255,255,255,0.85)">${escapeXml(metaLine)}</text>` : ""}
        <text x="64" y="${PANEL_HEIGHT - 56}" font-family="DejaVu Sans" font-weight="bold" font-size="40" fill="#ffffff">Кіро</text>
        <text x="64" y="${PANEL_HEIGHT - 16}" font-family="DejaVu Sans" font-size="30" fill="rgba(255,255,255,0.85)">@kiro.ukraine</text>
      </svg>`;
    if (!photoBuffer) {
      // No photo at all: the gradient panel fills the whole canvas instead of just the bottom third.
      const fullSvg = panelSvg.replace(`width="${WIDTH}" height="${PANEL_HEIGHT}"`, `width="${WIDTH}" height="${HEIGHT}"`);
      return sharp({ create: { width: WIDTH, height: HEIGHT, channels: 3, background: ACCENT_FROM } })
        .composite([{ input: Buffer.from(fullSvg), top: 0, left: 0 }])
        .jpeg({ quality: 90 })
        .toBuffer();
    }

    layers.push({ input: Buffer.from(panelSvg), top: PHOTO_HEIGHT, left: 0 });

    return sharp({ create: { width: WIDTH, height: HEIGHT, channels: 3, background: ACCENT_FROM } })
      .composite(layers)
      .jpeg({ quality: 90 })
      .toBuffer();
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
