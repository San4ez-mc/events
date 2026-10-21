// The real hash is deliberately slow; this suite is about the funnel logic, not password hashing.
jest.mock("argon2", () => ({ hash: jest.fn().mockResolvedValue("hashed"), argon2id: 2 }));

import { ApiException } from "../common/exceptions/api.exception";
import { BotIntegrationService } from "./bot-integration.service";
import type { BotEventDraftDto } from "./dto/bot-event-draft.dto";

describe("BotIntegrationService", () => {
  const prisma = {
    event: { findUnique: jest.fn(), findUniqueOrThrow: jest.fn(), update: jest.fn(), count: jest.fn() },
    user: { findUnique: jest.fn(), create: jest.fn() },
    category: { findFirst: jest.fn() },
    city: { findFirst: jest.fn() },
  };
  const auth = { issueSetPasswordUrl: jest.fn() };
  const events = { create: jest.fn(), update: jest.fn() };
  const media = { upload: jest.fn() };
  const mail = { sendBotDraftWelcomeEmail: jest.fn(), sendBotDraftAddedEmail: jest.fn() };
  const config = { get: jest.fn(() => "https://kiro.test") };
  const service = new BotIntegrationService(prisma as never, auth as never, events as never, media as never, mail as never, config as never);

  const dto = (extra: Partial<BotEventDraftDto> = {}) => ({ email: "olena@example.com", title: "Лекція", ...extra }) as BotEventDraftDto;
  const savedEvent = (extra: Record<string, unknown> = {}) => ({ id: "e1", slug: "lekciia-abc", title: "Лекція", status: "DRAFT", categoryId: null, startsAt: null, description: null, format: "OFFLINE", cityId: null, onlineUrl: null, ...extra });

  beforeEach(() => {
    jest.resetAllMocks();
    config.get.mockReturnValue("https://kiro.test");
    prisma.event.findUnique.mockResolvedValue(null);
    prisma.event.count.mockResolvedValue(0);
    prisma.event.update.mockResolvedValue({});
    prisma.event.findUniqueOrThrow.mockResolvedValue(savedEvent());
    prisma.category.findFirst.mockResolvedValue(null);
    prisma.city.findFirst.mockResolvedValue(null);
    events.create.mockResolvedValue({ id: "e1" });
    events.update.mockResolvedValue({});
    auth.issueSetPasswordUrl.mockResolvedValue("https://kiro.test/auth/reset-password?token=t&next=%2Forganizer%2Fevents%2Fe1%2Fedit");
    mail.sendBotDraftWelcomeEmail.mockResolvedValue(undefined);
    mail.sendBotDraftAddedEmail.mockResolvedValue(undefined);
  });

  describe("a new organizer", () => {
    beforeEach(() => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({ id: "u1", email: "olena@example.com" });
    });

    it("creates the account and draft without handing out welcome credits, tags the source, and mails a set-password link to the draft", async () => {
      const res = await service.createDraft(dto({ externalRef: "chat-1" }));

      expect(events.create).toHaveBeenCalledWith("u1", { title: "Лекція" }, { skipWelcomeCredits: true });
      expect(prisma.event.update).toHaveBeenCalledWith({ where: { id: "e1" }, data: { source: "telegram_bot", sourceRef: "chat-1" } });
      expect(auth.issueSetPasswordUrl).toHaveBeenCalledWith("u1", "/organizer/events/e1/edit");
      expect(mail.sendBotDraftWelcomeEmail).toHaveBeenCalledWith("olena@example.com", expect.objectContaining({ title: "Лекція", setPasswordUrl: expect.stringContaining("reset-password") }));
      expect(res).toMatchObject({ eventId: "e1", accountCreated: true, created: true, alreadyPublished: false, editUrl: "https://kiro.test/organizer/events/e1/edit" });
      expect(res.missingForPublish).toEqual(["category", "startsAt", "description", "city"]);
    });

    it("reads a time without a zone as Kyiv time (the server runs in UTC)", async () => {
      await service.createDraft(dto({ startsAt: "2026-10-20T19:00", endsAt: "2026-10-20T21:30:00+03:00" }));
      expect(events.update).toHaveBeenCalledWith("e1", "u1", expect.objectContaining({ startsAt: "2026-10-20T16:00:00.000Z", endsAt: "2026-10-20T21:30:00+03:00" }));
    });

    it("keeps the draft and names the fields when a value is rejected", async () => {
      events.update.mockRejectedValue(new ApiException("VALIDATION_ERROR", "endsAt must be after startsAt", 400, { endsAt: ["Must be after startsAt"] }));
      const res = await service.createDraft(dto({ startsAt: "2026-10-20T19:00", endsAt: "2026-10-20T18:00" }));
      expect(res.rejected).toBe("endsAt must be after startsAt");
      expect(res.rejectedFields).toEqual(["endsAt"]);
      expect(res.eventId).toBe("e1");
    });

    it("stops a runaway: too many new organizers in a day", async () => {
      prisma.event.count.mockResolvedValueOnce(0).mockResolvedValueOnce(100);
      await expect(service.createDraft(dto())).rejects.toMatchObject({ code: "RATE_LIMITED" });
      expect(events.create).not.toHaveBeenCalled();
    });
  });

  describe("an existing organizer", () => {
    beforeEach(() => prisma.user.findUnique.mockResolvedValue({ id: "u9", status: "ACTIVE", email: "olena@example.com" }));

    it("adds the draft with the normal welcome-credit rules and tells the owner by email", async () => {
      const res = await service.createDraft(dto());
      expect(events.create).toHaveBeenCalledWith("u9", { title: "Лекція" }, { skipWelcomeCredits: false });
      expect(auth.issueSetPasswordUrl).not.toHaveBeenCalled();
      expect(mail.sendBotDraftAddedEmail).toHaveBeenCalledWith("olena@example.com", { title: "Лекція", editUrl: "https://kiro.test/organizer/events/e1/edit" });
      expect(res.accountCreated).toBe(false);
    });

    it("refuses an account that is not active", async () => {
      prisma.user.findUnique.mockResolvedValue({ id: "u9", status: "BLOCKED" });
      await expect(service.createDraft(dto())).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("limits drafts per address per day", async () => {
      prisma.event.count.mockResolvedValue(5);
      await expect(service.createDraft(dto())).rejects.toMatchObject({ code: "RATE_LIMITED" });
    });
  });

  describe("a repeated submission (same externalRef)", () => {
    it("updates the same draft: no second event, no second email", async () => {
      prisma.event.findUnique.mockResolvedValue({ id: "e1", ownerId: "u1", status: "DRAFT", owner: { email: "olena@example.com" } });
      const res = await service.createDraft(dto({ externalRef: "chat-1", title: "Нова назва", description: "Опис" }));
      expect(events.create).not.toHaveBeenCalled();
      expect(events.update).toHaveBeenCalledWith("e1", "u1", expect.objectContaining({ title: "Нова назва", description: "Опис" }));
      expect(mail.sendBotDraftWelcomeEmail).not.toHaveBeenCalled();
      expect(mail.sendBotDraftAddedEmail).not.toHaveBeenCalled();
      expect(res).toMatchObject({ eventId: "e1", created: false, accountCreated: false });
    });

    it("does not touch a draft that was already published", async () => {
      prisma.event.findUnique.mockResolvedValue({ id: "e1", ownerId: "u1", status: "PUBLISHED", owner: { email: "olena@example.com" } });
      const res = await service.createDraft(dto({ externalRef: "chat-1", description: "Опис" }));
      expect(events.update).not.toHaveBeenCalled();
      expect(res.alreadyPublished).toBe(true);
    });

    it("refuses a reference that belongs to another organizer", async () => {
      prisma.event.findUnique.mockResolvedValue({ id: "e1", ownerId: "u1", status: "DRAFT", owner: { email: "other@example.com" } });
      await expect(service.createDraft(dto({ externalRef: "chat-1" }))).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
  });

  describe("cover photo", () => {
    const file = { buffer: Buffer.from("x"), mimetype: "image/jpeg", size: 1, originalname: "a.jpg", fieldname: "file" } as Express.Multer.File;

    it("uploads a file onto a bot draft", async () => {
      prisma.event.findUnique.mockResolvedValue({ id: "e1", ownerId: "u1", status: "DRAFT", source: "telegram_bot" });
      media.upload.mockResolvedValue({ id: "m1" });
      await service.attachPhoto("e1", undefined, file);
      expect(media.upload).toHaveBeenCalledWith("e1", "u1", file);
    });

    it("only works on events this funnel created", async () => {
      prisma.event.findUnique.mockResolvedValue({ id: "e1", ownerId: "u1", status: "DRAFT", source: null });
      await expect(service.attachPhoto("e1", undefined, file)).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("not after publishing", async () => {
      prisma.event.findUnique.mockResolvedValue({ id: "e1", ownerId: "u1", status: "PUBLISHED", source: "telegram_bot" });
      await expect(service.attachPhoto("e1", undefined, file)).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("needs a file or a link, and refuses a link to an internal address", async () => {
      prisma.event.findUnique.mockResolvedValue({ id: "e1", ownerId: "u1", status: "DRAFT", source: "telegram_bot" });
      await expect(service.attachPhoto("e1", undefined, undefined)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
      await expect(service.attachPhoto("e1", "https://127.0.0.1/secret.jpg", undefined)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
      await expect(service.attachPhoto("e1", "http://example.com/a.jpg", undefined)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
      expect(media.upload).not.toHaveBeenCalled();
    });
  });
});
