# Kiro

Платформа пошуку подій та розваг: Tinder-подібна стрічка подій, організаторський
інструментарій, реєстрація учасників, кредити на публікацію. iOS + Android +
responsive web + admin panel, один спільний backend API.

Джерела вимог: [`docs/spec/technical-specification.docx`](docs/spec/technical-specification.docx)
(архітектура/API/DB) та [`docs/spec/product-ux.docx`](docs/spec/product-ux.docx) (продукт/UX).

## Стек

- **Backend**: NestJS + Prisma + PostgreSQL (PostGIS, pg_trgm) — `apps/api`
- **Web**: Next.js (App Router) + Tailwind — `apps/web` (включає `/admin`)
- **Mobile**: Expo + Expo Router (React Native) — `apps/mobile`
- **Спільне**: `packages/*` — types, zod-схеми, i18n (uk/en), typed API-клієнт
  згенерований з OpenAPI, shared tsconfig/eslint

Monorepo: pnpm workspaces + Turborepo. Деталі — `docs/spec/technical-specification.docx` §2-3.

## Швидкий старт

```bash
corepack enable
pnpm install
```

### База даних

Dev PostgreSQL живе на VPS (не локально — Docker/psql на цій машині немає).
Локальна розробка йде через SSH-тунель:

```bash
pnpm db:tunnel        # тримати відкритим в окремому терміналі
```

Це прокидає `localhost:5433` → VPS `127.0.0.1:5432`. Деталі доступу —
[`docs/VPS_ACCESS.md`](docs/VPS_ACCESS.md).

```bash
cp apps/api/.env.example apps/api/.env   # і заповнити реальними значеннями
pnpm --filter @kiro/api prisma:migrate
pnpm --filter @kiro/api seed
```

### Запуск застосунків

```bash
pnpm --filter @kiro/api dev      # http://localhost:3100 (Swagger: /docs)
pnpm --filter @kiro/web dev      # http://localhost:3000
pnpm --filter @kiro/mobile dev   # Expo dev server
```

Або все разом: `pnpm dev` (turbo запускає dev-таски всіх апок паралельно).

### Типізований API-клієнт

Після зміни API-контракту (нові ендпоінти/DTO) перегенерувати клієнт, яким
користуються web і mobile (§8 — не дублювати interfaces вручну):

```bash
pnpm --filter @kiro/api-client generate   # API має бути запущений
```

## Структура

```
apps/
  api/       NestJS backend — єдине джерело business logic
  web/       Next.js — public site + /admin
  mobile/    Expo — iOS/Android
packages/
  types/         спільні enum'и, error-коди, pagination (дзеркалить Prisma enum'и)
  schemas/       zod-схеми для client-side валідації форм
  i18n/          uk/en ресурси, спільні для web і mobile
  api-client/    typed fetch-клієнт, згенерований з OpenAPI
  config/        не-секретні константи (ліміти, ranking weights, API prefix)
  tsconfig/      базові tsconfig для nest/next/react-native
  eslint-config/ базові eslint flat configs
infrastructure/
  scripts/   db-tunnel.mjs і подібне
docs/
  spec/      оригінальні ТЗ (.docx)
  brand/     лого/іконка
  VPS_ACCESS.md
```

## Статус

Дивись коміт-історію та `docs/PROGRESS.md` (якщо є) для поточної фази.
Фази реалізації описані в `docs/spec/technical-specification.docx` §115.

## Правила для будь-кого (людини чи агента), хто продовжує цей проєкT

Див. `docs/spec/technical-specification.docx` §116-118: вертикальні
testable-інкременти, ніякого `any` для затикання TypeScript, ніякого
покладання на приховану кнопку в frontend замість backend-перевірки прав,
ніяких хардкод-цін/email, файли — тільки в S3-сумісне сховище, ніколи не в БД.
