/**
 * Server-side localisation of notification text (§40, i18n). Callers keep
 * composing the English title/body; this maps them to Ukrainian for users
 * whose `locale` is "uk". Anything not matched is returned unchanged, so a new
 * English notification degrades to English rather than breaking.
 */
interface Rule {
  title: string;
  ukTitle: string;
  body?: RegExp;
  ukBody?: (m: RegExpMatchArray) => string;
}

const q = (m: RegExpMatchArray, i = 1) => m[i] ?? "";

const RULES: Rule[] = [
  { title: "A category you used was merged", ukTitle: "Категорію, яку ви використали, об'єднано", body: /^"(.*)" was merged into "(.*)"\. Your event "(.*)" now uses the new category\.$/s, ukBody: (m) => `«${q(m)}» об'єднано з «${q(m, 2)}». Ваша подія «${q(m, 3)}» тепер у новій категорії.` },
  { title: "A district you used was merged", ukTitle: "Район, який ви використали, об'єднано", body: /^"(.*)" was merged into "(.*)"\. Your event "(.*)" now uses the new district\.$/s, ukBody: (m) => `«${q(m)}» об'єднано з «${q(m, 2)}». Ваша подія «${q(m, 3)}» тепер у новому районі.` },
  { title: "Event approved", ukTitle: "Подію схвалено", body: /^"(.*)" passed moderation and is now published\.$/s, ukBody: (m) => `«${q(m)}» пройшла модерацію й опублікована.` },
  { title: "Event rejected", ukTitle: "Подію відхилено", body: /^"(.*)" didn't pass moderation and wasn't published\.$/s, ukBody: (m) => `«${q(m)}» не пройшла модерацію й не опублікована.` },
  { title: "Event details changed", ukTitle: "Деталі події змінено", body: /^The organizer updated the date, location, or link for "(.*)"\.$/s, ukBody: (m) => `Організатор оновив дату, місце або посилання для «${q(m)}».` },
  { title: "New friend request", ukTitle: "Новий запит у друзі", body: /^(.*) wants to be friends\.$/s, ukBody: (m) => `${q(m)} хоче дружити.` },
  { title: "Friend request accepted", ukTitle: "Запит у друзі прийнято", body: /^(.*) accepted your friend request\.$/s, ukBody: (m) => `${q(m)} прийняв(-ла) ваш запит у друзі.` },
  { title: "You're invited!", ukTitle: "Вас запрошено!", body: /^You've been invited to "(.*)"\.$/s, ukBody: (m) => `Вас запросили на «${q(m)}».` },
  { title: "Event tomorrow", ukTitle: "Подія вже завтра", body: /^"(.*)" starts in about (\d+) hours?\.$/s, ukBody: (m) => `«${q(m)}» починається приблизно через ${q(m, 2)} год.` },
  { title: "Event starting soon", ukTitle: "Подія невдовзі почнеться", body: /^"(.*)" starts in about (\d+) hours?\.$/s, ukBody: (m) => `«${q(m)}» починається приблизно через ${q(m, 2)} год.` },
  { title: "How was it?", ukTitle: "Як усе минуло?", body: /^Leave a review for "(.*)"\.$/s, ukBody: (m) => `Залиште відгук про «${q(m)}».` },
  { title: "Not enough registrations yet", ukTitle: "Поки замало реєстрацій", body: /^"(.*)" has (\d+)\/(\d+) of the minimum you set\./s, ukBody: (m) => `На «${q(m)}» зареєстровано ${q(m, 2)}/${q(m, 3)} від вашого мінімуму. Ви можете провести подію або скасувати її — автоматично вона не скасується.` },
  { title: "New event", ukTitle: "Нова подія", body: /^An organizer you follow published "(.*)"\.$/s, ukBody: (m) => `Організатор, на якого ви підписані, опублікував «${q(m)}».` },
  { title: "Friend is going", ukTitle: "Друг іде на подію", body: /^(.*) is going to "(.*)"\.$/s, ukBody: (m) => `${q(m)} іде на «${q(m, 2)}».` },
  { title: "New registration", ukTitle: "Нова реєстрація", body: /^Someone just registered for "(.*)"\.$/s, ukBody: (m) => `Хтось щойно зареєструвався на «${q(m)}».` },
  { title: "You're in!", ukTitle: "Ви в списку!", body: /^Your registration for "(.*)" was approved\.$/s, ukBody: (m) => `Вашу реєстрацію на «${q(m)}» підтверджено.` },
  { title: "Registration update", ukTitle: "Оновлення реєстрації", body: /^Your registration for "(.*)" wasn't approved\.$/s, ukBody: (m) => `Вашу реєстрацію на «${q(m)}» не підтверджено.` },
  { title: "Payment sent", ukTitle: "Оплату надіслано", body: /^A participant marked their payment as sent for "(.*)"\.$/s, ukBody: (m) => `Учасник позначив оплату як надіслану для «${q(m)}».` },
  { title: "Payment confirmed", ukTitle: "Оплату підтверджено", body: /^Your payment for "(.*)" was confirmed\. See you there!$/s, ukBody: (m) => `Вашу оплату за «${q(m)}» підтверджено. До зустрічі!` },
  { title: "A spot opened up!", ukTitle: "З'явилося місце!", body: /^A spot opened up for "(.*)" — you're in\.$/s, ukBody: (m) => `З'явилося місце на «${q(m)}» — ви в списку.` },
];

export function localizeNotification(locale: string | null | undefined, title: string, body: string): { title: string; body: string } {
  if (locale !== "uk") return { title, body };
  const rule = RULES.find((r) => r.title === title && (!r.body || r.body.test(body)));
  if (!rule) return { title, body };
  const match = rule.body ? body.match(rule.body) : null;
  return { title: rule.ukTitle, body: match && rule.ukBody ? rule.ukBody(match) : body };
}
