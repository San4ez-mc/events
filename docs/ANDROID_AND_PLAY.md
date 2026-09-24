# Android: встановлення та публікація в Google Play

Застосунок: `apps/mobile` (Expo SDK 57). Бекенд має працювати на
`https://kiro.fineko.space` (див. `docs/DEPLOY.md`), бо збірка `eas.json`
вбудовує цю адресу. Поки бекенд не задеплоєно, застосунок не зможе увійти.

## A. Встановлення на свій телефон (APK, без магазину)

1. Створіть безкоштовний акаунт на https://expo.dev.
2. У терміналі:
   ```bash
   cd apps/mobile
   npx eas-cli login
   npx eas-cli build:configure      # один раз, погодьтесь на Android
   npx eas-cli build -p android --profile preview
   ```
3. Збірка займає 10-20 хв на серверах Expo. Наприкінці буде посилання та QR
   на `.apk`.
4. Відкрийте посилання на телефоні, завантажте APK. Android попросить дозволити
   встановлення з цього джерела (Налаштування -> Безпека). Встановіть.

Швидка перевірка без збірки: встановіть Expo Go, у `apps/mobile/.env`
поставте `EXPO_PUBLIC_API_URL` на IP комп'ютера (`http://192.168.x.x:3100`),
`pnpm --filter @kiro/mobile start` і відскануйте QR. Push-сповіщень у Expo Go на
Android немає.

## B. Публікація в Google Play

### Одноразова підготовка
1. Акаунт розробника Google Play: https://play.google.com/console, разова
   плата $25, підтвердження особи. Для нових особистих акаунтів Google вимагає
   закритого тестування: мінімум 12 тестувальників протягом 14 днів перед
   виходом у production.
2. Фінальний `applicationId`. Зараз `com.kiro.app` тимчасовий. Після першої
   публікації змінити його неможливо, тож вирішіть зараз і змініть в
   `apps/mobile/app.json` (`android.package`).
3. Матеріали: іконка 512x512 PNG, feature graphic 1024x500, мінімум 2
   скриншоти телефона, короткий (80 симв.) і повний опис, політика
   конфіденційності за публічним URL (обов'язково: застосунок збирає email
   і ім'я).
4. Push-сповіщення: у Firebase створіть проєкт, додайте Android-застосунок з
   тим самим `applicationId`, завантажте `google-services.json` і вкажіть його
   в `app.json` (`android.googleServicesFile`). Ключ FCM додайте в EAS:
   `npx eas-cli credentials`.

### Збірка та завантаження
```bash
cd apps/mobile
npx eas-cli build -p android --profile production   # створює .aab
npx eas-cli submit -p android --latest              # або завантажте .aab вручну
```
Для `submit` потрібен service account JSON з Google Play Console
(Налаштування -> API access), або завантажте `.aab` у розділ Release вручну.

### У Play Console
1. Створити застосунок (мова: українська, тип: застосунок, безкоштовний).
2. Заповнити: Store listing, Content rating (анкета), Target audience,
   Data safety (email, ім'я, ідентифікатор пристрою для push, поведінка в
   застосунку), Privacy policy URL, News/Ads декларації.
3. Testing -> Closed testing: завантажити `.aab`, додати тестувальників,
   утримувати 14 днів (для нових особистих акаунтів).
4. Production -> Create release -> завантажити `.aab` -> Send for review.
   Перевірка зазвичай від кількох годин до 7 днів.

## Перед публікацією перевірити
- Бекенд на `https://kiro.fineko.space` працює, реєстрація/вхід проходять.
- У мобільному наживо не пройдено: вхід, пошук, "Мої події", сповіщення,
  профіль, реєстрація на подію. Пройдіть їх на реальному пристрої з APK.
- Створення й керування подіями є тільки у вебі (свідоме обмеження).
