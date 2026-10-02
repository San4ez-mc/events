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
export const THREADS_URL = "https://www.threads.com/@kiro.ukraine";
export const LEGAL_UPDATED = "2026-09-27";

export const COMPANY_NAME_UK = "ФОП Мацук Олександр Романович";
export const COMPANY_NAME_EN = "Sole Proprietor (FOP) Oleksandr Matsuk";
export const COMPANY_TAX_ID = "3404907619";
export const COMPANY_ADDRESS = "м. Тернопіль, вул. Львівська, 1";
export const COMPANY_ADDRESS_EN = "1 Lvivska St, Ternopil, Ukraine";
export const COMPANY_PHONE = "+380966358365";

const privacyUk: LegalDoc = {
  title: "Політика конфіденційності",
  updated: "Останнє оновлення: 3 жовтня 2026",
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
        "Аналітика використання: які сторінки й екрани ви відкриваєте, скільки часу на них проводите, пошукові запити в застосунку, ключові дії (збереження, реєстрація, створення події), тип пристрою та ОС, випадковий ідентифікатор пристрою; після входу — ваш внутрішній ідентифікатор користувача (без email та імені).",
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
        "Постачальники, що допомагають працювати сервісу: Google (вхід через Google і підказки адрес Google Places, запити до яких проходять через наш сервер), Expo (доставка push-сповіщень), PostHog (аналітика використання, сервери в ЄС), Google Analytics (аналітика сайту, лише за вашою згодою), постачальник хостингу й поштового сервісу, платіжні провайдери (WayForPay, Mono) під час оплати.",
        "Ми не продаємо ваші дані й не передаємо їх рекламним мережам.",
      ],
    },
    {
      heading: "5. Cookie та локальне сховище",
      paragraphs: [
        "На сайті ми використовуємо технічний cookie для підтримання сесії входу (термін залежить від того, чи ви обрали «Запам'ятати мене») та локальне сховище браузера для мови, теми та збережених фільтрів. Аналітичні cookie (PostHog, Google Analytics) вмикаються лише після вашої згоди в банері на сайті; якщо ви натиснули «Відхилити», аналітика працює без збереження даних у вашому браузері, а Google Analytics не завантажується. Рекламних cookie ми не використовуємо. У застосунку аналітика використовує випадковий ідентифікатор пристрою; ми не використовуємо його для реклами й не відстежуємо вас в інших застосунках.",
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
  updated: "Last updated: 3 October 2026",
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
        "Usage analytics: which pages and screens you open and for how long, in-app search queries, key actions (saving, registering, creating an event), device type and OS, a random device identifier; once signed in, your internal user id (never your email or name).",
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
        "Service providers that help us operate: Google (Sign-In and Google Places address suggestions, routed through our server), Expo (push delivery), PostHog (usage analytics, EU servers), Google Analytics (website analytics, only with your consent), hosting and email providers, payment providers (WayForPay, Mono) when you pay.",
        "We do not sell your data and do not share it with ad networks.",
      ],
    },
    {
      heading: "5. Cookies and local storage",
      paragraphs: [
        "On the website we use a technical cookie to keep you signed in (its lifetime depends on whether you chose “Remember me”) and browser local storage for language, theme and saved filters. Analytics cookies (PostHog, Google Analytics) are turned on only after you accept the banner on the website; if you choose “Decline”, analytics runs without storing anything in your browser and Google Analytics is not loaded. We use no advertising cookies. In the app, analytics uses a random device identifier; we do not use it for advertising and do not track you across other apps.",
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
  title: "Правила і умови",
  updated: "Останнє оновлення: 29 вересня 2026",
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
        "Публікація подій може потребувати кредитів — разових (сторінка «Ціни») або отриманих щомісяця за підпискою «Старт»/«Про». Підписка також відкриває співорганізаторів, повторювані події, пріоритет у стрічці та бейдж. Умови оплати — на сторінці «Публічна оферта».",
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
  title: "Terms and Conditions",
  updated: "Last updated: 29 September 2026",
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
        "Publishing events may require credits — bought one-off (see \"Pricing\") or granted monthly by a Starter/Pro subscription. The subscription also unlocks co-organizers, recurring events, feed priority and a badge. Payment terms are on the \"Public Offer\" page.",
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

const offerUk: LegalDoc = {
  title: "Публічна оферта",
  updated: "Останнє оновлення: 29 вересня 2026",
  intro:
    "Цей документ є публічною офертою (договором) відповідно до ст. 633, 641 Цивільного кодексу України. Оплата пакета кредитів або підписки на сайті kiro.fineko.space чи в мобільному додатку Кіро є повним і безумовним прийняттям (акцептом) цієї оферти.",
  sections: [
    {
      heading: "1. Предмет договору",
      paragraphs: [
        "Продавець (реквізити — на сторінці «Контакти») надає покупцю (організатору подій) один із двох цифрових продуктів: пакет «кредитів» — разове право на публікацію відповідної кількості подій, або підписку «Старт»/«Про» — щомісячне право на публікацію (кредити нараховуються щомісяця) разом із додатковими можливостями сервісу. Ні кредити, ні підписка не є грошовим засобом, не підлягають обміну на готівку і діють лише в межах сервісу Кіро.",
      ],
    },
    {
      heading: "2. Кредити: ціна та оплата",
      items: [
        "Актуальні пакети та ціни показуються на сторінці «Ціни» перед оплатою; на момент публікації цієї оферти діють: «1 публікація» — 199 грн, «5 публікацій» — 799 грн, «10 публікацій» — 1499 грн.",
        "Оплата приймається через платіжні системи WayForPay та/або Monobank Acquiring. Дані банківської картки вводяться на стороні платіжної системи; продавець їх не бачить і не зберігає.",
      ],
    },
    {
      heading: "3. Підписка: ціна, тривалість, поновлення",
      items: [
        "Тарифи на момент публікації цієї оферти: «Старт» — 199 грн/місяць (5 кредитів щомісяця), «Про» — 449 грн/місяць (15 кредитів щомісяця, пріоритет у стрічці, бейдж «Перевірений організатор», доступ до співорганізаторів і повторюваних подій). Актуальні тарифи — на сторінці «Ціни».",
        "Одна оплата активує рівно один місяць доступу від дати оплати (або продовжує поточний період, якщо ви оплачуєте заздалегідь). Підписка НЕ списується автоматично: щоб продовжити користування після завершення оплаченого місяця, потрібно оплатити наступний період вручну на сторінці «Ціни». Про наближення завершення періоду сервіс попереджає в акаунті/сповіщеннях.",
        "Оплата приймається через WayForPay та/або Monobank Acquiring (банківський переказ для підписки не приймається).",
      ],
    },
    {
      heading: "4. Порядок надання (\"доставки\")",
      paragraphs: [
        "Кредити нараховуються, а підписка активується на акаунт покупця автоматично, одразу після підтвердження оплати платіжною системою — зазвичай упродовж кількох хвилин. Якщо цього не відбулося протягом 24 годин після успішної оплати, звертайтесь на " +
          CONTACT_EMAIL +
          " із зазначенням email акаунта та часу оплати.",
      ],
    },
    {
      heading: "5. Право на відмову від договору",
      paragraphs: [
        "Кредити й підписка є цифровим контентом, що не постачається на матеріальному носії. Відповідно до Закону України «Про захист прав споживачів», право на відмову від договору про постачання цифрового контенту втрачається з моменту, коли його постачання розпочалося за прямою згодою споживача (тобто з моменту нарахування кредитів або активації підписки). Умови повернення коштів — на сторінці «Повернення коштів».",
      ],
    },
    {
      heading: "6. Відповідальність",
      paragraphs: [
        "Продавець надає лише технічну платформу для публікації подій і прийому оплати за кредити та підписку. Продавець не є організатором подій, розміщених у сервісі третіми особами, і не відповідає за їх проведення, якість, безпеку чи скасування.",
      ],
    },
    {
      heading: "7. Реквізити продавця",
      paragraphs: ["Повні реквізити — на сторінці «Контакти»."],
    },
  ],
};

const offerEn: LegalDoc = {
  title: "Public Offer",
  updated: "Last updated: 29 September 2026",
  intro:
    "This is a public offer (contract) under Articles 633 and 641 of the Civil Code of Ukraine. Paying for a credit package or a subscription on kiro.fineko.space or in the Kiro mobile app is full and unconditional acceptance of this offer.",
  sections: [
    {
      heading: "1. Subject of the agreement",
      paragraphs: [
        "The Seller (details on the \"Contacts\" page) provides the Buyer (an event organizer) one of two digital products: a package of \"credits\" — a one-off right to publish a corresponding number of events, or a \"Starter\"/\"Pro\" subscription — a monthly right to publish (credits are granted every month) plus additional service features. Neither credits nor a subscription are a monetary instrument, are exchangeable for cash, or are valid outside the Kiro service.",
      ],
    },
    {
      heading: "2. Credits: price and payment",
      items: [
        "Current packages and prices are shown on the \"Pricing\" page before payment; at the time this offer was published: \"1 publication\" — 199 UAH, \"5 publications\" — 799 UAH, \"10 publications\" — 1499 UAH.",
        "Payment is accepted via WayForPay and/or Monobank Acquiring. Card details are entered on the payment provider's side; the Seller never sees or stores them.",
      ],
    },
    {
      heading: "3. Subscription: price, duration, renewal",
      items: [
        "Tiers at the time this offer was published: \"Starter\" — 199 UAH/month (5 credits/month), \"Pro\" — 449 UAH/month (15 credits/month, feed priority, \"Verified organizer\" badge, access to co-organizers and recurring events). Current tiers are on the \"Pricing\" page.",
        "One payment activates exactly one month of access from the payment date (or extends the current period if paid in advance). The subscription does NOT auto-renew: to keep using it after the paid month ends, pay for the next period manually on the \"Pricing\" page. The service warns you in-account/via notifications as the period nears its end.",
        "Payment is accepted via WayForPay and/or Monobank Acquiring (bank transfer is not accepted for subscriptions).",
      ],
    },
    {
      heading: "4. Delivery",
      paragraphs: [
        `Credits are added, or the subscription activated, on the Buyer's account automatically, immediately after the payment provider confirms payment — usually within a few minutes. If this hasn't happened within 24 hours of a successful payment, contact ${CONTACT_EMAIL} with your account email and the payment time.`,
      ],
    },
    {
      heading: "5. Right of withdrawal",
      paragraphs: [
        "Credits and subscriptions are digital content not supplied on a tangible medium. Under Ukraine's consumer protection law, the right to withdraw from a digital-content contract is lost once supply begins with the consumer's prior express consent (i.e. once credits are granted or the subscription activated). Refund terms are on the \"Refund Policy\" page.",
      ],
    },
    {
      heading: "6. Liability",
      paragraphs: [
        "The Seller provides only the technical platform for publishing events and accepting payment for credits and subscriptions. The Seller is not the organizer of events listed by third parties and is not responsible for how they are run, their quality, safety, or cancellation.",
      ],
    },
    {
      heading: "7. Seller details",
      paragraphs: ["Full details are on the \"Contacts\" page."],
    },
  ],
};

const refundUk: LegalDoc = {
  title: "Повернення коштів",
  updated: "Останнє оновлення: 29 вересня 2026",
  intro: "Умови повернення коштів за пакети кредитів і підписку, придбані на kiro.fineko.space або в мобільному додатку Кіро.",
  sections: [
    {
      heading: "1. Коли кошти повертаються повністю",
      items: [
        "Технічна помилка на нашій стороні: оплата пройшла, але кредити не зараховані чи підписка не активована, або нараховано/активовано двічі за одну оплату.",
        "Помилкове/дубльоване списання платіжною системою за один і той самий пакет чи період підписки.",
      ],
    },
    {
      heading: "2. Кредити: коли можна повернути невикористані",
      paragraphs: [
        "Якщо жоден кредит із придбаного пакета ще не був використаний для публікації події, ви можете запросити повернення протягом 14 днів з дати оплати.",
      ],
    },
    {
      heading: "3. Підписка: коли можна повернути оплату за період",
      paragraphs: [
        "Якщо з моменту активації минуло не більше 14 днів і ви ще не використали жодного кредиту, отриманого за цей період, та жодної можливості тарифу «Про» (додавання співорганізатора, створення серії повторюваних подій) — можна запросити повернення оплати за цей період підписки.",
      ],
    },
    {
      heading: "4. Коли кошти не повертаються",
      items: [
        "Кредит (разовий чи з підписки) уже використано для публікації події — незалежно від того, відбулася подія чи ні (за проведення власних подій відповідає організатор, див. «Правила і умови», п. 4).",
        "Для тарифу «Про» — уже використано хоча б одну з ексклюзивних можливостей періоду (співорганізатор, повторювана подія).",
        "Минуло понад 14 днів з моменту оплати.",
      ],
    },
    {
      heading: "5. Як подати запит на повернення",
      paragraphs: [
        `Напишіть на ${CONTACT_EMAIL} з email, яким зареєстровано акаунт, приблизною датою й сумою оплати, і короткою причиною. Розглядаємо звернення протягом 10 робочих днів; кошти повертаються тим самим платіжним провайдером (WayForPay або Monobank) на картку, з якої була оплата.`,
      ],
    },
  ],
};

const refundEn: LegalDoc = {
  title: "Refund Policy",
  updated: "Last updated: 29 September 2026",
  intro: "Refund terms for credit packages and subscriptions purchased on kiro.fineko.space or in the Kiro mobile app.",
  sections: [
    {
      heading: "1. Full refund",
      items: [
        "A technical error on our side: payment went through but credits weren't added or the subscription wasn't activated, or either happened twice for one payment.",
        "A duplicate/erroneous charge by the payment provider for the same package or subscription period.",
      ],
    },
    {
      heading: "2. Credits: unused credits",
      paragraphs: [
        "If none of the credits in a purchased package have been used to publish an event yet, you can request a refund within 14 days of the payment date.",
      ],
    },
    {
      heading: "3. Subscription: refunding a period",
      paragraphs: [
        "If no more than 14 days have passed since activation, and you haven't used any credit granted for that period nor any Pro-tier feature (adding a co-organizer, creating a recurring series), you can request a refund for that subscription payment.",
      ],
    },
    {
      heading: "4. No refund",
      items: [
        "A credit (one-off or from a subscription) has already been used to publish an event — regardless of whether the event actually took place (the organizer is responsible for running their own events, see \"Terms and Conditions\", section 4).",
        "For the Pro tier — at least one exclusive feature of the period has already been used (co-organizer, recurring event).",
        "More than 14 days have passed since payment.",
      ],
    },
    {
      heading: "5. How to request a refund",
      paragraphs: [
        `Email ${CONTACT_EMAIL} with your account's email, the approximate payment date and amount, and a short reason. We review requests within 10 business days; funds are returned by the same payment provider (WayForPay or Monobank) to the card used to pay.`,
      ],
    },
  ],
};

const contactsUk: LegalDoc = {
  title: "Контакти та реквізити",
  updated: "Останнє оновлення: 29 вересня 2026",
  intro: "Реквізити продавця послуг сервісу Кіро (стосується публічної оферти та повернення коштів).",
  sections: [
    {
      heading: "Продавець",
      items: [
        `Найменування: ${COMPANY_NAME_UK}`,
        `Податковий номер (РНОКПП/ЄДРПОУ): ${COMPANY_TAX_ID}`,
        `Юридична адреса: ${COMPANY_ADDRESS}`,
        `Фактична адреса: ${COMPANY_ADDRESS}`,
      ],
    },
    {
      heading: "Служба підтримки",
      items: [`Email: ${CONTACT_EMAIL}`, `Телефон: ${COMPANY_PHONE}`, `Threads: ${THREADS_URL}`, "Графік роботи: пн–пт, 10:00–18:00 (Київ)"],
    },
  ],
};

const contactsEn: LegalDoc = {
  title: "Contacts & Legal Details",
  updated: "Last updated: 29 September 2026",
  intro: "Seller details for Kiro's services (referenced by the Public Offer and Refund Policy pages).",
  sections: [
    {
      heading: "Seller",
      items: [
        `Legal name: ${COMPANY_NAME_EN}`,
        `Tax ID: ${COMPANY_TAX_ID}`,
        `Legal address: ${COMPANY_ADDRESS_EN}`,
        `Actual address: ${COMPANY_ADDRESS_EN}`,
      ],
    },
    {
      heading: "Support",
      items: [`Email: ${CONTACT_EMAIL}`, `Phone: ${COMPANY_PHONE}`, `Threads: ${THREADS_URL}`, "Hours: Mon–Fri, 10:00–18:00 (Kyiv time)"],
    },
  ],
};

const DOCS = {
  privacy: { uk: privacyUk, en: privacyEn },
  terms: { uk: termsUk, en: termsEn },
  "account-deletion": { uk: deletionUk, en: deletionEn },
  offer: { uk: offerUk, en: offerEn },
  refund: { uk: refundUk, en: refundEn },
  contacts: { uk: contactsUk, en: contactsEn },
} as const;

export type LegalSlug = keyof typeof DOCS;
export const LEGAL_SLUGS = Object.keys(DOCS) as LegalSlug[];

export function getLegalDoc(
  slug: LegalSlug,
  locale: SupportedLocale,
): LegalDoc {
  return DOCS[slug][locale === "uk" ? "uk" : "en"];
}
