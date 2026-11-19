# ТЗ для лендингу kiro-lp.fineko.space: реферальні посилання

Мета: коли людина прийшла на лендинг за особистим посиланням запрошення, її код **не губиться** і доходить до
реєстрації в Кіро (на сайті й в Android-додатку). Тоді в адмінці видно, хто кого запросив.

## 1. Як людина потрапляє на лендинг

Особисте посилання виглядає так: `https://kiro.fineko.space/r/3S9N59FF`. Воно (на боці Кіро) рахує перехід, ставить cookie
`kiro_ref` на домен `.fineko.space` і перенаправляє на лендинг:

```
https://kiro-lp.fineko.space/?ref=3S9N59FF&utm_source=invite&utm_medium=referral
```

**Код реферала** (далі `CODE`): рівно 8 символів, великі латинські літери й цифри. Приклад: `3S9N59FF`.

## 2. Що має зробити лендинг

### 2.1. Прочитати й запам'ятати код (на кожній сторінці, при завантаженні)

Джерела за пріоритетом: параметр `?ref=` в адресі, потім cookie `kiro_ref`, потім `localStorage.kiro_ref`.

- Нормалізація: `код.toUpperCase().replace(/[^A-Z0-9]/g, "")`. Валідний лише якщо довжина **рівно 8**. Інакше ігнорувати.
- Якщо код знайдено, зберегти:
  - cookie: `kiro_ref=CODE; Max-Age=2592000; Path=/; Domain=.fineko.space; SameSite=Lax; Secure` (30 днів, домен саме
    `.fineko.space`, щоб cookie бачив і сам сайт Кіро);
  - `localStorage.kiro_ref = CODE`.
- Якщо коду немає, лендинг працює як зараз, нічого не ламати.
- Нічого не показувати людині (код приховати), не питати дозволів, не збирати персональних даних.

### 2.2. Підставити код у всі кнопки, що ведуть у Кіро

Усі посилання робити звичайними `<a href>` (щоб працювало й без JS), а JS після зчитування коду оновлює `href`.
Вони мають оновлюватись **і при першому завантаженні, і після перемикання вкладок «Android / iPhone / Комп'ютер»**
(форма на скріншоті перемальовується): тому проставити `data-kiro-link="…"` на кожне таке посилання і викликати оновлення
при завантаженні та після кожного перемикання вкладки (або через `MutationObserver`).

| Кнопка | Куди веде | Приклад (з кодом `3S9N59FF`) | Без коду |
|---|---|---|---|
| Android: «Встановити / Завантажити з Google Play» | наш адрес `/get` (НЕ напряму в Google Play) | `https://kiro.fineko.space/get?ref=3S9N59FF` | `https://kiro.fineko.space/get` |
| iPhone: відкрити в браузері / «додати на екран» | `/get` з `to=web` | `https://kiro.fineko.space/get?to=web&ref=3S9N59FF` | `https://kiro.fineko.space/get?to=web` |
| Комп'ютер: «Відкрити Kiro» | сайт | `https://kiro.fineko.space/?ref=3S9N59FF` | `https://kiro.fineko.space/` |
| «Надіслати посилання в Telegram» | поділитися адресою **лендингу** з кодом (на телефоні лендинг сам покаже потрібну кнопку) | `https://t.me/share/url?url=` + `encodeURIComponent("https://kiro-lp.fineko.space/?ref=3S9N59FF")` + `&text=` + текст | те саме без `?ref=` |
| «Зареєструватися» (де є) | реєстрація на сайті | `https://kiro.fineko.space/register?ref=3S9N59FF` | `https://kiro.fineko.space/register` |
| «Увійти» (де є) | вхід на сайті | `https://kiro.fineko.space/login?ref=3S9N59FF` | `https://kiro.fineko.space/login` |

Важливо:
- **Не вести напряму на `play.google.com`.** Адрес `/get` рахує натискання «Завантажити» і сам перенаправляє в Google Play,
  додаючи код у параметр `referrer`, який Google передає додатку після встановлення. Якщо дописати `?ref=` до посилання на
  Google Play, воно **не спрацює** (Google такий параметр ігнорує).
- Параметр коду завжди називається `ref`.
- Будь-яке інше посилання на `kiro.fineko.space` на лендингу (приклади роботи, футер) теж може отримувати `?ref=CODE`.

### 2.3. Орієнтовний код (приклад)

```js
const KEY = "kiro_ref";
const norm = (s) => { const c = String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, ""); return c.length === 8 ? c : null; };
const fromCookie = () => norm((document.cookie.split("; ").find((c) => c.startsWith(KEY + "=")) || "").split("=")[1]);
const fromStorage = () => { try { return norm(localStorage.getItem(KEY)); } catch { return null; } };

function readCode() {
  const code = norm(new URLSearchParams(location.search).get("ref")) || fromCookie() || fromStorage();
  if (code) {
    document.cookie = `${KEY}=${code}; Max-Age=2592000; Path=/; Domain=.fineko.space; SameSite=Lax; Secure`;
    try { localStorage.setItem(KEY, code); } catch {}
  }
  return code;
}

const APP = "https://kiro.fineko.space";
const LANDING = "https://kiro-lp.fineko.space/";
const targets = {
  play:     (c) => `${APP}/get${c ? `?ref=${c}` : ""}`,
  iphone:   (c) => `${APP}/get?to=web${c ? `&ref=${c}` : ""}`,
  web:      (c) => `${APP}/${c ? `?ref=${c}` : ""}`,
  register: (c) => `${APP}/register${c ? `?ref=${c}` : ""}`,
  login:    (c) => `${APP}/login${c ? `?ref=${c}` : ""}`,
  telegram: (c, text) => `https://t.me/share/url?url=${encodeURIComponent(LANDING + (c ? `?ref=${c}` : ""))}&text=${encodeURIComponent(text)}`,
};

function applyRef() {
  const code = readCode();
  document.querySelectorAll("[data-kiro-link]").forEach((a) => {
    const kind = a.dataset.kiroLink;
    a.href = kind === "telegram" ? targets.telegram(code, a.dataset.shareText || "Кіро: афіша подій") : targets[kind](code);
  });
}
document.addEventListener("DOMContentLoaded", applyRef);
// Run applyRef() again after every tab switch (Android / iPhone / Комп'ютер) or observe DOM changes in the install block.
```

### 2.4. Чого НЕ робити
- Не викликати наше API з лендингу (облік робить сайт Кіро через `/r/…` і `/get`).
- Не зберігати й не відправляти нікуди персональні дані, код вважати не секретним, але й не показувати.
- Не ламати лендинг, якщо cookie заблоковані: працювати через `localStorage` і `?ref=`.

## 3. Перевірка (приймання)

Для тестів використовувати неіснуючий код `TEST2222` (наш сервер його просто ігнорує й нічого не рахує):

1. Відкрити `https://kiro-lp.fineko.space/?ref=TEST2222`:
   - кнопка Android веде на `https://kiro.fineko.space/get?ref=TEST2222`;
   - «Відкрити Kiro» веде на `https://kiro.fineko.space/?ref=TEST2222`;
   - Telegram-посилання містить закодоване `https://kiro-lp.fineko.space/?ref=TEST2222`.
2. Перезавантажити без `?ref=`: посилання **лишаються з кодом** (береться з cookie).
3. Перемкнути вкладки Android / iPhone / Комп'ютер: у кожній кнопки з кодом.
4. Відкрити без коду і з cookie, очищеними: усі посилання без `?ref=`, лендинг працює як раніше.
5. Невалідний код (`?ref=abc`) ігнорується.
6. Натиснути Android-кнопку (з `TEST2222`): має перекинути на Google Play, у посиланні є
   `referrer=kiro_ref%3DTEST2222…`.
7. Cookie `kiro_ref` видна в браузері на `kiro.fineko.space` (домен `.fineko.space`).

## 4. Що робить сторона Кіро (для довідки)
- `/r/CODE` рахує перехід і веде на лендинг з `?ref=`.
- `/get?ref=CODE` рахує натискання «Завантажити» і веде в Google Play з `referrer` (або на сайт при `to=web`).
- Реєстрація на сайті бере код із `?ref=` / cookie і записує, хто запросив. В Android-додатку код вводиться вручну в
  реєстрації; автоматичне зчитування з Google Play з'явиться в одній із наступних збірок додатка.
