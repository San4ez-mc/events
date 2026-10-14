import sharp from "sharp";
import { ApiException } from "../common/exceptions/api.exception";
import { FeedbackService } from "./feedback.service";

describe("FeedbackService.submitReport", () => {
  const create = jest.fn();
  const putObject = jest.fn();
  const notifyStaff = jest.fn();
  const findUser = jest.fn();

  const service = new FeedbackService(
    { get: jest.fn() } as never,
    { user: { findUnique: findUser }, feedbackReport: { create } } as never,
    { send: jest.fn() } as never,
    { report: jest.fn() } as never,
    { buildKey: (folder: string, name: string) => `${folder}/abc-${name}`, putObject } as never,
    { notifyStaff } as never,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    create.mockResolvedValue({});
    notifyStaff.mockResolvedValue(undefined);
    putObject.mockImplementation(async (key: string) => ({ key, url: `https://cdn.test/${key}` }));
  });

  it("stores a text-only report and pings the admins", async () => {
    findUser.mockResolvedValue({ id: "u1", name: "Олена", nickname: null });

    await service.submitReport({ text: "  Не відкривається подія  ", context: "event:abc", platform: "android", appVersion: "1.0.0", buildNumber: 23 }, undefined, "u1");

    expect(putObject).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: "u1", message: "Не відкривається подія", screenshotUrl: null, context: "event:abc", platform: "android", buildNumber: 23 }),
    });
    expect(notifyStaff).toHaveBeenCalledWith(expect.objectContaining({ roles: ["ADMIN", "SUPER_ADMIN"], adminTab: "feedback", excludeUserId: "u1", body: "Олена: Не відкривається подія" }));
  });

  it("re-encodes a screenshot to a bounded JPEG, uploads it and saves the url", async () => {
    findUser.mockResolvedValue(null);
    const png = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: "#336699" } }).png().toBuffer();

    await service.submitReport({ text: "Баг на екрані" }, { buffer: png, mimetype: "image/png" } as Express.Multer.File, undefined);

    expect(putObject).toHaveBeenCalledTimes(1);
    const [key, body, contentType] = putObject.mock.calls[0] as [string, Buffer, string];
    expect(key.startsWith("feedback/")).toBe(true);
    expect(contentType).toBe("image/jpeg");
    const meta = await sharp(body).metadata();
    expect(meta.format).toBe("jpeg");
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBeLessThanOrEqual(1600);
    expect(create).toHaveBeenCalledWith({ data: expect.objectContaining({ userId: null, screenshotUrl: `https://cdn.test/${key}` }) });
    expect(notifyStaff).toHaveBeenCalledWith(expect.objectContaining({ body: "Anonymous: Баг на екрані" }));
  });

  it("rejects a non-image attachment without storing anything", async () => {
    await expect(service.submitReport({ text: "Файл" }, { buffer: Buffer.from("x"), mimetype: "application/pdf" } as Express.Multer.File, undefined)).rejects.toBeInstanceOf(ApiException);
    expect(create).not.toHaveBeenCalled();
    expect(putObject).not.toHaveBeenCalled();
  });

  it("rejects an unreadable image", async () => {
    await expect(service.submitReport({ text: "Файл" }, { buffer: Buffer.from("not an image"), mimetype: "image/jpeg" } as Express.Multer.File, undefined)).rejects.toBeInstanceOf(ApiException);
    expect(create).not.toHaveBeenCalled();
  });

  it("does not fail the report when the admin notification fails", async () => {
    findUser.mockResolvedValue(null);
    notifyStaff.mockRejectedValue(new Error("push down"));
    await expect(service.submitReport({ text: "Привіт" }, undefined, undefined)).resolves.toBeUndefined();
    expect(create).toHaveBeenCalled();
  });
});
