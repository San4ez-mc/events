import sharp from "sharp";

export const WIDTH = 1080;
export const HEIGHTS = { story: 1920, post: 1350 } as const;

export type ShareImageVariant = 1 | 2 | 3;
export type ShareImageFormat = keyof typeof HEIGHTS;

/**
 * Instagram draws its own interface over a story: the profile row at the top (~250 px) and the reply field / link
 * sticker at the bottom (~340 px). Anything important stays between them; the bottom band is left free for the sticker.
 * A feed post has no such overlay.
 */
const SAFE = { story: { top: 250, bottom: 340 }, post: { top: 64, bottom: 64 } } as const;
const MARGIN = 64;
const FONT = "DejaVu Sans";
const HANDLE = "@kiro.ukraine";

// ------------------------------------------------------------------ colours

export interface Theme {
  from: string;
  to: string;
  /** A calm card (fundraisers, remembrance): dark and plain, no festive colours or decoration. */
  calm: boolean;
}

/** Brand gradient (`accentFrom` -> `accentTo` in apps/mobile/src/lib/theme.tsx and the web's palette). */
const BRAND: Theme = { from: "#8b5cf6", to: "#ec4899", calm: false };
const CALM: Theme = { from: "#0f172a", to: "#334155", calm: true };
const FREE: Theme = { from: "#15803d", to: "#22c55e", calm: false };
const BY_CATEGORY: Array<[RegExp, Theme]> = [
  [/^concerts$/, { from: "#6d28d9", to: "#a855f7", calm: false }],
  [/^parties$/, { from: "#be185d", to: "#ec4899", calm: false }],
  [/^(culture|art|cinema)$/, { from: "#0f766e", to: "#06b6d4", calm: false }],
  [/^(sport|outdoor)/, { from: "#c2410c", to: "#f97316", calm: false }],
  [/^kids$/, { from: "#b45309", to: "#f59e0b", calm: false }],
  [/^standup$/, { from: "#b91c1c", to: "#f97316", calm: false }],
];

const CALM_TITLE = /зсу|збір|благодійн|пам['ʼ’]ят|жалоб|вшанув/i;
const CALM_DESCRIPTION = /(збір|збираємо|кошти).{0,40}(зсу|армі|військ)|100\s?%.{0,30}(зсу|на військ)/i;

/** Fundraisers and remembrance events get a quiet card: a party-coloured poster for "100% на ЗСУ" would be tone-deaf. */
export function isCalmEvent(title: string, description?: string | null): boolean {
  return CALM_TITLE.test(title) || CALM_DESCRIPTION.test((description ?? "").slice(0, 600));
}

/** Free events are green, otherwise the colour follows the category (the primary one, then its parent), else the brand gradient. */
export function themeFor(input: { title: string; description?: string | null; free: boolean; categorySlugs: Array<string | undefined | null> }): Theme {
  if (isCalmEvent(input.title, input.description)) return CALM;
  if (input.free) return FREE;
  for (const slug of input.categorySlugs) {
    const hit = slug ? BY_CATEGORY.find(([re]) => re.test(slug)) : undefined;
    if (hit) return hit[1];
  }
  return BRAND;
}

// ------------------------------------------------------------------ text labels

/** "Сьогодні", "Завтра", "Через 3 дні" for the next week, otherwise "15 листопада" (all in Kyiv time). */
export function dayLabel(startsAt: Date, now: Date = new Date()): string {
  const kyivDay = (d: Date) => {
    const [y, m, day] = d.toLocaleDateString("en-CA", { timeZone: "Europe/Kyiv" }).split("-").map(Number);
    return Date.UTC(y!, m! - 1, day!) / 86_400_000;
  };
  const diff = Math.round(kyivDay(startsAt) - kyivDay(now));
  if (diff === 0) return "Сьогодні";
  if (diff === 1) return "Завтра";
  if (diff >= 2 && diff <= 4) return `Через ${diff} дні`;
  if (diff >= 5 && diff <= 7) return `Через ${diff} днів`;
  return startsAt.toLocaleDateString("uk-UA", { day: "numeric", month: "long", timeZone: "Europe/Kyiv" });
}

export function timeLabel(startsAt: Date): string {
  return startsAt.toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Kyiv" });
}

export function priceLabel(priceType: "FREE" | "PAID" | "DONATION", price?: number | null, priceMax?: number | null, currency = "UAH"): string | null {
  if (priceType === "FREE") return "Безкоштовно";
  if (priceType === "DONATION") return "Донат";
  if (!price || price <= 0) return null;
  const unit = currency === "UAH" ? "грн" : currency;
  const num = (n: number) => String(Math.round(n * 100) / 100);
  return priceMax && priceMax > price ? `від ${num(price)} ${unit}` : `${num(price)} ${unit}`;
}

const STREET = /^(вул\.?|вулиця|просп\.?|проспект|бульв\.?|бульвар|пл\.?|площа|пров\.?|провулок|наб\.?|набережна|шосе)(\s|$)/i;

/** The venue name out of "Будинок кіно, вул. Саксаганського, 6" (or "вул. Хрещатик, 1" when it starts with a street). */
export function venueLabel(address: string | null | undefined, city?: string): string | null {
  if (!address) return null;
  const parts = address
    .split(",")
    .map((s) => s.trim())
    .filter((p) => p && p.toLowerCase() !== (city ?? "").toLowerCase());
  if (!parts.length) return null;
  const label = STREET.test(parts[0]!) && parts[1] ? `${parts[0]}, ${parts[1]}` : parts[0]!;
  return label.length > 34 ? `${label.slice(0, 33).trimEnd()}…` : label;
}

// ------------------------------------------------------------------ drawing helpers

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Crude but good-enough word wrap for a fixed-width SVG text block — no text-measurement API available server-side. */
export function wrapText(text: string, maxCharsPerLine: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
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
  }
  if (current) lines.push(current);
  if (lines.length <= maxLines) return lines;
  // Too long: keep the first lines and end the last one with "…" at a word boundary (never "пив…").
  const kept = lines.slice(0, maxLines);
  let last = kept[maxLines - 1]!;
  while (last.includes(" ") && (last.length + 1 > maxCharsPerLine || /(^|\s)\S{1,2}$/.test(last))) last = last.slice(0, last.lastIndexOf(" "));
  kept[maxLines - 1] = `${last}…`;
  return kept;
}

const gradientDef = (id: string, theme: Theme, x2 = 1, y2 = 1) =>
  `<linearGradient id="${id}" x1="0" y1="0" x2="${x2}" y2="${y2}"><stop offset="0" stop-color="${theme.from}"/><stop offset="1" stop-color="${theme.to}"/></linearGradient>`;

const svg = (w: number, h: number, body: string) => Buffer.from(`<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">${body}</svg>`);

const textLines = (lines: string[], x: number, y: number, step: number, size: number, extra = "") =>
  `<text font-family="${FONT}" font-weight="bold" font-size="${size}" ${extra}>${lines.map((l, i) => `<tspan x="${x}" y="${y + i * step}">${escapeXml(l)}</tspan>`).join("")}</text>`;

interface Chip {
  text: string;
  /** A filled chip (the facts people look for: time, price); the rest are outlined. */
  strong?: boolean;
}

const CHIP_FONT = 34;
const CHIP_PAD = 26;
const CHIP_H = CHIP_FONT + 34;
const CHIP_GAP = 16;

/** Chips flow left to right and wrap onto further rows when the line is full. */
function layoutChips(chips: Chip[], maxWidth: number) {
  const placed: Array<{ chip: Chip; x: number; y: number; w: number }> = [];
  let x = 0;
  let y = 0;
  for (const chip of chips) {
    const w = Math.ceil(chip.text.length * CHIP_FONT * 0.7) + CHIP_PAD * 2;
    if (x > 0 && x + w > maxWidth) {
      x = 0;
      y += CHIP_H + CHIP_GAP;
    }
    placed.push({ chip, x, y, w });
    x += w + CHIP_GAP;
  }
  return { placed, height: placed.length ? y + CHIP_H : 0 };
}

function renderChips(layout: ReturnType<typeof layoutChips>, ox: number, oy: number, strongInk: string): string {
  return layout.placed
    .map(({ chip, x, y, w }) => {
      const cx = ox + x;
      const cy = oy + y;
      const r = CHIP_H / 2;
      const text = `<text x="${cx + CHIP_PAD}" y="${cy + r + CHIP_FONT * 0.35}" font-family="${FONT}" font-weight="bold" font-size="${CHIP_FONT}"`;
      return chip.strong
        ? `<rect x="${cx}" y="${cy}" rx="${r}" ry="${r}" width="${w}" height="${CHIP_H}" fill="#fff"/>${text} fill="${strongInk}">${escapeXml(chip.text)}</text>`
        : `<rect x="${cx + 1.5}" y="${cy + 1.5}" rx="${r}" ry="${r}" width="${w - 3}" height="${CHIP_H - 3}" fill="rgba(255,255,255,0.12)" stroke="rgba(255,255,255,0.8)" stroke-width="3"/>${text} fill="#fff">${escapeXml(chip.text)}</text>`;
    })
    .join("");
}

// ------------------------------------------------------------------ render

export interface ShareImageData {
  title: string;
  startsAt: Date | null;
  city: string;
  venue: string | null;
  price: string | null;
  theme: Theme;
  photo: Buffer | null;
  variant: ShareImageVariant;
  format: ShareImageFormat;
  now?: Date;
}

interface Ctx {
  title: string;
  dayLine: string;
  timeLine: string;
  city: string;
  venue: string | null;
  price: string | null;
  theme: Theme;
  photo: Buffer | null;
  H: number;
  safe: { top: number; bottom: number };
  story: boolean;
}

/** Strong chips use a dark ink; on the brand/category colour the colour itself reads best, on calm and on photos plain near-black. */
const strongInk = (c: Ctx, overPhoto = false) => (overPhoto || c.theme.calm ? "#0b0b12" : c.theme.from);

const chipsOf = (c: Ctx, withTime: boolean): Chip[] => {
  const all: Array<Chip | null> = [
    withTime && c.timeLine ? { text: c.dayLine ? `${c.dayLine}, ${c.timeLine}` : c.timeLine, strong: true } : null,
    c.price ? { text: c.price, strong: true } : null,
    c.city ? { text: c.city } : null,
    c.venue ? { text: c.venue } : null,
  ];
  return all.filter((x): x is Chip => x !== null);
};

/** "Знайди в Кіро →" pill plus the @handle (the referral programme checks for it), above the bottom band Instagram covers. */
function footer(c: Ctx, pillFill: string, pillInk: string, handleInk: string) {
  const bottom = c.H - c.safe.bottom;
  const pillY = bottom - 118;
  return {
    pillY,
    svg:
      `<rect x="${MARGIN}" y="${pillY}" rx="42" ry="42" width="520" height="84" fill="${pillFill}"/>` +
      `<text x="${MARGIN + 40}" y="${pillY + 56}" font-family="${FONT}" font-weight="bold" font-size="40" fill="${pillInk}">Знайди в Кіро →</text>` +
      `<text x="${MARGIN}" y="${bottom}" font-family="${FONT}" font-size="32" fill="${handleInk}">${HANDLE}</text>`,
  };
}

/**
 * Pre-made, ready-to-post images for "share this event": three designs, each as a story (1080x1920) or a post (1080x1350),
 * composed with sharp/SVG so a person never designs anything:
 *   1 "Класика"  — cover photo on top, coloured panel with title, time, price, city and venue below.
 *   2 "Постер"   — full-bleed photo, big title over a dark fade, date badge.
 *   3 "Яскравий" — coloured background, title on top, the photo as a rounded card.
 * The colour follows the category (free events are green; fundraisers get a calm dark card). In a story the important
 * parts keep out of the bands Instagram covers.
 */
export async function renderShareImage(d: ShareImageData): Promise<Buffer> {
  const H = HEIGHTS[d.format];
  const now = d.now ?? new Date();
  const c: Ctx = {
    title: d.title,
    dayLine: d.startsAt ? dayLabel(d.startsAt, now) : "",
    timeLine: d.startsAt ? timeLabel(d.startsAt) : "",
    city: d.city,
    venue: d.venue,
    price: d.price,
    theme: d.theme,
    photo: d.photo,
    H,
    safe: SAFE[d.format],
    story: d.format === "story",
  };
  const layers = d.variant === 2 ? await poster(c) : d.variant === 3 ? await bright(c) : await classic(c);
  return sharp({ create: { width: WIDTH, height: H, channels: 3, background: c.theme.from } }).composite(layers).jpeg({ quality: 90 }).toBuffer();
}

// ---------------------------------------------------------------- 1 · classic
async function classic(c: Ctx): Promise<sharp.OverlayOptions[]> {
  const photoH = c.photo ? Math.round(c.H * 0.5) : 0;
  const layers: sharp.OverlayOptions[] = [];
  if (c.photo) {
    layers.push({ input: await sharp(c.photo).resize(WIDTH, photoH, { fit: "cover" }).toBuffer(), top: 0, left: 0 });
    layers.push({ input: svg(WIDTH, 160, `<defs><linearGradient id="f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.35"/></linearGradient></defs><rect width="${WIDTH}" height="160" fill="url(#f)"/>`), top: photoH - 160, left: 0 });
  }
  const top = c.photo ? photoH + 56 : c.safe.top + 40;
  const titleLines = wrapText(c.title, 21, 3);
  const step = 74;
  const baseline = top + 54;
  const titleBottom = baseline + (titleLines.length - 1) * step + 16;
  const chips = layoutChips(chipsOf(c, true), WIDTH - MARGIN * 2);
  const foot = footer(c, "#fff", strongInk(c), "rgba(255,255,255,0.85)");
  const body =
    `<defs>${gradientDef("bg", c.theme, c.theme.calm ? 0 : 1, 1)}</defs><rect y="${photoH}" width="${WIDTH}" height="${c.H - photoH}" fill="url(#bg)"/>` +
    textLines(titleLines, MARGIN, baseline, step, 62, 'fill="#fff"') +
    renderChips(chips, MARGIN, titleBottom + 30, strongInk(c)) +
    foot.svg;
  layers.push({ input: svg(WIDTH, c.H, body), top: 0, left: 0 });
  return layers;
}

// ---------------------------------------------------------------- 2 · poster
async function poster(c: Ctx): Promise<sharp.OverlayOptions[]> {
  const layers: sharp.OverlayOptions[] = [];
  if (c.photo) layers.push({ input: await sharp(c.photo).resize(WIDTH, c.H, { fit: "cover" }).toBuffer(), top: 0, left: 0 });
  else layers.push({ input: svg(WIDTH, c.H, `<defs>${gradientDef("bg", c.theme, 0.6, 1)}</defs><rect width="${WIDTH}" height="${c.H}" fill="url(#bg)"/>`), top: 0, left: 0 });
  const titleSize = c.story ? 86 : 76;
  const step = Math.round(titleSize * 1.15);
  const titleLines = wrapText(c.title, c.story ? 17 : 20, 4);
  const chips = layoutChips(chipsOf(c, false), WIDTH - MARGIN * 2);
  const foot = footer(c, "#fff", "#0b0b12", "rgba(255,255,255,0.85)");
  const chipsTop = foot.pillY - 34 - chips.height;
  const baseY = chipsTop - 40 - (titleLines.length - 1) * step;
  const badge = [c.dayLine, c.timeLine].filter(Boolean).join(" · ");
  const badgeY = c.safe.top + 10;
  const fadeFrom = Math.round(c.H * 0.3);
  const body =
    `<defs><linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b0b12" stop-opacity="0"/><stop offset="0.45" stop-color="#0b0b12" stop-opacity="${c.theme.calm ? 0.7 : 0.55}"/><stop offset="1" stop-color="#0b0b12" stop-opacity="0.94"/></linearGradient></defs>` +
    `<rect y="${fadeFrom}" width="${WIDTH}" height="${c.H - fadeFrom}" fill="url(#fade)"/>` +
    (badge ? `<rect x="${MARGIN}" y="${badgeY}" rx="40" ry="40" width="${Math.min(900, 60 + badge.length * 27)}" height="80" fill="#ffffff"/><text x="${MARGIN + 32}" y="${badgeY + 56}" font-family="${FONT}" font-weight="bold" font-size="42" fill="#0b0b12">${escapeXml(badge)}</text>` : "") +
    (c.theme.calm ? "" : `<rect x="${MARGIN}" y="${baseY - titleSize + 4}" rx="6" ry="6" width="12" height="${(titleLines.length - 1) * step + titleSize}" fill="${c.theme.to}"/>`) +
    textLines(titleLines, c.theme.calm ? MARGIN : MARGIN + 36, baseY, step, titleSize, 'fill="#fff"') +
    renderChips(chips, MARGIN, chipsTop, strongInk(c, true)) +
    foot.svg;
  layers.push({ input: svg(WIDTH, c.H, body), top: 0, left: 0 });
  return layers;
}

// ---------------------------------------------------------------- 3 · bright
async function bright(c: Ctx): Promise<sharp.OverlayOptions[]> {
  const decoration = c.theme.calm ? "" : `<circle cx="960" cy="140" r="260" fill="#fff" opacity="0.08"/><circle cx="90" cy="${c.H - 120}" r="320" fill="#fff" opacity="0.07"/>`;
  const layers: sharp.OverlayOptions[] = [{ input: svg(WIDTH, c.H, `<defs>${gradientDef("bg", c.theme, 0.5, 1)}</defs><rect width="${WIDTH}" height="${c.H}" fill="url(#bg)"/>${decoration}`), top: 0, left: 0 }];
  const titleLines = wrapText(c.title, c.photo ? 20 : 16, c.photo ? 3 : 5);
  const titleSize = c.photo ? 74 : 92;
  const step = Math.round(titleSize * 1.15);
  const titleTop = c.story ? c.safe.top + 80 : 170;
  const titleBottom = titleTop + (titleLines.length - 1) * step + 24;
  const chips = layoutChips(chipsOf(c, true), WIDTH - MARGIN * 2);
  const foot = footer(c, "#fff", strongInk(c), "rgba(255,255,255,0.9)");
  let chipsTop: number;
  if (c.photo) {
    chipsTop = foot.pillY - 30 - chips.height;
    const cardTop = titleBottom + 30;
    const cardH = Math.max(300, Math.min(chipsTop - 30 - cardTop, 900));
    const w = WIDTH - 140;
    const resized = await sharp(c.photo).resize(w, cardH, { fit: "cover" }).toBuffer();
    const mask = svg(w, cardH, `<rect width="${w}" height="${cardH}" rx="48" ry="48" fill="#fff"/>`);
    layers.push({ input: await sharp(resized).composite([{ input: mask, blend: "dest-in" }]).png().toBuffer(), top: cardTop, left: 70 });
    chipsTop = Math.max(chipsTop, cardTop + cardH + 30);
  } else {
    chipsTop = titleBottom + 50;
  }
  const body =
    textLines(titleLines, 70, titleTop, step, titleSize, 'fill="#fff"') +
    renderChips(chips, MARGIN, chipsTop, strongInk(c)) +
    foot.svg;
  layers.push({ input: svg(WIDTH, c.H, body), top: 0, left: 0 });
  return layers;
}
