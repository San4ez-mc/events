const NAMED: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", laquo: "«", raquo: "»", ndash: "–", mdash: "—", hellip: "…",
  ldquo: "“", rdquo: "”", lsquo: "‘", rsquo: "’", sbquo: "‚", bdquo: "„", bull: "•", middot: "·", copy: "©", reg: "®", trade: "™",
  deg: "°", plusmn: "±", times: "×", euro: "€", hearts: "♥", shy: "",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, body: string) => {
    if (body[0] === "#") {
      const code = body[1]!.toLowerCase() === "x" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : whole;
    }
    return NAMED[body.toLowerCase()] ?? whole;
  });
}

/**
 * For text shown to people (titles, descriptions, venue names): some sources encode twice ("&amp;ldquo;"), so decode until
 * nothing changes (at most 3 passes). Not for URLs: a legitimate "&amp;amp;" in a query string must survive one pass.
 */
export function decodeText(s: string): string {
  let out = s;
  for (let i = 0; i < 3; i++) {
    const next = decodeEntities(out);
    if (next === out) break;
    out = next;
  }
  return out;
}

/** Text of the page body, one non-empty trimmed line per element. Inline images (data: URIs) can be megabytes: dropped first. */
export function visibleLines(html: string): string[] {
  const noData = html.replace(/data:[a-z]+\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+/gi, "");
  const body = noData.slice(Math.max(0, noData.search(/<body/i)));
  const text = body
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, "\n");
  return decodeText(text)
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

export function metaContent(html: string, key: string): string | null {
  const m = new RegExp(`<meta[^>]+(?:name|property)="${key}"[^>]+content="([^"]*)"`, "i").exec(html);
  return m ? decodeText(m[1]!) : null;
}

export function stripTags(s: string): string {
  return decodeText(s.replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|li)>/gi, "\n").replace(/<[^>]+>/g, "")).replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();
}
