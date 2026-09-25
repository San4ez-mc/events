# Spec audit: implemented vs. specification

Audit date: 2026-09-25. Method: every row was checked against code (grep/read) in `apps/api`, `apps/web`, `apps/mobile`, `packages/*`, `infrastructure/`. Nothing here is copied from `docs/PROGRESS.md`, which is partly stale (e.g. it still says Google Places is blocked and mobile has no screens). Tests were not executed for this audit; "tested" means an e2e spec exists.

Legend: **D** = DONE, **P** = PARTIAL, **M** = MISSING, **X** = N/A-external (needs credentials/accounts, code exists or is not our blocker), **-** = not applicable to that surface.
Sources: TS = `technical-specification` (§1..§119), UX = `product-ux` (§1..§50).
Paths are relative to the repo root; `api` = `apps/api/src`.

## Headline verification of the "known facts"

| Claim | Verdict |
|---|---|
| Reminders/jobs in `event-lifecycle.scheduler.ts` | TRUE but PARTIAL: `@nestjs/schedule` cron every 10 min inside the API process (24h + 1h reminders, auto-COMPLETED, min-participants warning, review-request). It is NOT pg-boss and there is no separate worker; `/health/ready` has a `TODO` for worker heartbeat. UX asks "2 hours" reminder, TS says 1 hour; 1h implemented. |
| Chat | DONE (API `chat/`, web `components/event-chat.tsx`, mobile `EventChat.tsx`). Access removed after cancel, tested in `test/spec-gaps.e2e-spec.ts`. |
| Analytics funnel | DONE for API + web (`analytics/`, `lib/analytics.ts`, `organizer/events/[id]/stats`). Mobile only sends events (`src/lib/analytics.ts`), no organizer stats screen. |
| Places autocomplete | DONE (`api/places/`, Places API New, needs `GOOGLE_MAPS_API_KEY` = X). Web `address-autocomplete.tsx`, mobile `AddressAutocomplete.tsx`. Returns 503 `PLACES_UNAVAILABLE` without key. |
| Filters (UX §7) | PARTIAL: city, district, category, date range, time-of-day hours, min/max price, free, format, 18+, group size all in `DiscoveryQueryDto`. Missing: `availableOnly` (TS §57); "Вік" only has all/18+; filters saved to profile only partially (city/districts/categories/format/freeOnly, not date/time/price range/size). |
| Address gating | DONE server-side (`events.service.ts` `findBySlugForPreview`/`canSeeExactLocation`): address, coords, placeId, onlineUrl nulled for non-registered. Gap: collaborators (managers) are not treated as allowed. Web shows lock state; mobile shows only a maps link if data returned. |
| Participants opt-in | DONE (`Registration.showAsParticipant`, default false, public list only opted-in). Web widget + API; mobile has no toggle in registration (only API default false). |
| Google login | DONE API (`POST /auth/google`, `google-token.verifier.ts`) + web + mobile button. Needs real client IDs in env (X). Apple sign-in MISSING (X: Apple developer account). |
| Web profile page `/profile` | DONE: avatar upload, birthDate, locale, notification toggles, privacy toggles (`app/profile/page.tsx`). MISSING there: social links editing, phone verification, "show to friends only". |
| sitemap.ts / robots.ts | DONE (new, untracked in git). Sitemap reads `/api/v1/discovery` (max 500 events, hourly). Robots blocks private app areas. Not yet committed. |

---

## A. Technical specification (TS §1..§119)

### A1. Architecture, stack, infra (§1-9, §105-110)

| § | Topic | API | Web | Mobile | Evidence / what is missing |
|---|---|---|---|---|---|
| 1 | Goal: iOS+Android+web+admin, one API | D | D | P | Android APK profile in `apps/mobile/eas.json`; iOS build needs Apple account (X). |
| 2 | Monorepo, pnpm, Turborepo, package layout | D | D | D | `packages/{api-client,config,eslint-config,i18n,schemas,tsconfig,types}` present. `infrastructure/docker` and `infrastructure/nginx` are empty dirs (deploy uses pm2 + `infrastructure/deploy/nginx-kiro.conf`). |
| 3 | Stack NestJS/Prisma/Next/Expo Router | D | D | D | |
| 4 | Existing PostgreSQL, no Supabase | D | - | - | `prisma/schema.prisma` |
| 5 | `postgis`, `pg_trgm` | P | - | - | Enabled by hand on VPS (`docs/DEPLOY.md` step). NOT in any migration, so a fresh DB fails search. PostGIS is not actually used (lat/lng are `Decimal`). No trigram/GIN indexes. |
| 6 | S3/MinIO via `StorageService` | D | - | - | `api/storage/storage.service.ts`, MinIO on VPS. |
| 7 | Background jobs on PG queue (pg-boss) | P | - | - | Replaced by `@nestjs/schedule` cron in-process (see headline). No retry queue, no separate worker, no media-processing jobs. |
| 8 | REST `/api/v1`, OpenAPI, generated typed client for web+mobile | P | P | P | OpenAPI + `packages/api-client` exist. Web uses raw `fetch` in 97 places vs 10 typed-client calls; mobile uses raw `fetch` everywhere (`app/**`, `src/**`). Spec says do not duplicate interfaces by hand: `apps/*/src/lib/*-types.ts` do exactly that. |
| 9 | Email auth: register, password, verify email, reset; access JWT; refresh rotation (cookie web / SecureStore mobile) | D | D | D | `auth/*`, refresh reuse-detection tested in `test/auth.e2e-spec.ts`. Real emails need SMTP (X): `mail.service.ts` only logs without `SMTP_*`. Apple / phone OTP: not present (architecture allows). |
| 105 | Docker services api/web/minio/worker, Nginx/Caddy, HTTPS | P | - | - | Deployed with pm2 + nginx + certbot (`infrastructure/deploy/*`, `docs/DEPLOY.md`), no Docker, no worker service. HTTPS via certbot documented. |
| 106 | dev/staging/prod separation | P | - | - | `kiro_dev`/`kiro_test`/`kiro` DBs and buckets exist; no staging environment defined. |
| 107 | Env vars | D | D | D | `api/config/env.validation.ts` validates all listed ones. Hardcoded Google OAuth client ID fallback in `apps/web/next.config.ts` and `apps/mobile/eas.json` (public IDs, not secrets). Payment keys default to dev placeholders. |
| 108 | Backups + restore doc | D | - | - | `infrastructure/deploy/backup.sh` (14-day pg_dump + MinIO mirror), restore in `docs/DEPLOY.md`. Cron installation on VPS not verifiable from repo. No backup monitoring. |
| 109 | `/health`, `/health/ready` | P | - | - | `health.controller.ts` checks DB + storage; worker check is a `TODO`. |
| 110 | Monitoring, Sentry-ready | M | M | M | No Sentry/hook, no server/disk monitoring; only pino logs. |

### A2. Data model (§10-55)

| § | Topic | Status | Evidence / gaps |
|---|---|---|---|
| 10 | Roles enum, backend-only checks | D | `UserRole`, `RolesGuard`, `@Roles`. |
| 11 | User entity | D | `schema.prisma` User. No DB check "name or nickname required" (§11 constraint), only DTO-level. |
| 12 | `user_social_links` | P | Table exists and is returned/hidden on public profile, but no endpoint or UI to create/edit links (`UpdateProfileDto` has no `socialLinks`). |
| 13 | `user_preferences` + preferred categories/cities/districts | P | Single-row `UserPreferences` with array columns (`preferredDistrictIds[]` etc.) instead of the 3 many-to-many tables; `preferredCityId` single. Flags `allowEmail`, `allowFriendActivityNotifications`, `allowSubscriptionNotifications` are stored but never read by any sender (only `allowPush` and `allowEventReminderNotifications` are). |
| 14 | regions, cities | D | Migration `geography_categories_events`, `prisma/geo-data/ukraine.json`. |
| 15 | districts (status/source/merge) | P | Model D. Users cannot create districts (`GeographyController` has GET only); only merge exists. `USER_CREATED`/`PENDING` never produced. |
| 16 | categories (tree depth 2, status, merge) | P | Model + `POST /categories` (creates PENDING). No approve/rename/reparent/hide/delete endpoint, and events accept only ACTIVE categories, so user-created categories stay unusable. |
| 17-21 | Event model, statuses, visibility, format, approval | D | `Event` model. `FAQ`, `price options` see below. Hybrid not built (as specified). |
| 22 | event_media, 10-file cap | D | `event-media.service.ts`; per-file `moderationStatus` always APPROVED (no media moderation, `MEDIA_AUTO_MODERATION` flag absent). |
| 23 | Image processing (validate, strip EXIF, resize, thumb, keep original, focal) | P | sharp: display 1600 + thumb 400, magic-byte MIME, focal point endpoint. No separate feed/card derivative; video stored raw (no thumbnail, no duration/size probe). |
| 24 | `event_price_options` (multiple tickets) | M | No table (`schema.prisma` comment says deferred). Only single `price` + `paymentUrl`. |
| 25 | Custom registration fields (9 types) | D | `RegistrationField`, `PUT /events/:id/registrations/fields`, web/mobile render `registration-field-input`. **No organizer UI on web or mobile to define fields** (API only). |
| 26-27 | Registrations, statuses/flows | D | `registrations.service.ts` (+WAITLISTED extra status), unique(event,user), tested. |
| 28 | Registration answers (per-field rows) | D | `RegistrationAnswer`. |
| 29 | Recurring series (occurrences as real events) | P | `POST /events/:id/series`, `recurrence.ts`, 7 recurrence types. No edit of "whole series" / single-occurrence, no end-date UI on mobile. Web `series/page.tsx` only. |
| 30 | Collaborators (OWNER/MANAGER + scoped permissions) | D | API + web `collaborators/page.tsx`. `SEND_NOTIFICATIONS`, `MANAGE_PAYMENTS` permissions exist but no endpoint checks them (payments use MANAGE_REGISTRATIONS). |
| 31 | `event_faq_items` | M | No table, endpoint or UI anywhere. |
| 32 | Saves | D | `SavedEvent`, `/discovery/:id/save`. |
| 33 | Subscriptions (EVENT + ORGANIZER_CATEGORY auto) | D | `subscriptions.service.ts`. See §42 for the missing "new event" delivery. |
| 34 | Friendships | D | `friends.service.ts`. |
| 35 | Blocks | P | Block/unblock API + profile hiding. Blocked users' events are not hidden from discovery. |
| 36 | Private notes | D | `notes/`, never exposed to target. |
| 37 | Reviews (eligibility, unique, 1..5) | D | `reviews.service.ts`; window from `REVIEW_WINDOW_DAYS`. |
| 38 | Organizer rating (computed) | D | Live aggregate, no cache table (allowed). |
| 39 | Reports (EVENT/USER/REVIEW) | D | `reports/`. UX also wants photo/comment targets: not present. |
| 40 | Notifications + deliveries (IN_APP, PUSH) | D | `notifications.service.ts`; EMAIL enum exists, no email sender. |
| 41 | Expo push, tokens deactivated on failure | D | `expo-push.service.ts` handles `DeviceNotRegistered`. Needs Expo/FCM/APNs credentials at build time (X). |
| 45-47 | Analytics events, daily stats, dashboard | D | `analytics/`, `EventDailyStat`, `GET /events/:id/stats` with funnel + sources. |
| 48-49 | Credit ledger, +5 free idempotent | D | `credits.service.ts` `claimFreeCredits`, `credits.e2e-spec.ts`. |
| 50 | Packages seeded (199/799/1499) | D | `prisma/seed.ts`; prices served by `GET /credits/packages`. |
| 51 | Platform payments + adapters | P | `payments/providers`: WayForPay, Mono, manual IBAN; webhooks + confirm-manual; tested. Real merchant credentials = X; env defaults are dev placeholders. |
| 52 | Publication transaction, idempotency | P | Single tx debit+publish, re-publish of PUBLISHED is a no-op. No `Idempotency-Key` header support and no row lock on balance (concurrent publishes rely on tx only). |
| 53-55 | Moderation cases, sensitive keywords, no credit until approved | D | `sensitive-content.service.ts` (reject vs flag), `approveModeration` debits credit on approval. Media is not scanned. |

### A3. Discovery, search, location (§56-63)

| § | Topic | API | Web | Mobile | Evidence / gaps |
|---|---|---|---|---|---|
| 56 | Search: FTS + pg_trgm over title/description/category/organizer/city/district | P | D | D | `search.service.ts` uses trigram `%`/`ILIKE` only, no `to_tsvector` FTS; no indexes. Does not apply 18+ minor filter (discovery does). |
| 57 | `/discovery` params, cursor paging | P | D | D | Missing `availableOnly`; has extras (min budget, hours, capacity, adults). Scored cursor implemented. |
| 58 | Deterministic ranking | P | - | - | Preferred city/district/category, date proximity, freshness. Weights in `@kiro/config`. Popularity and availability contribute 0 (code comment says so); no friends-going or budget signal. |
| 59 | PASS/OPEN interactions, 30-day cooldown | D | D | D | `discovery.service.ts`, setting `FEED_PASS_COOLDOWN_DAYS`. |
| 60 | Google Places, store id/address/lat/lng, no re-query | D | D | D | Places API (New) + in-memory cache. Needs key (X). Map on details is an iframe (`maps?output=embed`, no API key, no marker customization) on web; mobile has only a "route" link. |
| 61 | Deep links / universal links | P | M | M | Routes `/events/:slug`, `/users/:id` exist on web. `/users/:slug` (slug) not supported (id only). No `apple-app-site-association`, no `assetlinks.json`, no `associatedDomains`/`intentFilters` in `apps/mobile/app.json` (custom scheme only). Needs Apple/Play accounts for verification (X) but the config files are our work. |
| 62 | SEO metadata, JSON-LD, private noindex | - | D | - | `app/events/[slug]/page.tsx` (`generateMetadata`, canonical, OG, Event JSON-LD, noindex for non-PUBLIC). `sitemap.ts` + `robots.ts` new. |
| 63 | Public browsing without auth | D | D | D | Mobile `login` is a modal screen (`app/_layout.tsx`), feed is reachable anonymously. |

### A4. UI flows (§64-71)

| § | Topic | Web | Mobile | Evidence / gaps |
|---|---|---|---|---|
| 64 | Tabs Discover/Search/My Events/Notifications/Profile | D (bottom-nav, header) | P | Mobile tabs: Discover, Search, **Create**, Notifications, Profile; "My events" is a stack screen from Profile (`app/my-events.tsx`). Matches UX §47, deviates from TS §64. |
| 65 | Discover swipe/tap, actions | D | D | `discover-feed.tsx`, `SwipeCard.tsx` (pass/save/open/share/filter/undo). No auto-register. |
| 66 | Card image cover + focal | D | P | Mobile does not apply focal point (`grep focal` only in types). |
| 67 | Event page order + sticky CTA | P | P | Web: no Save, Share or Report button on event page (only Follow); no FAQ; sticky CTA not present. Mobile: no Save/Subscribe/Report/reviews/participants list on event screen (only Share). |
| 68 | Create flow steps + autosave + "Додатково" | P | P | Web 5-step wizard with per-step autosave. No "Додатково" advanced section: web has no UI for visibility (public/link-only), deadline, age restriction, rules, paymentUrl, registration fields, ticket tiers. Mobile `CreateEventFlow.tsx` similar and smaller. |
| 69 | Draft validation on publish | D | D | `assertPublishable` in `events.service.ts`. |
| 70 | Duplicate `POST /events/:id/duplicate` | D | P | Web button in organizer list; mobile none. Does not copy FAQ (none exist) or price options (none). |
| 71 | Invitations of previous participants | D | M | `invitations/`, web `organizer/events/[id]/invite`, `/invitations`. Uses `ORGANIZER_NEW_EVENT` notification. |

### A5. Admin and business rules (§72-83)

| § | Topic | API | Web | Mobile | Evidence / gaps |
|---|---|---|---|---|---|
| 72 | Admin routes | P | P | M | Present: `/admin`, events(+id), users(+id), categories, districts, moderation, reports, payments, credits, audit. **Missing: `/admin/reviews`, `/admin/analytics`** (analytics API `admin/analytics` exists, shown only on dashboard). No admin in mobile. |
| 73 | Permissions SUPER_ADMIN/ADMIN/MODERATOR | D | D | - | `@Roles(...)` per controller; moderation+reports open to MODERATOR. |
| 74 | Admin event edit + audit for every admin mutation | P | P | - | `PATCH /admin/events/:id`, cancel, moderation approve/reject exist but **are not written to `audit_logs`** (audit used only in categories, geography, credits, reports, users). |
| 75 | Audit log model + viewer | D | D | - | `AuditLog`, `admin/audit`. `ip` capture not verified. |
| 76 | Category merge | D | D | - | `POST /admin/categories/:id/merge`, tested in `admin.e2e-spec.ts`; notifies owners. |
| 77 | District merge | D | D | - | `POST /admin/districts/:id/merge`. |
| 78 | Confirm before changing date/address/URL (`notifyParticipants`) | D | M | - | API enforced. Web edit page has no field/flag for it. |
| 79 | Cancel event | D | D | P | Mobile can call cancel from `[slug].tsx`. |
| 80 | Completion job | D | - | - | Scheduler; each run every 10 min. |
| 81 | Review eligibility | D | D | M | Backend-checked. Mobile has no review UI. |
| 82 | Profile sharing + privacy hide phone/social/attendance | P | P | M | Public profile hides phone always, social links, upcoming/past events; `hideAttendanceHistory` flag stored but no attendance history exists to hide. No profile share/QR button on web profile; mobile has no public profile screen. |
| 83 | Participant visibility conservative default | D | D | P | see headline. Mobile cannot toggle opt-in. |

### A6. Cross-cutting (§84-104)

| § | Topic | Status | Evidence / gaps |
|---|---|---|---|
| 84 | i18n uk/en, no hardcoded text | P | `packages/i18n` (uk/en `common.json`, ~620 lines each). Web still has 30 inline `locale === "uk" ? ... : ...` strings (18 files) and hardcoded UK strings in mail/notification bodies (`api/notifications`, `event-lifecycle.scheduler.ts` are English only; `mail.service.ts` Ukrainian only). Notification titles/bodies are not localized per user locale. |
| 85 | DTO validation, authz, ownership | D | Global `ValidationPipe({whitelist:true})`, guards, `EventAccessService`. |
| 86 | Security list | P | Argon2id D; refresh rotation D; helmet D; CORS strict D; RBAC D. CSRF: only `SameSite=lax` cookie, no token. No input sanitization layer (HTML in descriptions is rendered as text by React, so acceptable). |
| 87 | Rate limits per endpoint | P | Global 120/min (`ThrottlerModule`). Dedicated limits only on chat, places, analytics. **No stricter limits on login, register, password reset, friend requests, event creation, reports, search, media upload** despite the comment in `app.module.ts`. |
| 88 | Media limits configurable | D | `DEFAULT_MEDIA_LIMITS` (`@kiro/config`), magic-byte check. |
| 89 | Error contract | D | `api-exception.filter.ts`; codes in `@kiro/types/errors.ts`. `EVENT_REQUIRES_MODERATION`, `PAYMENT_REQUIRED` are defined but never thrown. |
| 90 | Structured logs | D | nestjs-pino; redaction not verified. |
| 91 | X-Request-ID | D | `common/middleware/request-id.middleware.ts`. |
| 92 | Prisma migrations | D | 16 migrations. |
| 93 | Seed (admin from env, categories, geography, packages, settings) | D | `prisma/seed.ts` (+`seed-demo.ts`). Districts only for Kyiv and Kharkiv. |
| 94 | Geo importer | D | `prisma/import-ukraine-geo.ts` (27 regions, 29 cities). Only ~29 cities, not "all Ukraine" settlements. |
| 95 | `system_settings` | D | Keys: free credits, review window, pass cooldown, reminder hours. |
| 96 | Feature flags | M | No flags table/helper; `SOCIAL_LOGIN_DISABLED` is just a missing-config error. |
| 97 | Backend tests | P | 23 e2e specs (165 `it`) + 3 unit specs. Covered: register/login/refresh, publish, credits, registration, capacity, approval, paid confirm, save, subscribe, friends, reviews, category merge, cancel. Not run in this audit; CI runs them. No test for category merge notifications or web/mobile code. |
| 98 | Idempotency tests | P | Present for free credit, publish, payments; registration and payment-confirmation duplicates only partly (`registrations.e2e-spec.ts` covers ALREADY_REGISTERED). |
| 99 | Playwright E2E | M | CI step is `echo "placeholder"` (`.github/workflows/ci.yml`); no Playwright dependency. |
| 100 | Mobile tests | M | No unit/component tests in `apps/mobile`. |
| 101 | Responsive web / admin at 390px | P | Tailwind responsive; admin nav is horizontally scrollable. Admin tables/pages not verified at 390px. |
| 102 | Accessibility | P | Some `aria-*` (icons hidden), labels on fields; no audit, no keyboard test for swipe deck alternatives beyond buttons. |
| 103 | Loading/empty/error states | P | Present on main lists; not audited screen-by-screen, mobile screens mostly minimal. |
| 104 | Optimistic UI | P | Save/notification read: partly; unsubscribe not verified. |

### A7. Remaining TS sections

| § | Topic | Status | Evidence |
|---|---|---|---|
| 42 | Notification jobs (13 types) | P | Sent: registration created/approved/rejected, payment pending/confirmed, event changed/cancelled, 24h + 1h reminder, min-participants, friend request/accepted, waitlist spot, review request, category/district merged. **Never sent: `subscription.newEvent` (subscribers get nothing when organizer publishes; `ORGANIZER_NEW_EVENT` is used only for invitations), `friend.eventRegistered` (`FRIEND_EVENT_REGISTERED` never created).** |
| 43 | Default reminders + global off | D | Uses `allowEventReminderNotifications`. |
| 44 | Change notifications | D | `events.service.ts` `notifyActiveRegistrants`. |
| 111 | Privacy of phone/email/answers | D | Public profile/participant selects only id/name/avatar; answers only via registrations list (organizer). |
| 112 | Paid disclaimer | D | Shown on web `event-page.tsx` and mobile `app/event/[slug].tsx` (`events.page.paidDisclaimer`). |
| 113 | Module list | P | Present: Auth, Users, Geography, Categories, Events, EventMedia, Registrations, Reviews, Discovery, Search, Friends, Subscriptions, Notifications, Organizer, Analytics, Credits, Payments (named `payments`), Reports, Moderation, Admin, Audit, Storage. **No `ProfilesModule` (merged into Users), no `JobsModule`.** |
| 114 | No microservices | D | Modular monolith. |
| 115 | Phases 0-10 | see below | |
| 116-118 | Agent rules, DoD | P | Lint/typecheck/build in CI. "API documentation updated" and "tests pass" not verified; UA+EN localization partial. |
| 119 | MVP criteria | see below | |

Phase acceptance (§115): 0 D (all three apps talk to one API), 1 D, 2 D, 3 D, 4 D (organizer cannot configure fields/payment link in UI = P), 5 P (reminders done; push needs credentials X; subscription/friend notifications missing), 6 P (profiles/friends/subscriptions/notes; mobile mostly M), 7 P (dashboard, co-organizers, invites, recurring, duplicate on web; no FAQ/tiers), 8 D (API+web; mobile M), 9 D minus real merchants (X), 10 P (see §72/§74).

MVP checklist (§119): attendee flows are D on web; on mobile missing: subscribe, friend add, review, interests config/onboarding. Organizer: missing "add price options", "add custom fields" UI, recurring on mobile, co-organizers on mobile. Admin: web only; missing "block content" (hide event/media action), category approve/rename/hide, reviews moderation page. Platform: "deep links" missing (M), "support UA/EN" partial.

---

## B. Product / UX specification (UX §1..§50)

| § | Topic | API | Web | Mobile | Evidence / gaps |
|---|---|---|---|---|---|
| 1 | Concept | - | - | - | n/a |
| 2 | Single User, organizer capabilities | D | D | D | `organizerActivatedAt`. |
| 3 | Card contents (photo, title, date, time, district, category, price, n/max, avatars, friends, organizer rating, description) | D | D | D | `social-proof.service.ts` `attachments`; `event-card.tsx`, `SwipeCard.tsx`. Portrait 3:4 not 9:16; vertical preview + focal: web D, mobile P. |
| 4 | Swipe left/right/tap, big buttons incl. back | - | D | D | See TS §65. |
| 5 | Save + first-use hint | D | P | P | Save D; "Збережіть подію..." hint not found in either app. Saved list: web `/saved` D, mobile My events D. |
| 6 | Undo | - | D | D | `discover-feed.tsx`, `index.tsx` (client-side). |
| 7 | Filters | P | P | P | See headline. Web `discover-filters.tsx`, mobile `FiltersSheet.tsx`. Time-of-day and price slider present; "гарантована збереження в профілі" partial. |
| 8 | Ranking factors | P | - | - | See TS §58 (no behaviour, popularity, budget, friend signals). |
| 9 | Search section | D | D | D | Fields covered via trigram; results are not filterable ("Результати можна додатково фільтрувати" M). No maps (as required). |
| 10 | Event page: gallery, description, categories, organizer, location gating, social links, FAQ, rules, participants, CTAs (save/subscribe/share/report) | P | P | P | Web: gallery, organizer, rules, participants, location gating, follow. Missing on web: save/share/report buttons, FAQ, organizer social links display on event page, organizer "view profile" verified only via link. Mobile: no participants, no subscribe/save/report, no map (route link only), rules shown. Multiple categories per event: single `categoryId` only (M). |
| 11 | Share public URL | D | P | D | Web has no share button on event page (URL works). Mobile `Share.share`. |
| 12 | Google Maps | D | P | P | See TS §60. |
| 13 | 4 registration scenarios | D | D | D | Web `registration-widget.tsx` incl. "Я оплатив"; mobile `[slug].tsx` mark-paid. Payment instruction text after approval: only `paymentUrl`. |
| 14 | Registration fields (required name/phone/email; profile phone autofill; custom fields) | P | P | P | Custom fields render on both clients. Built-in "required name/phone/email" configuration and profile-phone autofill not found. Organizer cannot author fields in any UI (API only). |
| 15 | Min/max participants, organizer warned, no auto-cancel | D | D | D | Scheduler `warnUnderSubscribedEvents`; min/max in web `step-price.tsx` and mobile `CreateEventFlow.tsx`. |
| 16 | Waitlist + promotion notice | D | D | D | `WAITLISTED`, `promoteFromWaitlist`, `WAITLIST_SPOT_OPENED`. |
| 17 | Cancel participation, refund is out of scope | D | D | D | `PATCH /registrations/:id/cancel`. |
| 18 | Recurring events | P | P | M | See TS §29; edit-instance vs edit-series missing. |
| 19 | Copy event (incl. organizers, recurrence settings) | P | D | M | Collaborators and recurrence are not copied. |
| 20 | Prices: single, tiers, free, donation | P | P | P | Only single price / free. Tiers (M), donation/arbitrary amount (M). |
| 21 | Payment link + type + click count + time | P | P | P | `paymentUrl` stored, `paymentClickedAt` on "mark paid"; payment *type* field and `PAYMENT_LINK_CLICK` recorded via analytics; no UI to set `paymentUrl` in web wizard (grep: only rendered, never edited). |
| 22 | User profile (photo, name, username, city, age if allowed, verified phone, socials, bio, upcoming, friends, created events; share/add friend/edit) | P | P | P | No `username`, no city on profile, no phone verification (OTP), age display toggle missing, socials not editable. |
| 23 | Privacy toggles | P | P | M | Hide social/upcoming/attendance and per-event opt-in exist. "Show to friends only" and "hide age" missing. |
| 24 | Friends (from profile, after event, QR/link) | P | P | M | Requests from profile D; QR/link and post-registration prompt M; "N твої друзі йдуть" D. |
| 25 | Subscriptions per organizer+category | D | D | M | `follow-button.tsx`, `subscriptions/`. Delivery M (see TS §42). |
| 26 | Saved list | D | D | D | |
| 27 | My events sections (Upcoming/Pending/Saved/Past) | D | P | D | Web: `/my-registrations` + `/saved` (no combined page). Mobile `my-events.tsx`. Address/map/chat per event on mobile via event screen. |
| 28 | Event chat | D | D | D | |
| 29 | Reviews + private note | D | P | M | `reviews-section.tsx`; notes API D; no note UI found in web or mobile. |
| 30 | Organizer profile (rating, reviews count, events count, upcoming/past, categories) | P | P | M | Upcoming + past + rating + follow D on web `/users/[id]`; "categories he works in" not shown. |
| 31 | Create flow | P | P | P | Steps exist; title-first, wizard order differs slightly from UX (media before category). Places autocomplete D. |
| 32 | Advanced settings (approval, public/link-only, deadline, min, fields, tiers, FAQ, rules, socials, recurring, co-organizers, invites, notification settings) | P | M/P | M | Most exist only as API; web has recurring/co-organizers/invites pages; approval in price step. See §68 gap list. |
| 33 | Co-organizer permission scopes | D | D | M | 7 scopes in `CollaboratorPermission`; two never enforced (`SEND_NOTIFICATIONS`, `MANAGE_PAYMENTS`). |
| 34 | Previous participants + campaign | D | D | M | `invitations/`; no bulk "campaign" send, individual invites. |
| 35 | Organizer statistics incl. sources, confirmed payments | D | D | M | `GET /events/:id/stats`, `stats/page.tsx`. "Confirmed payments" count present as `confirmed`. |
| 36 | Monetization: claim 5, packages, credit at publish, admin refund, recurring per occurrence | D | D | P | `POST /credits/claim-free`, `/credits/packages`, `payments/orders`, `admin/credits/adjust`. Mobile: claim-free + balance only; no package purchase (X for real payments). Web `credits/page.tsx`. |
| 37 | Geography (country>region>city>official district>community district; user-created; approve/rename/merge) | P | P | P | Region/city/district data + merge D. User-created districts (create/approve/rename) M. Coverage 29 cities, districts for 2 cities. |
| 38 | Categories (18 base + sport subcats, user-created, admin actions) | P | P | P | Seeded from `prisma/seed-data/categories.json`. Admin rename/reparent/hide/delete/approve M. |
| 39 | Visibility + approval independent | D | P | P | API D. Web/mobile UI for link-only (visibility) M. |
| 40 | Admin: dashboard, users, events, categories, locations, reports, payments, credits, notifications, moderation; web+mobile+responsive | P | P | M | `/admin/*` pages; **manual notifications/broadcasts M**, mobile admin M, dashboard lacks revenue-by-period/new events (has totalUsers, registrations, revenue, funnel). |
| 41 | Moderation: reports for event/user/organizer/photo/comment; auto-ban; 18+ handling; war->manual | P | P | M | Report targets EVENT/USER/REVIEW only (no photo/comment/chat message). Keyword reject/flag D. 18+: feed hides from minors D; search and direct URL/registration do NOT enforce 18+; no age gate prompt when birthDate is unset. |
| 42 | Push events list | P | - | P | See TS §42; "payment pending/confirmed" D; "new organizer event" M; "friend goes" M; 2h reminder differs (1h). Push token registration on mobile: `src/lib/push-notifications.ts` D (needs credentials X). Email optional: M. |
| 43 | Threads support (public URLs, SEO, OG, IDs, API for new events) | D | D | - | Public `GET /api/v1/discovery` (cursor) usable by Fineko Flows; no dedicated "new events since" endpoint or webhook. |
| 44 | SEO incl. sitemap, Event structured data, image metadata | - | D | - | `sitemap.ts`, `robots.ts`, JSON-LD in `app/events/[slug]/page.tsx`. |
| 45 | UA/EN | P | P | P | See TS §84. Notifications from server are English-only. |
| 46 | Dark mode light/dark/system | - | D | P | Web `theme-context.tsx` + header toggle. Mobile follows system (`userInterfaceStyle: automatic`), no manual toggle. |
| 47 | Bottom menu: Events, Search, Create, Notifications, Profile (+admin) | - | P | D | Web `bottom-nav.tsx`; admin entry not verified in mobile (M). |
| 48 | Design principle | - | P | P | Subjective; advanced-settings pattern not built. |
| 49 | MVP list | see above | | | Missing vs list: onboarding (grep found none on web or mobile), multiple categories per event, waitlist D, event chat D, tiers, FAQ, admin notifications. |
| 50 | Not in MVP | D | D | D | None of the excluded items were built (no DMs, QR check-in, maps search, promo codes). Threads automation excluded (correct). |

---

## C. Remaining work (prioritized, most user-visible first)

| # | Item | Size |
|---|---|---|
| 1 | Organizer UI on web + mobile for advanced settings: visibility (link-only), registration deadline, age restriction (18+), rules, `paymentUrl`/payment instructions, registration-field builder, `notifyParticipants` confirm on edit. API already exists. | L |
| 2 | Event page actions on web and mobile: Save, Share, Report, Subscribe, plus sticky "Записатися" CTA; mobile also participants list, reviews, map. | M |
| 3 | Send `subscription.newEvent` notification on publish/approval and `friend.eventRegistered` on registration (honour `allowSubscriptionNotifications` / `allowFriendActivityNotifications`). | M |
| 4 | Deep links: `.well-known/apple-app-site-association` + `assetlinks.json`, `associatedDomains`/`intentFilters` in `app.json`, handle `/events/:slug` and `/users/:id` in Expo Router (store verification needs Apple/Play accounts). | M |
| 5 | Auth/abuse rate limits (login, register, password reset, friend requests, event create, reports, search, uploads) with stricter anonymous tiers. | S |
| 6 | Audit-log every admin mutation (admin event edit/cancel, moderation approve/reject, user role/status incl. IP) per §74. | S |
| 7 | Category admin: approve PENDING (currently user-created categories are unusable), rename, reparent, hide, delete; user-created districts + approval. | M |
| 8 | Mobile parity screens: public user/organizer profile, friends (requests, add), subscribe with category picker, write review, organizer stats, credits purchase, edit event, manage registrations (approve/reject/confirm payment). | L |
| 9 | Server-side i18n: localize notification titles/bodies and emails per `user.locale`; move remaining inline `locale === "uk"` strings on web into `@kiro/i18n`. | M |
| 10 | Real email delivery (SMTP config, verification/reset/optional notification emails, EMAIL channel + `allowEmail`). SMTP account is X. | M |
| 11 | Enforce 18+ everywhere: search, direct URL, registration (block minors, prompt for birthDate), plus adult badge in cards. | S |
| 12 | Event FAQ (`event_faq_items` table, API, editor, public display). | M |
| 13 | Multiple ticket types (`event_price_options`), donation amount, per-tier capacity and selection at registration. | L |
| 14 | Onboarding + interests (city, categories, districts, budget) on web and mobile; persist full filter set to profile. | M |
| 15 | Playwright E2E (anonymous browse, register/login, create, publish, register, approve, admin edit) and replace the CI placeholder; add mobile component tests. | L |
| 16 | Move jobs to a PG queue (pg-boss) with separate worker, retries, worker heartbeat in `/health/ready`; add 2h reminder or align spec. | M |
| 17 | Admin gaps: `/admin/reviews`, `/admin/analytics` pages, manual notifications/broadcast, hide/block content action, 390px layout verification, mobile admin entry. | M |
| 18 | Profile completeness: social links editor (API + UI), username/slug routing (`/users/:slug`), phone + OTP verification, hide-age and friends-only privacy, profile share/QR link. | M |
| 19 | Series management: edit single occurrence vs whole series, end date, mobile support. | M |
| 20 | Search: real full-text (`tsvector` + GIN and trigram indexes), filters on results, 18+ handling. Add extensions to a migration or bootstrap script so a fresh DB works. | M |
| 21 | Ranking upgrade: popularity, availability, budget fit, friends-going signal, blocked-user exclusion; add `availableOnly` filter. | S |
| 22 | Media pipeline: feed/card derivative, video thumbnail/duration, media report/moderation, `MEDIA_AUTO_MODERATION` flag; apply focal point in mobile cards. | M |
| 23 | Feature flags + monitoring: `system_settings`-backed flags (EMAIL_NOTIFICATIONS, SOCIAL_LOGIN, ...), Sentry hooks in API/web/mobile, disk/backup monitoring. | M |
| 24 | Replace hand-written `*-types.ts` and raw `fetch` in web/mobile with the generated `@kiro/api-client`. | L |
| 25 | External-account items (not code): Apple Sign-In and iOS build/TestFlight, Play Store listing, Expo push credentials, Google Maps key, WayForPay/Mono merchant credentials, SMTP provider, Sentry project. | S (each) |

## D. Status update after the audit (25.09.2026)

Implemented since the table above was written (code in `main`; not yet deployed because the VPS was unreachable):

| Remaining-work item | State |
|---|---|
| #1 organizer advanced settings | DONE on web (wizard step "Додатково": visibility, deadline, 18+, rules, payment link, custom questions); mobile: visibility, 18+, rules, payment link (no deadline / question builder yet) |
| #2 event actions | DONE web + mobile (Save, Share, Report, Follow; mobile also reviews). Sticky CTA / FAQ not done |
| #3 subscriber + friend notifications | DONE (respects `allowSubscription…`/`allowFriendActivity…`) |
| #4 deep links | Config DONE (intent filters, associated domains, `/events` + `/users` routes, well-known routes). Needs `ANDROID_SHA256_CERTS` and `APPLE_TEAM_ID` env to become valid |
| #5 rate limits | DONE on auth, friend requests, reports, event create/publish, media/avatar upload, search |
| #6 audit log | DONE for admin event edit/cancel, moderation, categories, reviews, flags |
| #7 category admin | DONE (list, approve, rename, hide/archive, merge). User-created districts: not done |
| #8 mobile parity | Public profile, friends, reviews, follow, organizer manage (stats + approve/reject/payment) DONE. Still missing: subscribe-with-category, credits purchase, edit event, admin |
| #9 server-side i18n | Notifications localised (uk/en). Emails: pending SMTP |
| #11 18+ | Registration enforces birth date/minors; feed hides 18+ from minors. Search not filtered |
| #14 onboarding | DONE on web (`/welcome`); mobile not done |
| #15 Playwright | Scaffold + smoke/account specs + CI job (unverified until first CI run) |
| #17 admin reviews/analytics | DONE (reviews moderation page; dashboard funnel + top events) |
| #18 profile | Web profile page + avatar upload + social links editor DONE; username slug, OTP, friends-only privacy not done |
| #21 ranking | DONE (popularity, availability, friends going, budget fit, blocked-user exclusion, `availableOnly` filter) |
| #23 feature flags | DONE (`system_settings` flags, public `/config/flags`, admin toggle; enforced for Google login, chat, places, analytics). Sentry not done |
| #10 SMTP | Waiting for provider credentials |
| #12, #13, #19, #20, #22, #24 | Not started (need schema migrations / large refactors) |

### D2. Later the same day

| Item | State |
|---|---|
| #12 FAQ | DONE: `event_faq_items` (migration `20260925120000`), `PUT /events/:id/faq`, wizard editor, web + mobile display |
| #13 ticket types | DONE: `event_price_options` (migration `20260925122000`), `PUT /events/:id/price-options`, tier chosen at registration with per-tier capacity, web + mobile UI |
| #19 series | DONE: edit all upcoming occurrences (`PATCH /event-series/:id`), delete upcoming drafts; web page |
| #20 search | pg_trgm extension + trigram indexes migration (`20260925121000`); ranking unchanged (trigram relevance) |
| #7 districts | DONE: user suggestions (`POST /geography/districts`, PENDING), admin list/approve/rename/archive/merge |
| #8 mobile | + reviews, follow event, save/report; still missing: subscribe-with-category, credits purchase, edit event, onboarding |
| #16, #22, #24 | Not done (pg-boss worker, media derivatives/video thumbnails, generated typed client) |
| #10, #25 | Blocked on external credentials/accounts |

All new migrations were generated with `prisma migrate diff` (no DB needed) and have NOT yet been applied/tested against
Postgres — the VPS was unreachable. `deploy.sh` applies them on deploy; the new e2e tests in `spec-gaps.e2e-spec.ts`
(notifications, FAQ, ticket types) have not been run yet.

### D3. Mobile parity (final pass)

Mobile now also has: follow organizer with category chips, edit event (same steps as creation; participants are
notified on date/place changes), onboarding after registration. Still missing on mobile: credits purchase (needs
payment-provider credentials), admin screens.

### D4. Verification (local Postgres)

With the VPS unreachable, all migrations (incl. `event_faq_items`, `search_trigram_indexes`, `event_price_options`)
were applied to a throw-away local Postgres and the full API e2e suite was run: **162 passed, 5 failed** — the 5 are
`event-media` (needs MinIO/S3 on the VPS, environmental). New tests for notifications, FAQ and ticket types pass.

### D5. Final pass

- Mobile moderator screen (moderation queue + review moderation) DONE — visible only to MODERATOR/ADMIN/SUPER_ADMIN.
- Video posters DONE: `ffmpeg` frame extraction (set `FFMPEG_PATH` if not on PATH; install `ffmpeg` on the VPS), silent fallback otherwise.
- Browser E2E (Playwright, 14 tests desktop + 390px) passes against a local stack; it found and fixed a soft-404 and an API keep-alive/proxy reset.
- Deliberately NOT done (decision, not oversight):
  - **pg-boss worker (#16):** reminders/completion run as an in-process `@nestjs/schedule` cron; correct for the current single API instance. Move to a queue when a second instance or retries are needed.
  - **Generated typed client (#24):** web/mobile use small hand-written types + `fetch`; migrating is a large mechanical refactor with no user-visible effect.
- Blocked on external input: SMTP provider credentials, `ANDROID_SHA256_CERTS`, `APPLE_TEAM_ID`, Apple Developer account, WayForPay/Mono merchant keys, Sentry DSN.
