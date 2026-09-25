import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Runs ffmpeg with a hard timeout; resolves true on exit code 0. */
function run(bin: string, args: string[], timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(bin, args, { stdio: "ignore" });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve(false);
    }, timeoutMs);
    child.on("error", () => {
      clearTimeout(timer);
      resolve(false); // ffmpeg not installed
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve(code === 0);
    });
  });
}

/**
 * §22 — poster frame for an uploaded video: a 640px-wide JPEG taken ~1s in (or the first frame for very short
 * clips). Best-effort: returns null when ffmpeg is missing or the file can't be decoded, so uploads never fail
 * because of it. Point FFMPEG_PATH at a specific binary if it isn't on PATH.
 */
export async function extractVideoThumbnail(video: Buffer, ext: string): Promise<Buffer | null> {
  const bin = process.env.FFMPEG_PATH || "ffmpeg";
  const dir = await mkdtemp(join(tmpdir(), "kiro-vid-"));
  const input = join(dir, `in.${ext}`);
  const output = join(dir, "thumb.jpg");
  try {
    await writeFile(input, video);
    for (const seek of ["1", "0"]) {
      const ok = await run(bin, ["-y", "-ss", seek, "-i", input, "-frames:v", "1", "-vf", "scale=640:-2", "-q:v", "4", output], 20_000);
      if (ok) {
        try {
          return await readFile(output);
        } catch {
          // no frame was produced at this offset; try the next
        }
      }
    }
    return null;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
