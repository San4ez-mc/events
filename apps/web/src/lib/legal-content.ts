/**
 * Public legal pages (privacy policy, terms, account deletion). Required by Google Play (privacy policy URL and a
 * web page describing account deletion). The text describes what the product actually does today — if a feature that
 * touches personal data is added, update it here.
 */
import type { SupportedLocale } from "@kiro/i18n";

export interface LegalSection {
  heading: string;
  paragraphs?: string[];
  items?: string[];
}
export interface LegalDoc {
  title: string;
  updated: string;
  intro: string;
  sections: LegalSection[];
}

export const CONTACT_EMAIL = "kiro@fineko.space";
export const LEGAL_UPDATED = "2026-09-27";

const privacyUk: LegalDoc = {
  title: "Політика конфіденційності",
  updated: "Останнє оновлення: 27 вересня 2026",
  intro:
    "Кіро (kiro.fineko.space та мобільний додаток) допомагає знаходити події поруч і записуватися на них. Ця політика пояснює, які дані ми збираємо, навіщо, кому їх передаємо і як ви можете ними керувати.",
  sections: [
    {
      heading: "1. Які дані ми збираємо",
      items: [
        "Обліковий запис: email, пароль (зберігається лише у вигляді захищеного хеша), ім'я та нікнейм (за бажанням).",
        "Вхід через Google: ваш email та ім'я з облікового запису Google (пароль Google ми не бачимо).",
        "Профіль (за бажанням): фото, короткий опис, посилання на соцмережі, телефон і дата народження. Телефон і дата народження не показуються іншим користувачам; дата народження потрібна лише щоб не показувати події 18+ неповнолітнім.",
        "Ваша активність: реєстрації на події та ваші відповіді на питання організатора, збережені події, відгуки, повідомлення в чаті події, запити в друзі, підписки на організаторів, пропущені події у стрічці.",
        "Події, які ви створюєте: опис, дата, адреса, фото та відео, ціна, кількість місць.",
        "Технічні дані: push-токен пристрою для сповіщень, дані про перегляди й поширення подій (з випадковим ідентифікатором сесії), IP-адреса та тип пристрою в журналах сервера.",
      ],
    },
    {
      heading: "2. Чого ми не збираємо",
      paragraphs: [
        "Ми не збираємо GPS-геолокацію вашого пристрою, контакти телефонної книги, дані банківських карток і не показуємо рекламу. Оплату (наприклад, пакетів кредитів для організаторів) обробляють платіжні провайдери; ми не отримуємо і не зберігаємо номери карток.",
      ],
    },
    {
      heading: "3. Навіщо ми використовуємо дані",
      items: [
        "щоб створити акаунт, автентифікувати вас і надавати сервіс (реєстрації, чат, сповіщення, друзі);",
        "щоб показувати релевантну стрічку подій (за містом, категоріями, датою тощо);",
        "щоб організатор бачив, хто зареєструвався, та міг зв'язатися з учасниками;",
        "щоб надсилати сповіщення (push, у застосунку, за потреби email) — ви можете вимкнути їх у налаштуваннях профілю;",
        "щоб запобігати шахрайству та зловживанням, модерувати вміст і розглядати скарги;",
        "щоб рахувати переглянутість подій та покращувати продукт (у вигляді агрегованої статистики).",
      ],
    },
    {
      heading: "4. Хто бачить ваші дані",
      items: [
        "Інші користувачі: ваше ім'я/нікнейм, фото та опис профілю, ваші відгуки й повідомлення в чаті подій. Ваше ім'я в списку учасників події показується лише якщо ви це дозволили під час реєстрації.",
        "Організатор події, на яку ви записалися: ваше ім'я, контакти, вказані в профілі, та відповіді на його питання.",
        "Постачальники, що допомагають працювати сервісу: Google (вхід через Google і підказки адрес Google Places, запити до яких проходять через наш сервер), Expo (доставка push-сповіщень), постачальник хостингу й поштового сервісу, платіжні провайдери (WayForPay, Mono) під час оплати.",
        "Ми не продаємо ваші дані й не передаємо їх рекламним мережам.",
      ],
    },
    {
      heading: "5. Cookie та локальне сховище",
      paragraphs: [
        "На сайті ми використовуємо технічний cookie для підтримання сесії входу (термін залежить від того, чи ви обрали «Запам'ятати мене») та локальне сховище браузера для мови, теми та збережених фільтрів. Рекламних і відстежувальних cookie сторонніх сервісів ми не використовуємо.",
      ],
    },
    {
      heading: "6. Скільки ми зберігаємо дані",
      paragraphs: [
        "Дані акаунта зберігаються, доки ви не видалите акаунт. Після видалення персональні дані стираються або знеособлюються негайно; резервні копії бази даних автоматично видаляються протягом 14 днів. Журнали сервера зберігаються обмежений час для безпеки.",
      ],
    },
    {
      heading: "7. Ваші права",
      items: [
        "переглянути й виправити дані у профілі;",
        "вимкнути сповіщення та приховати частину профілю в налаштуваннях;",
        "видалити акаунт і пов'язані з ним персональні дані: у додатку «Профіль → Видалити акаунт» або на сайті в розділі профілю; докладно на сторінці «Видалення акаунта»;",
        "звернутися до нас із будь-яким запитом щодо ваших даних за адресою нижче.",
      ],
    },
    {
      heading: "8. Діти",
      paragraphs: [
        "Сервіс призначений для користувачів від 16 років. Ми свідомо не збираємо дані дітей молодших за цей вік; якщо ви вважаєте, що дитина створила акаунт, напишіть нам, і ми його видалимо.",
      ],
    },
    {
      heading: "9. Безпека",
      paragraphs: [
        "Дані передаються через HTTPS, паролі зберігаються у вигляді захищених хешів, доступ до бази даних обмежений. Жодна система не безпечна на 100%, тому ми рекомендуємо унікальний пароль.",
      ],
    },
    {
      heading: "10. Зміни та контакти",
      paragraphs: [
        `Ми можемо оновлювати цю політику; актуальна версія завжди на цій сторінці, дата оновлення вказана вгорі. З питань щодо даних пишіть: ${CONTACT_EMAIL}.`,
      ],
    },
  ],
};

const privacyEn: LegalDoc = {
  title: "Privacy Policy",
  updated: "Last updated: 27 September 2026",
  intro:
    "Kiro (kiro.fineko.space and the mobile app) helps you find events nearby and register for them. This policy explains what data we collect, why, who receives it and how you can control it.",
  sections: [
    {
      heading: "1. Data we collect",
      items: [
        "Account: email, password (stored only as a secure hash), name and nickname (optional).",
        "Sign in with Google: your email and name from your Google account (we never see your Google password).",
        "Profile (optional): photo, short bio, social links, phone number and date of birth. Phone and date of birth are never shown to other users; the date of birth is used only to hide 18+ events from minors.",
        "Your activity: event registrations and your answers to organizers' questions, saved events, reviews, event chat messages, friend requests, organizer subscriptions, events you skipped in the feed.",
        "Events you create: description, date, address, photos and videos, price, capacity.",
        "Technical data: device push token for notifications, view/share counts for events (with a random session id), IP address and device type in server logs.",
      ],
    },
    {
      heading: "2. What we do not collect",
      paragraphs: [
        "We do not collect your device's GPS location or phone contacts, we do not store payment card data and we show no advertising. Payments (for example organizers' credit packages) are handled by payment providers; we never receive card numbers.",
      ],
    },
    {
      heading: "3. Why we use data",
      items: [
        "to create your account, authenticate you and provide the service (registrations, chat, notifications, friends);",
        "to show a relevant event feed (by city, categories, date, etc.);",
        "so organizers can see who registered and contact participants;",
        "to send notifications (push, in-app, email when needed) — you can switch them off in your profile settings;",
        "to prevent fraud and abuse, moderate content and handle reports;",
        "to count event views and improve the product (as aggregated statistics).",
      ],
    },
    {
      heading: "4. Who can see your data",
      items: [
        "Other users: your name/nickname, photo and bio, your reviews and event chat messages. Your name appears in an event's participant list only if you allowed it when registering.",
        "The organizer of an event you register for: your name, the contact details in your profile and your answers to their questions.",
        "Service providers that help us operate: Google (Sign-In and Google Places address suggestions, routed through our server), Expo (push delivery), hosting and email providers, payment providers (WayForPay, Mono) when you pay.",
        "We do not sell your data and do not share it with ad networks.",
      ],
    },
    {
      heading: "5. Cookies and local storage",
      paragraphs: [
        "On the website we use a technical cookie to keep you signed in (its lifetime depends on whether you chose “Remember me”) and browser local storage for language, theme and saved filters. We use no advertising or third-party tracking cookies.",
      ],
    },
    {
      heading: "6. How long we keep data",
      paragraphs: [
        "Account data is kept until you delete your account. After deletion personal data is erased or anonymised immediately; database backups are automatically purged within 14 days. Server logs are kept for a limited time for security.",
      ],
    },
    {
      heading: "7. Your rights",
      items: [
        "view and correct your profile data;",
        "turn off notifications and hide parts of your profile in settings;",
        "delete your account and associated personal data: in the app under “Profile → Delete account” or on the website in your profile; details on the “Account deletion” page;",
        "contact us with any request about your data at the address below.",
      ],
    },
    {
      heading: "8. Children",
      paragraphs: [
        "The service is intended for users aged 16 and over. We do not knowingly collect data from younger children; if you believe a child has created an account, write to us and we will delete it.",
      ],
    },
    {
      heading: "9. Security",
      paragraphs: [
        "Data is transmitted over HTTPS, passwords are stored as secure hashes and database access is restricted. No system is 100% secure, so we recommend a unique password.",
      ],
    },
    {
      heading: "10. Changes and contact",
      paragraphs: [
        `We may update this policy; the current version is always on this page with the date above. For questions about your data write to ${CONTACT_EMAIL}.`,
      ],
    },
  ],
};

const termsUk: LegalDoc = {
  title: "Умови користування",
  updated: "Останнє оновлення: 27 вересня 2026",
  intro:
    "Користуючись Кіро (сайтом і мобільним додатком), ви погоджуєтесь із цими умовами. Якщо не погоджуєтесь, будь ласка, не користуйтесь сервісом.",
  sections: [
    {
      heading: "1. Що це за сервіс",
      paragraphs: [
        "Кіро — платформа, де організатори публікують події, а користувачі їх знаходять і записуються. Події організовують і проводять треті сторони; ми не є організатором цих подій і не відповідаємо за їх проведення, безпеку та якість.",
      ],
    },
    {
      heading: "2. Акаунт",
      items: [
        "Користуватися сервісом можна з 16 років. Події з позначкою 18+ доступні лише повнолітнім.",
        "Ви відповідаєте за достовірність даних та збереження пароля й за дії зі свого акаунта.",
        "Один користувач — один акаунт. Ми можемо обмежити або заблокувати акаунт за порушення цих умов.",
      ],
    },
    {
      heading: "3. Правила поведінки та вміст",
      items: [
        "Заборонено публікувати незаконний, шахрайський, образливий, порнографічний, ворожий чи оманливий вміст, а також спам.",
        "Ви залишаєте за собою права на свій вміст і надаєте нам право показувати його в сервісі для роботи платформи.",
        "Ви можете поскаржитися на подію чи користувача кнопкою «Поскаржитись»; модератори розглядають скарги й можуть приховати вміст або заблокувати акаунт.",
      ],
    },
    {
      heading: "4. Для організаторів",
      items: [
        "Ви відповідаєте за точність опису події, її проведення та виконання вимог закону.",
        "Платні події: оплата учасників та повернення коштів відбуваються між вами й учасником; платформа лише надає інструменти обліку, якщо інше прямо не вказано.",
        "Публікація подій може потребувати кредитів. Правила їх використання вказані в розділі «Кредити».",
      ],
    },
    {
      heading: "5. Для учасників",
      paragraphs: [
        "Запис на подію не гарантує її проведення: організатор може змінити або скасувати подію. Ми сповіщаємо вас про такі зміни в застосунку.",
      ],
    },
    {
      heading: "6. Відмова від гарантій та відповідальність",
      paragraphs: [
        "Сервіс надається «як є». Ми докладаємо зусиль для його стабільності, але не гарантуємо безперервної роботи. У межах, дозволених законом, ми не відповідаємо за збитки, пов'язані з подіями, організаторами чи іншими користувачами.",
      ],
    },
    {
      heading: "7. Видалення акаунта",
      paragraphs: [
        "Ви можете видалити акаунт будь-коли: у додатку «Профіль → Видалити акаунт» або на сайті (докладно на сторінці «Видалення акаунта»).",
      ],
    },
    {
      heading: "8. Зміни умов і контакти",
      paragraphs: [
        `Ми можемо змінювати ці умови; продовжуючи користуватися сервісом після змін, ви приймаєте нову редакцію. Питання: ${CONTACT_EMAIL}.`,
      ],
    },
  ],
};

const termsEn: LegalDoc = {
  title: "Terms of Use",
  updated: "Last updated: 27 September 2026",
  intro:
    "By using Kiro (the website and mobile app) you agree to these terms. If you do not agree, please do not use the service.",
  sections: [
    {
      heading: "1. What the service is",
      paragraphs: [
        "Kiro is a platform where organizers publish events and users discover and register for them. Events are organized and run by third parties; we are not the organizer of these events and are not responsible for how they are run, their safety or quality.",
      ],
    },
    {
      heading: "2. Account",
      items: [
        "You must be at least 16 to use the service. 18+ events are available only to adults.",
        "You are responsible for the accuracy of your data, for keeping your password safe and for actions taken from your account.",
        "One person, one account. We may restrict or block an account that violates these terms.",
      ],
    },
    {
      heading: "3. Conduct and content",
      items: [
        "Do not post illegal, fraudulent, abusive, pornographic, hateful or misleading content, or spam.",
        "You keep the rights to your content and grant us the right to display it in the service to operate the platform.",
        "You can report an event or user with the Report button; moderators review reports and may hide content or block accounts.",
      ],
    },
    {
      heading: "4. For organizers",
      items: [
        "You are responsible for the accuracy of your event description, for running it and for complying with the law.",
        "Paid events: payment from participants and refunds are between you and the participant; the platform only provides record-keeping tools unless stated otherwise.",
        "Publishing events may require credits; the rules are in the Credits section.",
      ],
    },
    {
      heading: "5. For participants",
      paragraphs: [
        "Registering does not guarantee that the event takes place: the organizer may change or cancel it. We notify you about such changes in the app.",
      ],
    },
    {
      heading: "6. Disclaimer and liability",
      paragraphs: [
        "The service is provided “as is”. We work to keep it reliable but do not guarantee uninterrupted operation. To the extent permitted by law, we are not liable for losses related to events, organizers or other users.",
      ],
    },
    {
      heading: "7. Deleting your account",
      paragraphs: [
        "You can delete your account at any time: in the app under “Profile → Delete account” or on the website (details on the “Account deletion” page).",
      ],
    },
    {
      heading: "8. Changes and contact",
      paragraphs: [
        `We may change these terms; by continuing to use the service after changes you accept the new version. Questions: ${CONTACT_EMAIL}.`,
      ],
    },
  ],
};

const deletionUk: LegalDoc = {
  title: "Видалення акаунта",
  updated: "Останнє оновлення: 27 вересня 2026",
  intro:
    "Ви можете видалити свій акаунт Кіро та пов'язані з ним персональні дані в будь-який момент. Ось як це зробити і що станеться.",
  sections: [
    {
      heading: "Як видалити акаунт",
      items: [
        "У мобільному додатку: Профіль → «Видалити акаунт» → підтвердити.",
        "На сайті kiro.fineko.space: увійти → Профіль → внизу «Видалити акаунт» → підтвердити.",
        `Якщо ви не можете увійти: напишіть на ${CONTACT_EMAIL} із адреси, яку вказали при реєстрації, з темою «Видалення акаунта» — ми видалимо його протягом 7 днів.`,
      ],
    },
    {
      heading: "Що буде видалено одразу",
      items: [
        "email, ім'я, нікнейм, опис, фото, телефон і дата народження (акаунт знеособлюється, увійти в нього більше неможливо);",
        "сесії входу та токени push-сповіщень;",
        "збережені події, історія пропусків у стрічці, підписки, запити в друзі та дружні зв'язки, ваші відгуки;",
        "ваші актуальні реєстрації на майбутні події будуть скасовані.",
      ],
    },
    {
      heading: "Що станеться з подіями організатора",
      paragraphs: [
        "Ваші майбутні події буде скасовано, а їх учасники отримають сповіщення. Минулі події та повідомлення в чатах залишаються, але вже не прив'язані до вас (замість імені показується, що користувача видалено).",
      ],
    },
    {
      heading: "Що зберігається і як довго",
      paragraphs: [
        "Резервні копії бази даних, які можуть містити ваші дані на момент створення копії, автоматично видаляються протягом 14 днів. Обмежені технічні журнали безпеки зберігаються короткий час. Ми можемо зберігати мінімум даних, якщо цього вимагає закон.",
      ],
    },
    {
      heading: "Зверніть увагу",
      paragraphs: [
        "Видалення незворотне. Якщо ви організатор із майбутніми подіями, які хочете зберегти, спершу передайте їх співорганізатору.",
      ],
    },
  ],
};

const deletionEn: LegalDoc = {
  title: "Account deletion",
  updated: "Last updated: 27 September 2026",
  intro:
    "You can delete your Kiro account and the personal data associated with it at any time. Here is how, and what happens.",
  sections: [
    {
      heading: "How to delete your account",
      items: [
        "In the mobile app: Profile → “Delete account” → confirm.",
        "On kiro.fineko.space: sign in → Profile → “Delete account” at the bottom → confirm.",
        `If you cannot sign in: email ${CONTACT_EMAIL} from the address you registered with, subject “Account deletion” — we will delete it within 7 days.`,
      ],
    },
    {
      heading: "What is deleted immediately",
      items: [
        "email, name, nickname, bio, photo, phone number and date of birth (the account is anonymised and can no longer be used to sign in);",
        "sign-in sessions and push notification tokens;",
        "saved events, feed skip history, subscriptions, friend requests and friendships, and your reviews;",
        "your active registrations for upcoming events are cancelled.",
      ],
    },
    {
      heading: "What happens to an organizer's events",
      paragraphs: [
        "Your upcoming events are cancelled and their participants are notified. Past events and chat messages remain but are no longer linked to you (they show that the user was deleted).",
      ],
    },
    {
      heading: "What is kept and for how long",
      paragraphs: [
        "Database backups, which may contain your data as of the backup date, are automatically purged within 14 days. Limited technical security logs are kept for a short time. We may retain a minimum of data where the law requires it.",
      ],
    },
    {
      heading: "Please note",
      paragraphs: [
        "Deletion is irreversible. If you are an organizer with upcoming events you want to keep, first hand them over to a co-organizer.",
      ],
    },
  ],
};

const DOCS = {
  privacy: { uk: privacyUk, en: privacyEn },
  terms: { uk: termsUk, en: termsEn },
  "account-deletion": { uk: deletionUk, en: deletionEn },
} as const;

export type LegalSlug = keyof typeof DOCS;
export const LEGAL_SLUGS = Object.keys(DOCS) as LegalSlug[];

export function getLegalDoc(
  slug: LegalSlug,
  locale: SupportedLocale,
): LegalDoc {
  return DOCS[slug][locale === "uk" ? "uk" : "en"];
}
