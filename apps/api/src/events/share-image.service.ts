import { Injectable } from "@nestjs/common";
import sharp from "sharp";
import { PrismaService } from "../prisma/prisma.service";
import { ResourceNotFoundException } from "../common/exceptions/common-exceptions";

const WIDTH = 1080;
const HEIGHTS = { story: 1920, post: 1350 } as const;

export type ShareImageVariant = 1 | 2 | 3;
export type ShareImageFormat = keyof typeof HEIGHTS;

/** Brand gradient (`accentFrom` -> `accentTo` in apps/mobile/src/lib/theme.tsx and the web's palette). */
const ACCENT_FROM = "#8b5cf6";
const ACCENT_TO = "#ec4899";
const FONT = "DejaVu Sans";

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

const gradientDef = (id: string, x2 = 1, y2 = 1) =>
  `<linearGradient id="${id}" x1="0" y1="0" x2="${x2}" y2="${y2}"><stop offset="0" stop-color="${ACCENT_FROM}"/><stop offset="1" stop-color="${ACCENT_TO}"/></linearGradient>`;

const svg = (w: number, h: number, body: string) => Buffer.from(`<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">${body}</svg>`);

const textLines = (lines: string[], x: number, y: number, step: number, size: number, extra = "") =>
  `<text font-family="${FONT}" font-weight="bold" font-size="${size}" ${extra}>${lines.map((l, i) => `<tspan x="${x}" y="${y + i * step}">${escapeXml(l)}</tspan>`).join("")}</text>`;

/**
 * Marketing §referral — pre-made, ready-to-post images for "share this event": three different designs, each as a
 * story (1080x1920) or a post (1080x1350). Composed server-side with sharp/SVG, so a person never designs anything:
 *   1 "Класика"  — cover photo on top, brand-gradient panel with the details below.
 *   2 "Постер"   — full-bleed photo, big title over a dark fade, date badge.
 *   3 "Яскравий" — brand-gradient background, title on top, the photo as a rounded card.
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
        startsAt: true,
        status: true,
        city: { select: { nameUk: true } },
        media: { orderBy: { sortOrder: "asc" }, take: 1, select: { displayUrl: true, type: true } },
      },
    });
    if (!event || !["PUBLISHED", "COMPLETED"].includes(event.status)) throw new ResourceNotFoundException("Event not found");

    const photo = event.media[0]?.type === "IMAGE" ? event.media[0] : null;
    const photoBuffer = photo ? await this.fetchPhoto(photo.displayUrl) : null;
    const dateLine = event.startsAt ? new Date(event.startsAt).toLocaleDateString("uk-UA", { day: "numeric", month: "long", timeZone: "Europe/Kyiv" }) : "";
    const timeLine = event.startsAt ? new Date(event.startsAt).toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Kyiv" }) : "";
    const ctx = { title: event.title, dateLine, timeLine, city: event.city?.nameUk ?? "", photo: photoBuffer, H: HEIGHTS[format] };

    const layers = variant === 2 ? await this.poster(ctx) : variant === 3 ? await this.bright(ctx) : await this.classic(ctx);
    return sharp({ create: { width: WIDTH, height: ctx.H, channels: 3, background: ACCENT_FROM } }).composite(layers).jpeg({ quality: 90 }).toBuffer();
  }

  // ---------------------------------------------------------------- 1 · classic
  private async classic(c: Ctx): Promise<sharp.OverlayOptions[]> {
    const photoH = Math.round(c.H * 0.6);
    const panelH = c.H - photoH;
    const titleLines = wrapText(c.title, 22, 3);
    const meta = [c.dateLine && `${c.dateLine}${c.timeLine ? `, ${c.timeLine}` : ""}`, c.city].filter(Boolean).join(" · ");
    const panelTop = c.photo ? photoH : 0;
    const panelHeight = c.photo ? panelH : c.H;
    const layers: sharp.OverlayOptions[] = [];
    if (c.photo) {
      layers.push({ input: await sharp(c.photo).resize(WIDTH, photoH, { fit: "cover" }).toBuffer(), top: 0, left: 0 });
      layers.push({ input: svg(WIDTH, 160, `<defs><linearGradient id="f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.35"/></linearGradient></defs><rect width="${WIDTH}" height="160" fill="url(#f)"/>`), top: photoH - 160, left: 0 });
    }
    const body =
      `<defs>${gradientDef("bg")}</defs><rect width="${WIDTH}" height="${panelHeight}" fill="url(#bg)"/>` +
      textLines(titleLines, 64, c.photo ? 96 : 260, 76, 64, 'fill="#fff"') +
      (meta ? `<text x="64" y="${(c.photo ? 96 : 260) + titleLines.length * 76 + 56}" font-family="${FONT}" font-size="36" fill="rgba(255,255,255,0.85)">${escapeXml(meta)}</text>` : "") +
      `<text x="64" y="${panelHeight - 56}" font-family="${FONT}" font-weight="bold" font-size="40" fill="#fff">Кіро</text>` +
      `<text x="64" y="${panelHeight - 16}" font-family="${FONT}" font-size="30" fill="rgba(255,255,255,0.85)">@kiro.ukraine</text>`;
    layers.push({ input: svg(WIDTH, panelHeight, body), top: panelTop, left: 0 });
    return layers;
  }

  // ---------------------------------------------------------------- 2 · poster
  private async poster(c: Ctx): Promise<sharp.OverlayOptions[]> {
    const layers: sharp.OverlayOptions[] = [];
    if (c.photo) layers.push({ input: await sharp(c.photo).resize(WIDTH, c.H, { fit: "cover" }).toBuffer(), top: 0, left: 0 });
    else layers.push({ input: svg(WIDTH, c.H, `<defs>${gradientDef("bg", 0.6, 1)}</defs><rect width="${WIDTH}" height="${c.H}" fill="url(#bg)"/>`), top: 0, left: 0 });
    const titleSize = c.H > 1500 ? 92 : 78;
    const step = Math.round(titleSize * 1.15);
    const titleLines = wrapText(c.title, c.H > 1500 ? 17 : 20, 4);
    const baseY = c.H - 330 - (titleLines.length - 1) * step;
    const badge = [c.dateLine, c.timeLine].filter(Boolean).join(" · ");
    const body =
      `<defs><linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b0b12" stop-opacity="0"/><stop offset="0.45" stop-color="#0b0b12" stop-opacity="0.55"/><stop offset="1" stop-color="#0b0b12" stop-opacity="0.92"/></linearGradient></defs>` +
      `<rect y="${Math.round(c.H * 0.35)}" width="${WIDTH}" height="${c.H - Math.round(c.H * 0.35)}" fill="url(#fade)"/>` +
      (badge ? `<rect x="64" y="72" rx="36" ry="36" width="${Math.min(900, 60 + badge.length * 26)}" height="76" fill="#ffffff"/><text x="94" y="124" font-family="${FONT}" font-weight="bold" font-size="40" fill="#0b0b12">${escapeXml(badge)}</text>` : "") +
      textLines(titleLines, 64, baseY, step, titleSize, 'fill="#fff"') +
      (c.city ? `<text x="64" y="${baseY + (titleLines.length - 1) * step + 70}" font-family="${FONT}" font-size="40" fill="rgba(255,255,255,0.85)">${escapeXml(c.city)}</text>` : "") +
      `<rect x="64" y="${c.H - 150}" rx="12" ry="12" width="12" height="90" fill="${ACCENT_TO}"/>` +
      `<text x="100" y="${c.H - 100}" font-family="${FONT}" font-weight="bold" font-size="46" fill="#fff">Кіро</text>` +
      `<text x="100" y="${c.H - 58}" font-family="${FONT}" font-size="32" fill="rgba(255,255,255,0.8)">@kiro.ukraine · гортай події</text>`;
    layers.push({ input: svg(WIDTH, c.H, body), top: 0, left: 0 });
    return layers;
  }

  // ---------------------------------------------------------------- 3 · bright
  private async bright(c: Ctx): Promise<sharp.OverlayOptions[]> {
    const layers: sharp.OverlayOptions[] = [{ input: svg(WIDTH, c.H, `<defs>${gradientDef("bg", 0.5, 1)}</defs><rect width="${WIDTH}" height="${c.H}" fill="url(#bg)"/><circle cx="960" cy="140" r="260" fill="#fff" opacity="0.08"/><circle cx="90" cy="${c.H - 120}" r="320" fill="#fff" opacity="0.07"/>`), top: 0, left: 0 }];
    const titleLines = wrapText(c.title, c.photo ? 20 : 16, c.photo ? 3 : 5);
    const titleSize = c.photo ? 74 : 92;
    const step = Math.round(titleSize * 1.15);
    const titleTop = 170;
    const cardTop = titleTop + titleLines.length * step + 40;
    const cardH = Math.max(360, Math.min(c.H - cardTop - 360, 900));
    if (c.photo) {
      const w = WIDTH - 140;
      const resized = await sharp(c.photo).resize(w, cardH, { fit: "cover" }).toBuffer();
      const mask = svg(w, cardH, `<rect width="${w}" height="${cardH}" rx="48" ry="48" fill="#fff"/>`);
      layers.push({ input: await sharp(resized).composite([{ input: mask, blend: "dest-in" }]).png().toBuffer(), top: cardTop, left: 70 });
    }
    const metaY = c.photo ? cardTop + cardH + 90 : titleTop + titleLines.length * step + 80;
    const meta = [c.dateLine && `${c.dateLine}${c.timeLine ? `, ${c.timeLine}` : ""}`, c.city].filter(Boolean).join(" · ");
    const body =
      textLines(titleLines, 70, titleTop, step, titleSize, 'fill="#fff"') +
      (meta ? `<text x="70" y="${metaY}" font-family="${FONT}" font-weight="bold" font-size="42" fill="#fff">${escapeXml(meta)}</text>` : "") +
      `<rect x="70" y="${c.H - 210}" rx="46" ry="46" width="560" height="92" fill="#fff"/>` +
      `<text x="110" y="${c.H - 150}" font-family="${FONT}" font-weight="bold" font-size="40" fill="${ACCENT_FROM}">Знайди в Кіро →</text>` +
      `<text x="70" y="${c.H - 70}" font-family="${FONT}" font-size="34" fill="rgba(255,255,255,0.9)">@kiro.ukraine</text>`;
    layers.push({ input: svg(WIDTH, c.H, body), top: 0, left: 0 });
    return layers;
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

interface Ctx {
  title: string;
  dateLine: string;
  timeLine: string;
  city: string;
  photo: Buffer | null;
  H: number;
}
