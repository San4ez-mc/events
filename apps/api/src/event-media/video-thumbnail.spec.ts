import { extractVideoThumbnail } from "./video-thumbnail";

describe("extractVideoThumbnail", () => {
  const original = process.env.FFMPEG_PATH;
  afterEach(() => {
    if (original === undefined) delete process.env.FFMPEG_PATH;
    else process.env.FFMPEG_PATH = original;
  });

  it("returns null (never throws) when ffmpeg is unavailable", async () => {
    process.env.FFMPEG_PATH = "definitely-not-an-installed-binary";
    await expect(extractVideoThumbnail(Buffer.from("not a video"), "mp4")).resolves.toBeNull();
  });

  it("returns null when ffmpeg cannot decode the input", async () => {
    // `node` exits non-zero when handed ffmpeg-style args, which stands in for a decode failure.
    process.env.FFMPEG_PATH = process.execPath;
    await expect(extractVideoThumbnail(Buffer.from("garbage"), "mp4")).resolves.toBeNull();
  });
});
