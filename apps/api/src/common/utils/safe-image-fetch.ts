import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { ApiException } from "../exceptions/api.exception";

/** Loopback, private, link-local, CGNAT, multicast and other non-public addresses (IPv4 and IPv6). */
export function isPrivateAddress(ip: string): boolean {
  const v = ip.toLowerCase();
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v);
  if (mapped) return isPrivateAddress(mapped[1]!);
  if (isIP(v) === 4) {
    const [a, b] = v.split(".").map(Number) as [number, number];
    return (
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127)
    );
  }
  if (isIP(v) === 6) return v === "::" || v === "::1" || v.startsWith("fc") || v.startsWith("fd") || /^fe[89ab]/.test(v) || v.startsWith("ff");
  return true;
}

const bad = (message: string) => new ApiException("VALIDATION_ERROR", message, 400, { imageUrl: [message] });

/**
 * Downloads a picture another service handed us a link to (a chat bot passes a Telegram file URL). Because the URL comes
 * from outside, it is fetched defensively: https only, no private/internal addresses, no redirects, a time and a size limit,
 * and it must really answer as an image.
 */
export async function fetchImageSafely(rawUrl: string, maxBytes: number): Promise<{ buffer: Buffer; mimetype: string }> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw bad("Invalid image URL");
  }
  if (url.protocol !== "https:") throw bad("Image URL must be https");

  const addresses = isIP(url.hostname) ? [{ address: url.hostname }] : await lookup(url.hostname, { all: true }).catch(() => []);
  if (addresses.length === 0 || addresses.some((a) => isPrivateAddress(a.address))) throw bad("Image host is not allowed");

  let res: Response;
  try {
    res = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(10_000) });
  } catch {
    throw bad("Could not download the image");
  }
  if (!res.ok) throw bad("Could not download the image");
  const mimetype = (res.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
  if (!mimetype.startsWith("image/")) throw bad("The link is not an image");
  if (Number(res.headers.get("content-length") ?? 0) > maxBytes) throw bad("The image is too large");

  const chunks: Buffer[] = [];
  let total = 0;
  const reader = res.body?.getReader();
  if (!reader) throw bad("Could not download the image");
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw bad("The image is too large");
    }
    chunks.push(Buffer.from(value));
  }
  return { buffer: Buffer.concat(chunks), mimetype };
}
