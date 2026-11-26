/**
 * Turns what people paste into a "link to your post" field into clickable pieces: a plain address, an address without
 * "https://", a Facebook embed code (<iframe ...>) or an "@name" handle. Only http(s) addresses are ever produced.
 * The app has the same rules in apps/mobile/src/lib/linkify.ts; change both together.
 */
export interface LinkPart {
  text: string;
  url?: string;
}

const ADDRESS = /(https?:\/\/[^\s<>"']+|(?:www\.)?(?:instagram\.com|threads\.net|threads\.com|facebook\.com|fb\.watch|t\.me|tiktok\.com|youtube\.com|youtu\.be|kiro\.fineko\.space)\/[^\s<>"']*)|(?<![\w./])@([A-Za-z0-9_](?:[A-Za-z0-9_.]{0,28}[A-Za-z0-9_])?)/gi;

function profileUrl(handle: string, wholeText: string): string {
  if (/threads|тредс/i.test(wholeText)) return `https://www.threads.com/@${handle}`;
  if (/tiktok|тікток|тикток/i.test(wholeText)) return `https://www.tiktok.com/@${handle}`;
  if (/telegram|телеграм/i.test(wholeText)) return `https://t.me/${handle}`;
  return `https://www.instagram.com/${handle}`;
}

/** The post behind a Facebook embed code: the `href` parameter of the iframe's address. */
function embeddedPost(note: string): string | null {
  if (!/<iframe/i.test(note)) return null;
  const href = /[?&]href=([^&"'\s]+)/i.exec(note)?.[1];
  const source = /src=["']([^"'\s]+)/i.exec(note)?.[1];
  try {
    const url = href ? decodeURIComponent(href) : source;
    return url && /^https?:\/\//i.test(url) ? url : null;
  } catch {
    return null;
  }
}

export function linkParts(note: string): LinkPart[] {
  const post = embeddedPost(note);
  if (post) return [{ text: post, url: post }];

  const parts: LinkPart[] = [];
  let from = 0;
  for (const match of note.matchAll(ADDRESS)) {
    const [found, address, handle] = match;
    // A trailing dot, comma or bracket belongs to the sentence, not to the address.
    const text = address ? address.replace(/[.,;:!?)\]]+$/, "") : found;
    if (match.index > from) parts.push({ text: note.slice(from, match.index) });
    const url = handle ? profileUrl(handle, note) : /^https?:\/\//i.test(text) ? text : `https://${text}`;
    parts.push({ text, url });
    from = match.index + text.length;
  }
  if (from < note.length) parts.push({ text: note.slice(from) });
  return parts;
}
