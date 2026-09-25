import { localizeNotification } from "./notification-i18n";

describe("localizeNotification", () => {
  it("leaves English users untouched", () => {
    expect(localizeNotification("en", "New registration", 'Someone just registered for "Yoga".')).toEqual({
      title: "New registration",
      body: 'Someone just registered for "Yoga".',
    });
  });

  it("translates title and body for Ukrainian users, keeping interpolated values", () => {
    expect(localizeNotification("uk", "You're in!", 'Your registration for "Йога" was approved.')).toEqual({
      title: "Ви в списку!",
      body: "Вашу реєстрацію на «Йога» підтверджено.",
    });
    expect(localizeNotification("uk", "Event tomorrow", '"Йога" starts in about 24 hours.').body).toBe("«Йога» починається приблизно через 24 год.");
    expect(localizeNotification("uk", "Friend is going", 'Оля is going to "Йога".').body).toBe("Оля іде на «Йога».");
  });

  it("falls back to the original text for anything unknown", () => {
    expect(localizeNotification("uk", "Brand new thing", "Some body")).toEqual({ title: "Brand new thing", body: "Some body" });
  });
});
