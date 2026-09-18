# Progress

Фази — за `docs/spec/technical-specification.docx` §115. Оновлювати по ходу
роботи; це джерело правди про "що вже зроблено", а не пам'ять агента.

## Phase 0 — Foundation

Acceptance (з ТЗ): "all three apps run locally and communicate with one API."

- [x] Monorepo: pnpm workspaces + Turborepo, спільні tsconfig/eslint-config
- [x] VPS: SSH-доступ по ключу, `postgis`/`pg_trgm`, БД `kiro_dev`/`kiro_test`
- [x] Prisma підключено, перша міграція (`users`, auth-таблиці, `system_settings`, `audit_logs`)
- [x] Auth: register/login/refresh-rotation+reuse-detection/verify-email/forgot-reset-password,
      httpOnly cookie (web) vs body (mobile), RBAC guard-каркас (`@Public`, `@Roles`)
- [x] Error contract (`{error:{code,message}}`), request-id, structured logging (pino)
- [x] `apps/web` заскафолджено (Next.js App Router + Tailwind) — **ще без реальних сторінок**
- [x] `apps/mobile` заскафолджено (Expo) — **ще без реальних екранів/Expo Router tabs**
- [x] `@kiro/api-client` — typed client генерується з живого OpenAPI
- [x] `@kiro/i18n` — uk/en ресурси (auth/common), ще не підключені до web/mobile UI
- [x] Тести: unit (TokenService, duration parser) + e2e (register/login/
      refresh-rotation+reuse-detection/auth-guard) проти реальної `kiro_test` —
      10/10 проходять. `pnpm lint && pnpm typecheck && pnpm build && pnpm test
      && pnpm test:e2e` — усе зелене з кореня монорепо.
- [x] CI (`.github/workflows/ci.yml`): lint/typecheck/build/test на push/PR,
      з postgis/postgres service-контейнером — **не перевірено в реальному
      GitHub Actions**, бо репо ще без remote
- [ ] Seed-скрипт: тільки super-admin + system_settings; ще нема категорій/географії (Phase 1)
- [ ] git: репо ініціалізовано локально, ще не запушено нікуди (немає remote)

## Phase 1 — Event core

geography, categories, create/edit event, media, Google Places, публічна
сторінка події, список подій організатора. **Не почато.**

## Phase 2 — Publication

credits, перші 5 безкоштовних, publish flow, moderation, public/private,
event status flow. **Не почато.**

## Phase 3 — Discovery

tinder-картки, swipe, фільтри, пошук (pg_trgm), pass-history, saves, share.
**Не почато.**

## Phase 4 — Registration

кастомні поля реєстрації, approval, capacity, external payment link, manual
confirm, cancellation, waitlist. **Не почато.**

## Phase 5 — Notifications

in-app, Expo push, reminders (24h/1h), event-changed, organizer notifications.
**Не почато.**

## Phase 6 — Social

profiles, profile sharing, friends, friend-event-status, subscriptions,
private notes. **Не почато.**

## Phase 7 — Organizer

dashboard/статистика, co-organizers, invite previous participants, recurring
events, duplicate event. **Не почато.**

## Phase 8 — Reviews

post-event review, organizer aggregate rating. **Не почато.**

## Phase 9 — Kiro payments

credit packages, platform payment orders, WayForPay/Mono/manual-IBAN
adapters, webhooks, idempotency. **Не почато.**

## Phase 10 — Admin

users/events/moderation/reports/categories/district-merge/credits/payments/
audit — admin routes, phone-friendly UI. **Не почато.**

## Наскрізне (не прив'язане до однієї фази)

- [ ] Реальний UI на web (routes: `/`, `/events/*`, `/search`, `/profile/*`,
      `/organizer/*`, `/admin/*`)
- [ ] Реальні екрани на mobile (bottom tabs: Discover/Search/Create/Notifications/Profile)
      + Expo push реєстрація токенів
  Реальна деплой-конфігурація на VPS (nginx vhost, systemd/PM2, MinIO) —
- [ ] порти й план вже задокументовано в `docs/VPS_ACCESS.md`, сам деплой ще не робився
- [ ] App Store / Play Store: bundle ID/applicationId (зараз **заглушка**
      `com.kiro.app` — навмисно не фіналізований, узгодити перед реальним
      submit), Apple Developer + Google Play акаунти (створює власник —
      агент не може вводити платіжні дані), іконки в правильному форматі
      (див. `docs/brand/README.md`), privacy policy, App Privacy /
      Data Safety форми, EAS Build конфігурація

## Відомі технічні рішення/відхилення від буквального ТЗ

- PostGIS/pg_trgm **не** керуються через Prisma `postgresqlExtensions`
  (вимагає superuser в межах самої міграції) — увімкнені напряму через
  bootstrap-скрипт на сервері. Prisma-моделі не використовують нативні
  geometry-колонки (lat/lng лишаються `Decimal`), тож на функціональність
  це не впливає — деталі в коментарі на початку `apps/api/prisma/schema.prisma`.
