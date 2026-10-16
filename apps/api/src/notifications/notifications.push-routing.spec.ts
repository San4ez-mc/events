import { NotificationsService } from "./notifications.service";

describe("NotificationsService push routing", () => {
  const prisma = {
    user: { findUnique: jest.fn() },
    event: { findUnique: jest.fn() },
    notification: { create: jest.fn() },
    notificationDelivery: { create: jest.fn() },
    userPreferences: { findUnique: jest.fn() },
    userDevice: { findMany: jest.fn(), update: jest.fn() },
  };
  const expo = { send: jest.fn() };
  const web = { publicKey: "pub" as string | null, send: jest.fn() };
  const service = new NotificationsService(prisma as never, expo as never, web as never);

  beforeEach(() => {
    jest.resetAllMocks();
    web.publicKey = "pub";
    prisma.user.findUnique.mockResolvedValue({ locale: "uk" });
    prisma.event.findUnique.mockResolvedValue({ slug: "my-event" });
    prisma.notification.create.mockResolvedValue({ id: "n1" });
    prisma.notificationDelivery.create.mockResolvedValue({});
    prisma.userPreferences.findUnique.mockResolvedValue(null);
    expo.send.mockResolvedValue([]);
  });

  const create = () => service.create({ userId: "u1", type: "SHARE_PROMPT", title: "Share your event", body: "x", payloadJson: { eventId: "e1", screen: "share" } });

  it("sends app tokens through Expo and browser subscriptions through Web Push, each only to its own channel", async () => {
    prisma.userDevice.findMany.mockResolvedValue([
      { id: "d1", platform: "ANDROID", pushToken: "ExponentPushToken[abc]" },
      { id: "d2", platform: "WEB", pushToken: '{"endpoint":"https://push.example/1"}' },
    ]);
    expo.send.mockResolvedValue([{ to: "ExponentPushToken[abc]", ok: true, deviceNotRegistered: false }]);
    web.send.mockResolvedValue({ ok: true, gone: false });

    await create();

    expect(expo.send).toHaveBeenCalledTimes(1);
    expect(expo.send.mock.calls[0]![0]).toHaveLength(1);
    expect(expo.send.mock.calls[0]![0][0].to).toBe("ExponentPushToken[abc]");
    expect(web.send).toHaveBeenCalledTimes(1);
    expect(web.send).toHaveBeenCalledWith('{"endpoint":"https://push.example/1"}', expect.objectContaining({ url: "/events/my-event/share" }));
    // one IN_APP row + one PUSH row per device
    expect(prisma.notificationDelivery.create).toHaveBeenCalledTimes(3);
  });

  it("deactivates a browser subscription the push service reports as gone", async () => {
    prisma.userDevice.findMany.mockResolvedValue([{ id: "d2", platform: "WEB", pushToken: "{}" }]);
    web.send.mockResolvedValue({ ok: false, gone: true, error: "410" });

    await create();

    expect(prisma.userDevice.update).toHaveBeenCalledWith({ where: { id: "d2" }, data: { active: false } });
  });

  it("does not try browsers when web push is not configured", async () => {
    web.publicKey = null;
    prisma.userDevice.findMany.mockResolvedValue([{ id: "d2", platform: "WEB", pushToken: "{}" }]);

    await create();

    expect(web.send).not.toHaveBeenCalled();
    expect(expo.send).toHaveBeenCalledWith([]);
  });

  it("sends nothing when the user turned push off", async () => {
    prisma.userPreferences.findUnique.mockResolvedValue({ allowPush: false });
    await create();
    expect(prisma.userDevice.findMany).not.toHaveBeenCalled();
    expect(web.send).not.toHaveBeenCalled();
  });
});
