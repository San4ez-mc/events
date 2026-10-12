# Збірка Android на GitHub (без ліміту Expo)

Безкоштовні збірки на серверах Expo мають місячний ліміт. Цей спосіб збирає той самий `.aab` на безкоштовному сервері
GitHub (репозиторій публічний, тож Actions безкоштовні) командою `eas build --local`.

## Одноразове налаштування (5 хвилин)

1. **Токен Expo.** expo.dev → Account settings → Access tokens → Create token → скопіюйте.
2. **GitHub → репозиторій → Settings → Secrets and variables → Actions → New repository secret**, два секрети:
   - `EXPO_TOKEN` — токен з кроку 1;
   - `GOOGLE_SERVICES_JSON` — весь вміст файлу `apps/mobile/google-services.json` (відкрийте його в блокноті, виділіть усе, вставте).

## Кожна збірка

1. GitHub → вкладка **Actions** → зліва **Android build (Google Play .aab)** → **Run workflow** → профіль `production` → Run.
2. Збірка йде приблизно 25–45 хвилин. Коли позначка зелена, відкрийте запуск і внизу, в **Artifacts**, завантажте
   `kiro-android-production` (це zip з `kiro-production.aab`).
3. Google Play Console → закрите тестування → створити випуск → завантажити `.aab`.
4. Видаліть артефакт зі сторінки запуску (він зберігається 3 дні, і доступний тим, хто має доступ до репозиторію).

Номер версії (versionCode) збільшується автоматично, як і на Expo.

## Якщо щось не вийшло

Відкрийте запуск, розгорніть крок **Build** і скопіюйте останні рядки помилки.
