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
  { title: "Event cancelled", ukTitle: "Подію скасовано", body: /^"(.*)" was cancelled because the organizer left Kiro\.$/s, ukBody: (m) => `«${q(m)}» скасовано, бо організатор залишив Кіро.` },
  // The organizer's own cancel (EventsService.applyCancel) uses the same "Event cancelled" title
  // with two other body shapes depending on whether they gave a reason — both need their own rule,
  // or a uk-locale user got the (translated) title with an English body.
  { title: "Event cancelled", ukTitle: "Подію скасовано", body: /^"(.*)" was cancelled: (.*)$/s, ukBody: (m) => `«${q(m)}» скасовано: ${q(m, 2)}` },
  { title: "Event cancelled", ukTitle: "Подію скасовано", body: /^"(.*)" was cancelled\.$/s, ukBody: (m) => `«${q(m)}» скасовано.` },
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
  { title: "A participant cancelled", ukTitle: "Учасник скасував реєстрацію", body: /^(.*) cancelled their registration for "(.*)"\.$/s, ukBody: (m) => `${q(m)} скасував(-ла) реєстрацію на «${q(m, 2)}».` },
  // --- Admin decisions about the user's own submissions/account ---
  { title: "Category approved", ukTitle: "Категорію схвалено", body: /^Your suggested category "(.*)" was approved and is now available\.$/s, ukBody: (m) => `Вашу категорію «${q(m)}» схвалено — вона вже доступна.` },
  { title: "Category not approved", ukTitle: "Категорію не схвалено", body: /^Your suggested category "(.*)" wasn't approved\.$/s, ukBody: (m) => `Вашу категорію «${q(m)}» не схвалено.` },
  { title: "District approved", ukTitle: "Район схвалено", body: /^Your suggested district "(.*)" was approved and is now available\.$/s, ukBody: (m) => `Ваш район «${q(m)}» схвалено — він вже доступний.` },
  { title: "District not approved", ukTitle: "Район не схвалено", body: /^Your suggested district "(.*)" wasn't approved\.$/s, ukBody: (m) => `Ваш район «${q(m)}» не схвалено.` },
  { title: "Account update", ukTitle: "Оновлення акаунта", body: /^Your account was suspended by a moderator\. Contact support: (.*)\.$/s, ukBody: (m) => `Ваш акаунт призупинено модератором. Зверніться в підтримку: ${q(m)}.` },
  { title: "Account update", ukTitle: "Оновлення акаунта", body: /^Your account was blocked\. Contact support: (.*)\.$/s, ukBody: (m) => `Ваш акаунт заблоковано. Зверніться в підтримку: ${q(m)}.` },
  { title: "Message from moderation", ukTitle: "Повідомлення від модерації" },
  { title: "Account update", ukTitle: "Оновлення акаунта", body: /^Your account is active again\.$/s, ukBody: () => "Ваш акаунт знову активний." },
  { title: "Credits updated", ukTitle: "Кредити оновлено", body: /^You received (\d+) listing credits? from the Kiro team\.$/s, ukBody: (m) => `Вам нараховано кредитів на публікацію: ${q(m)}.` },
  { title: "Credits updated", ukTitle: "Кредити оновлено", body: /^(\d+) listing credits? (?:was|were) deducted from your balance\.$/s, ukBody: (m) => `З вашого балансу списано кредитів: ${q(m)}.` },
  { title: "Referral approved", ukTitle: "Заявку схвалено", body: /^Your share was approved — (\d+) credits added\.$/s, ukBody: (m) => `Ваш репост схвалено — нараховано кредитів: ${q(m)}.` },
  { title: "Referral not approved", ukTitle: "Заявку не схвалено", body: /^Your share wasn't approved\.$/s, ukBody: () => "Ваш репост не схвалено." },
  { title: "Review hidden", ukTitle: "Відгук приховано", body: /^Your review of "(.*)" was hidden by a moderator\.$/s, ukBody: (m) => `Ваш відгук про «${q(m)}» приховано модератором.` },
  { title: "Report reviewed", ukTitle: "Скаргу розглянуто", body: /^Thanks — we reviewed your report and took action\.$/s, ukBody: () => "Дякуємо — ми розглянули вашу скаргу й вжили заходів." },
  { title: "Report reviewed", ukTitle: "Скаргу розглянуто", body: /^We reviewed your report and found no violation\.$/s, ukBody: () => "Ми розглянули вашу скаргу й не знайшли порушення." },
  // A moderator's own answer to a reporter (free text) — keep the text, localize the title.
  { title: "Report reviewed", ukTitle: "Скаргу розглянуто" },
  // --- Heads-ups for staff ---
  { title: "New report", ukTitle: "Нова скарга", body: /^Report on "(.*)": (.*)$/s, ukBody: (m) => `Скарга на «${q(m)}»: ${q(m, 2)}` },
  { title: "New category to approve", ukTitle: "Нова категорія на схвалення", body: /^"(.*)" is waiting for approval\.$/s, ukBody: (m) => `«${q(m)}» чекає на схвалення.` },
  { title: "New district to approve", ukTitle: "Новий район на схвалення", body: /^"(.*)" is waiting for approval\.$/s, ukBody: (m) => `«${q(m)}» чекає на схвалення.` },
  { title: "Event needs moderation", ukTitle: "Подія на модерації", body: /^"(.*)" was held for review\.$/s, ukBody: (m) => `«${q(m)}» затримано на перевірку.` },
  { title: "New referral claim", ukTitle: "Нова реферальна заявка", body: /^(.*) submitted a referral claim\.$/s, ukBody: (m) => `${q(m)} подав(-ла) реферальну заявку.` },
  // Body is the organizer's own free-text message — left untranslated, title only.
  { title: "Message from the organizer", ukTitle: "Повідомлення від організатора" },
];

export function localizeNotification(locale: string | null | undefined, title: string, body: string): { title: string; body: string } {
  if (locale !== "uk") return { title, body };
  const rule = RULES.find((r) => r.title === title && (!r.body || r.body.test(body)));
  if (!rule) return { title, body };
  const match = rule.body ? body.match(rule.body) : null;
  return { title: rule.ukTitle, body: match && rule.ukBody ? rule.ukBody(match) : body };
}
