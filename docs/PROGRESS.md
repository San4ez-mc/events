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
- [x] `apps/web` заскафолджено (Next.js App Router + Tailwind); реальні
      сторінки з'явилися в Phase 1 (auth + event wizard + public event page)
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

Acceptance: "organizer can create draft and preview an event."

- [x] Prisma: Region/City/District/Category/Event/EventMedia/EventSeries
- [x] Geography: `GET /geography/{regions,cities,cities/:slug,districts}` —
      public, backed by real Ukraine data (27 regions, 29 cities, Kyiv +
      Kharkiv districts seeded)
- [x] Categories: `GET /categories` (tree), `POST /categories`
      (user-created, PENDING, depth-2 enforced server-side) — 15/15 e2e
      tests passing (auth + categories suites)
- [x] Events CRUD: create (minimal draft, title-only per UX §31 step 1),
      incremental PATCH (autosave-friendly — every other field optional),
      GET /events/mine (cursor-paginated organizer list), GET /events/:id
      (owner-only), GET /events/slug/:slug (public if PUBLISHED, owner-only
      preview otherwise — this is what "preview a draft" means for Phase 1
      since there's no dedicated preview endpoint). Slug auto-regenerates
      from title while still DRAFT, frozen once PUBLISHED. §78's
      notifyParticipants confirmation gate implemented (notification
      *sending* itself is Phase 5 — TODO left in code). 25/25 e2e tests
      passing (auth + categories + events).
- [x] MinIO running on the VPS (own Docker container, own buckets —
      docs/VPS_ACCESS.md), StorageService abstraction (section 6) over
      @aws-sdk/client-s3 (works against any S3-compatible endpoint)
- [x] EventMediaModule: upload (multipart), magic-byte MIME validation
      (section 88 — sniffs actual file content via `file-type`, not the
      client-supplied header or extension), sharp-based image processing
      (display max 1600px + thumbnail max 400px, both re-encoded so EXIF is
      stripped, original never destructively cropped per section 23), focal
      point storage, reorder, delete, 10-file cap (section 22). Video upload
      stores the original only — no transcoding/thumbnail-frame-extraction
      yet, that needs a worker process. 32/32 e2e tests passing across all
      four suites (auth, categories, events, event-media).
- [x] Web UI (apps/web): auth pages (login/register/forgot-password),
      i18n (uk/en, cookie-based, server + client), light/dark/system theme
      (useSyncExternalStore, no FOUC), API client wired through a Next.js
      rewrite so the web app and API are same-origin from the browser's
      perspective (needed for the httpOnly refresh cookie — see
      next.config.ts comment), 5-step create-event wizard (basics/media/
      date+place/price/preview) with autosave-per-step, organizer event
      list, and the public/preview event page (SSR + `generateMetadata` +
      JSON-LD for published events per section 62, client-side draft-preview
      fallback for the owner). **Verified end-to-end through the real
      browser** (not just API tests): register → create draft → fill all 5
      wizard steps → public preview page renders correct title/date/
      location/price/category/address with the "not published" banner and
      disabled CTA. This is the literal Phase 1 acceptance criterion,
      confirmed working through the UI, not just the API.
- [ ] Google Places integration (address autocomplete on event create) —
      **blocked on a real `GOOGLE_MAPS_API_KEY`**; address is a plain text
      field for now instead of autocomplete

## Phase 2 — Publication

Acceptance: "user can publish a valid public event using one credit."

- [x] Prisma: `ListingCreditLedger` (§48 — ledger, not a balance column),
      `CreditPackage`, `ModerationCase`
- [x] CreditsModule: `GET /credits/balance`, `GET /credits/ledger`,
      `GET /credits/packages` (public — prices from the DB, §50),
      `POST /credits/claim-free` (§36/§49 — explicit action, idempotent via
      a sourceType+sourceId dedup key)
- [x] SensitiveContentService (§54): keyword scan — hard-reject for illegal
      goods/weapons-sale/explosives/sexual-services, flag-for-review for
      war-related content. Found and fixed a real bug via a failing test:
      JS regex `\b` is ASCII-only (defined via `\w`) even with the `u` flag,
      so it silently never matches next to Cyrillic text — replaced with
      `(?<![\p{L}\p{N}])`/`(?![\p{L}\p{N}])` lookarounds. Unit-tested.
- [x] `POST /events/:id/publish` (§52/§55): validates the §69 minimum
      fields, runs the content scan, then one of REJECT (event → REJECTED,
      no charge) / FLAG (→ PENDING_MODERATION, ModerationCase opened, credit
      *reserved* not consumed) / ALLOW (credit debited + → PUBLISHED,
      atomically in one transaction). Debit uses `pg_advisory_xact_lock`
      keyed per-user so two concurrent publish requests can't both read the
      same balance and both succeed (found via reasoning about the same
      class of race already fixed once in the web auth-refresh flow — see
      "Known technical decisions" below). Idempotent: publishing an
      already-published event again is a no-op, doesn't double-charge (§98).
- [x] Seeded `credit_packages` (§50: 1/199₴, 5/799₴, 10/1499₴) on both
      kiro_dev and kiro_test
- [x] 43/43 e2e tests passing (added credits.e2e-spec.ts,
      publish.e2e-spec.ts on top of the previous 4 suites) — covers missing-
      fields validation, insufficient-credits, successful publish + exact
      debit, publish idempotency, non-owner rejection, hard-reject content,
      and flag-for-review content
- [ ] Admin resolution of PENDING_MODERATION cases (approve → charge +
      publish, reject → no charge) — that's Phase 10's admin queue; a
      flagged event just sits PENDING_MODERATION until then, as intended
- [x] Wired into the web UI: the wizard's "preview" step now shows the
      credit balance, a publish button, and status-aware feedback
      (success/pending-moderation/rejected/insufficient-credits with a
      "claim free credits" action). Verified end-to-end through a real
      browser: register → create event → fill wizard → claim free credits →
      publish → public event page live with an active registration CTA

## Phase 3 — Discovery

tinder-картки, swipe, фільтри, пошук (pg_trgm), pass-history, saves, share.

Acceptance: "user gets a ranked, filterable discovery feed and can search,
pass, save, and have passed events cool down before resurfacing."

- [x] Prisma: `EventInteraction` (§59's `user_event_interactions` —
      append-only log of PASS/OPEN, not a toggle), `SavedEvent` (unique
      per user+event), `UserPreferences.preferred{City,DistrictIds,
      CategoryIds,Format}`/`freeOnly` (UX §7 — filters persist in the
      profile). Re-enabled `postgis`/`pg_trgm` on `kiro_dev` — a `prisma
      migrate reset` earlier this session had silently dropped them along
      with the `public` schema; documented in `docs/VPS_ACCESS.md` so it
      doesn't surprise anyone again.
- [x] `GET /discovery` (§57): cursor-paginated (§57 — no offset pagination),
      filters (cityIds/districtIds/categoryIds/format/freeOnly/maxBudget/
      dateFrom/dateTo), `@Public()` but personalizes when a bearer token is
      present (same optional-auth pattern as the event-slug preview).
      Deterministic rule-based ranking (§58, weights in
      `@kiro/config`'s `DISCOVERY_RANKING_WEIGHTS`) — preferred city/
      district/category (from the profile, not the request's own filters,
      since a hard filter already guarantees 100% match), date proximity,
      freshness. Popularity/availability (§58) are stubbed at 0: they need
      registration counts, which don't exist until Phase 4 — documented,
      not faked.
- [x] `POST /discovery/:id/interactions` (PASS/OPEN, §59), `POST`/`DELETE
      /discovery/:id/save` (idempotent), `GET /discovery/saved` ("Мої →
      Збережені", UX §5), `GET`/`PATCH /discovery/preferences`.
- [x] Pass-cooldown (§59): a PASSed event is excluded from that user's feed
      for `feedPassCooldownDays` (system_settings, default 30) and
      resurfaces automatically after.
- [x] `GET /search` (§56): pg_trgm fuzzy match (`%`/`similarity()`) across
      title/description/category/organizer/city/district, same structured
      filters as discovery, cursor pagination via the same score+id cursor
      technique (factored into `common/utils/scored-cursor.ts`, shared by
      both endpoints). Plain PostgreSQL full-text (tsvector) ranking is not
      implemented — pg_trgm alone is enough for MVP scale; noted as a
      possible future enhancement, not silently dropped.
- [x] 15 new e2e tests (discovery.e2e-spec.ts, search.e2e-spec.ts) — 58/58
      total across 8 suites passing. Covers filters, ranking order,
      pass-cooldown exclusion (per-user, not global), save/unsave
      idempotency, cursor pagination without dupes/gaps, preferences
      persistence, and that drafts never leak through search.
- [x] Web UI: home page (`/`) is now the Tinder-style feed (one card,
      undo/pass/save/open buttons — UX §4's large-icon requirement is met
      without needing a touch-swipe gesture, which is unreliable on desktop
      web anyway), `/search` (plain list, UX §9), `/saved`. Verified
      end-to-end in a real browser: filter by free-only, pass an event, undo
      it back, save/unsave (persists across reload), fuzzy search by title
      and by city name. Nav updated with Discover/Search/Saved links.
- [ ] Advanced filters from UX §7 (date/time buckets, price range slider,
      age, group-size) aren't wired into the filter UI yet — only city/
      category/free-only. The DTOs and backend filtering already accept
      dateFrom/dateTo/maxBudget/format; just no UI control for them yet.
- [ ] Card doesn't show registered-count/attendee-avatars/organizer-rating
      (UX §3) — needs Phase 4 (registrations) and Phase 8 (reviews) data;
      showing zeros would be worse than omitting the section.
- [ ] Share button (UX §11) not wired up in the feed/search UI yet (the
      event page itself already has a stable public URL).
- [ ] Mobile screens — still not started (Expo scaffolded only).

## Phase 4 — Registration

кастомні поля реєстрації, approval, capacity, external payment link, manual
confirm, cancellation, waitlist.

Acceptance: "full attendee ↔ organizer registration flow works."

- [x] Prisma: `RegistrationField` (§25's `event_registration_fields`),
      `Registration` (§26/§27's `event_registrations`, full state machine),
      `RegistrationAnswer` (§28 — one row per field, not one JSON blob, per
      the spec's explicit warning). `Event.cancellationReason` added for §79.
- [x] State machine (§27): initial status is `PENDING` for
      `ORGANIZER_APPROVAL` events, `REGISTERED` otherwise, regardless of
      price — matches UX §13's four flows exactly (free/paid ×
      auto/approval). A paid registration's own separate "Я оплатив" action
      (`PATCH /registrations/:id/mark-paid`) moves `REGISTERED` ->
      `PAYMENT_PENDING`; the organizer's `confirm-payment` action moves it to
      `CONFIRMED`.
- [x] Capacity + waitlist (UX §15/§16): `pg_advisory_xact_lock` per event
      (same technique as the credits ledger) serializes concurrent
      registration attempts so two requests can't both grab the last spot.
      `PENDING` counts toward capacity too (reserves the slot immediately,
      so approving later never needs a second capacity check). Joining the
      waitlist is opt-in (`joinWaitlist: true`) rather than automatic;
      cancelling/rejecting an active registration promotes the
      longest-waiting `WAITLISTED` registrant automatically.
- [x] `POST /events/:id/registrations` (register), `GET .../me` (caller's
      own status for this event), `GET .../registrations` (organizer list),
      `PATCH .../:id/approve`, `PATCH .../:id/reject`,
      `PATCH .../:id/confirm-payment`, `PUT .../registrations/fields`
      (organizer replaces the whole custom-question set in one call).
      `PATCH /registrations/:id/cancel`, `PATCH /registrations/:id/mark-paid`,
      `GET /registrations/mine`.
- [x] `POST /events/:id/cancel` (§79): sets `CANCELLED` + optional reason,
      blocks new registrations. Existing registrations are left as-is —
      actually notifying registrants is a Phase 5 TODO, same pattern as the
      §78 "notifyParticipants" significant-change flag from Phase 1.
- [x] Found and fixed a real bug via e2e: the global `ValidationPipe` runs
      `forbidNonWhitelisted: true`, which 400s any DTO property with zero
      class-validator decorators (not just strips it) — `RegistrationAnswerDto.value`
      (intentionally untyped, since it varies by field type) needed an
      explicit `@IsOptional()` just to be whitelisted at all.
- [x] Found and fixed a second real bug: a NestJS handler returning a bare
      `null` sends an *empty* HTTP body, not the JSON text "null" — so
      `GET .../registrations/me` now returns `{ registration: T | null }`
      instead of the bare value, which is also just better API shape.
- [x] 13 new e2e tests (registrations.e2e-spec.ts) — 71/71 total across 9
      suites passing. Covers all four UX §13 flows, capacity+waitlist+
      promotion, double-registration prevention, cancel-then-reregister,
      custom-field validation, organizer-only list access, and registering
      against an unpublished/cancelled event.
- [x] Web UI: the event page's CTA is no longer permanently disabled — it
      now renders every state (sign-in prompt, apply-with-custom-fields
      form, pending/waitlisted/payment-pending message, pay-now + "I've
      paid" buttons, cancel button). New `/my-registrations` (attendee) and
      `/organizer/events/:id/registrations` (organizer approve/reject/
      confirm-payment) pages. Verified end-to-end in a real browser as two
      separate users: apply with a required custom field → organizer
      approves → attendee sees "registered" + cancel option.
- [ ] Ticket tiers / multiple price options (§24's `event_price_options`)
      stay deferred — not in this phase's acceptance checklist, single
      price only (as already noted on `Event.priceType`).
- [ ] "Мінімум учасників не набраний" organizer warning (UX §15) needs a
      scheduled job + notification delivery — both are Phase 5 territory,
      not built yet.
- [ ] Organizer UI to actually author custom registration fields doesn't
      exist yet (backend `PUT .../registrations/fields` works, exercised via
      e2e and curl, but the event wizard has no step for it) — the
      attendee-facing dynamic form renders whatever fields already exist,
      so this is forward-compatible once that organizer UI lands.
- [ ] Mobile screens — still not started.

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

- [x] `/`, `/login`, `/register`, `/forgot-password`, `/events/[slug]`,
      `/organizer/events*` — [ ] `/search`, `/profile/*`, `/admin/*` (later phases)
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
- **Tech debt**: `EventsController`/`CategoriesController` тощо повертають
  сирі Prisma-об'єкти, а не response DTO-класи, тож Swagger/openapi-typescript
  не бачить форму відповіді (`content?: never` у згенерованій схемі —
  `packages/api-client/src/schema.d.ts`). Web тимчасово дублює форму вручну
  в `apps/web/src/lib/{event-types,geo-types}.ts` з явним TODO-коментарем —
  порушує §8 ("не дублювати вручну interfaces"). Правильне рішення: додати
  `@ApiOkResponse`/`@ApiCreatedResponse` з response DTO-класами на кожен
  ендпоінт. Не зроблено зараз через обсяг (довелось би зробити на ~26
  ендпоінтах одразу) — зробити поступово при наступних дотиках до кожного
  контролера.
- Next.js web-застосунок і API навмисно **same-origin з погляду браузера**
  (rewrite у `next.config.ts`, а не прямий cross-origin fetch) — інакше
  httpOnly refresh-cookie (SameSite=Lax) ненадійно долітає при cross-origin
  fetch/XHR, навіть у dev (localhost:3000 → localhost:3100 — це вже
  cross-origin). Це також збігається з планом продакшн-деплою
  (`kiro.fineko.space/api` на тому ж домені).
- Concurrent refresh-token calls (React StrictMode подвійний виклик ефекту
  в dev, або дві вкладки одночасно) **спалювали всю сесію** через
  reuse-detection (§9) — виправлено single-flight-дедуплікацією в
  `apps/web/src/lib/api-client.ts::refreshAccessToken()`. Актуально і для
  прода (дві вкладки/ретрай можуть так само зіткнутися), не лише для dev.
- Той самий клас "конкурентні запити б'ються об idempotency/лічильник" —
  тепер і на бекенді: `CreditsService.debitForPublication` серіалізує
  публікації одного юзера через `pg_advisory_xact_lock(hashtext(userId))`
  всередині транзакції, щоб два одночасні publish-запити не прочитали
  однаковий баланс і обидва не пройшли перевірку. Технічна деталь:
  `pg_advisory_xact_lock` повертає `void`, тож викликати його треба через
  `$executeRaw`, не `$queryRaw` (останній намагається десеріалізувати
  результат як типізовані рядки й падає на void-колонці).
