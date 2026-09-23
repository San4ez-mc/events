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

Acceptance: "event participant receives scheduled reminder."

- [x] Prisma: `Notification` (§40, one row per user per event) +
      `NotificationDelivery` (one row per channel attempt — IN_APP is
      always immediately "SENT", a DB row is a delivered in-app
      notification by definition; PUSH tracks real Expo API outcomes).
- [x] `ExpoPushService` (§41): thin wrapper around Expo's push HTTP API,
      isolated so `NotificationsService` doesn't need network mocking to
      unit-test. Deactivates a `UserDevice` when Expo reports
      `DeviceNotRegistered`. Best-effort — a push failure never blocks the
      in-app notification, which is the delivery that actually matters
      until the mobile app exists to receive push at all.
- [x] `EventLifecycleScheduler` (§42/§43/§80), `@nestjs/schedule` cron every
      10 minutes, each check idempotent via `existsForPayload` /
      `updateMany` `where` guards so a missed or overlapping run never
      double-sends:
      - 24h/1h event reminders to every actively-registered attendee,
        respecting `allowEventReminderNotifications`
      - `PUBLISHED -> COMPLETED` once `endsAt` has passed (§80)
      - one-time "under-subscribed" warning to the organizer once the
        registration deadline passes with fewer than `minParticipants`
        active registrations (UX §15) — never auto-cancels, matches spec
        exactly ("Автоматично подія не скасовується")
- [x] Wired into every relevant existing flow: new registration -> notify
      organizer (`REGISTRATION_RECEIVED`); approve/reject -> notify
      attendee; mark-paid -> notify organizer (`PAYMENT_PENDING`, i.e.
      "awaiting your confirmation"); confirm-payment -> notify attendee
      (`PAYMENT_CONFIRMED`); waitlist promotion -> notify the promoted
      attendee; event update with `notifyParticipants=true` on a
      significant field (§78) -> `EVENT_CHANGED` to every active
      registrant; `POST /events/:id/cancel` -> `EVENT_CANCELLED` to every
      active registrant (§44/§79). All fired *after* their owning
      transaction commits, not inside it — a notification write uses a
      separate DB connection and wouldn't roll back with the transaction.
- [x] `GET /notifications` (mine, cursor-paginated), `GET
      /notifications/unread-count`, `PATCH /notifications/:id/read`,
      `PATCH /notifications/read-all`.
- [x] Found and fixed a real dependency bug before it ever hit a test: the
      current `@nestjs/schedule@12` is `"type": "module"` (ESM-only, no CJS
      build), which crashes both `ts-jest` and (since this app's build
      target is CommonJS) the compiled server itself — same class of issue
      as the `file-type` ESM problem from Phase 1. Pinned to
      `@nestjs/schedule@6.1.3` (last version supporting Nest 11 with a real
      CJS build) instead.
- [x] 8 new e2e tests (notifications.e2e-spec.ts) — 79/79 total across 10
      suites passing. Covers every wired-in trigger above, list/unread-
      count/mark-read/mark-all-read, and that a stranger can't mark someone
      else's notification read.
- [x] Web UI: a notification bell in the header (unread badge, dropdown
      list, mark-read-on-click, mark-all-read, polled every 60s — no
      real-time transport yet). Verified end-to-end in a real browser:
      registering for an event as one user produced a live, correctly-
      worded notification in the organizer's bell.
- [ ] Deep-linking a notification to its specific event isn't built —
      `payloadJson` only carries `eventId`/`registrationId`, not a slug, so
      clicking currently routes to the relevant list page
      (`/organizer/events` or `/my-registrations`) rather than the exact
      event. A documented trim, not a silent gap.
- [ ] Actual push delivery is unverifiable end-to-end — no mobile app
      exists yet to register a `UserDevice`/receive a push, so
      `ExpoPushService` has never been exercised against a real device.
      The plumbing (request shape, `DeviceNotRegistered` handling) is
      correct by inspection but not tested against Expo's live API.
- [ ] EMAIL channel explicitly deferred, per spec ("Future: EMAIL").
- [ ] Friend/subscription/category-merge/district-merge notification types
      already exist in the schema (§42's job list) but have no trigger
      yet — their features (Phase 6/10) don't exist to trigger them from.
- [ ] Mobile screens — still not started.

## Phase 6 — Social

profiles, profile sharing, friends, friend-event-status, subscriptions,
private notes.

- [x] Prisma: `Friendship` (§34 — unordered-pair uniqueness enforced in
      `FriendsService`, not a DB constraint, since A->B and B->A are
      different rows), `UserBlock` (§35), `PrivateUserNote` (§36),
      `Subscription` (§33). Added `UserPreferences.hide{SocialLinks,
      UpcomingEvents,AttendanceHistory}` for §23's privacy toggles.
- [x] `FriendsModule`: send/accept/reject/cancel/unfriend, block/unblock,
      list friends/incoming/outgoing/blocked, relationship-status lookup.
      Blocking cancels any existing/pending friendship between the two
      users. Notifies on request (`FRIEND_REQUEST`) and accept
      (`FRIEND_ACCEPTED`).
- [x] `SubscriptionsModule`: `POST/DELETE /events/:id/subscribe` (UX §25's
      "Слідкувати" button — creates an EVENT subscription plus an
      ORGANIZER_CATEGORY one if it doesn't already exist), `POST
      /subscriptions/organizers/:id` (categories and/or "follow all"),
      generic unsubscribe, list mine. Re-activates a matching inactive row
      instead of duplicating (Subscription's nullable discriminator columns
      can't express this as a clean DB unique constraint, same situation as
      Friendship).
- [x] `NotesModule` (§36): upsert/list/delete, scoped to the calling
      author — there is deliberately no endpoint that could expose a note
      to its target.
- [x] `GET /users/:id/profile` (§22/§82): public, optional-auth (same
      pattern as the event-slug preview), respects the privacy toggles
      above, never includes phone (no toggle needed — never public by
      default), 404s instead of 403 when the target blocked the viewer (no
      leaking existence). Includes `relationshipStatus` so the client can
      render Add-friend/Pending/Friends correctly. `PATCH
      /users/me/preferences` added for these toggles plus the existing
      (previously unexposed) notification opt-outs.
- [x] "Friend event status" (§34/UX card's "👥 N друзі йдуть"): added to
      the single-event response (`GET /events/slug/:slug`) as
      `friendsGoing: {count, previews}` — only counts actually-going
      statuses (REGISTERED/PAYMENT_PENDING/CONFIRMED, not PENDING). Not
      added to the discovery feed's per-card response yet — computing it
      for up to 500 candidate cards per request would be a real N+1 cost;
      documented as a deferred optimization, not silently dropped.
- [x] 19 new e2e tests (friends/subscriptions/profile-and-notes specs) —
      98/98 total across 13 suites passing.
- [x] Web UI: `/friends` (list + incoming/outgoing requests),
      `/users/:id` (public profile — share-link copy button, add-friend
      CTA that reflects relationship state, privacy-respecting upcoming
      events), a 🔔 follow button and friends-going indicator on the event
      page. Nav updated with Friends/Profile links.
- [ ] Blocking has no web UI yet (block/unblock/list-blocked are
      API-only) — a documented gap, not silently dropped.
- [ ] Private notes have no web UI yet — no natural place to surface them
      until Phase 7's organizer participant-list view exists to host an
      "add a note about this attendee" affordance.
- [ ] Friends-only visibility granularity (vs. just on/off) isn't
      implemented — `FriendsService.areFriends()` exists for this purpose
      but nothing calls it yet.
- [ ] Public profile page is client-rendered, not SSR — shareable by URL
      but without server-rendered metadata/SEO, unlike the event page.
- [ ] Mobile screens — still not started.

## Phase 7 — Organizer

dashboard/статистика, co-organizers, invite previous participants, recurring
events, duplicate event.

- [x] Prisma: `EventCollaborator` (§30 — `userId`+`eventId` unique,
      `CollaboratorPermission[]` as a native Postgres array), `EventInvitation`
      (§31 — dual relation for inviter/invitee, unique per
      eventId+inviteeUserId). Migration `20260922122705_organizer_tools_phase7`.
- [x] `OrganizerModule` (`@Global()`): `EventAccessService` —
      `assertOwner`/`assertPermission`, the single place every
      owner-or-collaborator check now goes through. Owner always
      short-circuit-approves before any collaborator-permission lookup, so
      every pre-existing owner-only e2e test kept passing unchanged (widening,
      not narrowing).
- [x] `CollaboratorsModule` (§30): list/add(upsert)/update/remove, all
      owner-only (no permission can substitute for managing collaborators
      themselves). `EventsService`/`RegistrationsService` now check granular
      permissions (`EDIT_EVENT`, `MANAGE_REGISTRATIONS`) via
      `EventAccessService` instead of a hardcoded `ownerId` comparison.
- [x] `EventSeriesModule` (§29): `POST events/:id/series` turns a draft into a
      recurring template + generates occurrences via a pure, testable
      `generateOccurrenceDates()` (all 7 `RecurrenceType` values, capped at 52
      occurrences). Each occurrence is copied as a fully independent `Event`
      row (own id/DRAFT status/registration fields) — never one event with an
      array of dates. `GET event-series/:id/occurrences` to list them.
- [x] `InvitationsModule` (§31/§71): search past participants of the
      organizer's own events (excludes already-registered/already-invited),
      invite (upserts, notifies `ORGANIZER_NEW_EVENT`), invitee
      accept/decline (`invitations/mine` + `:id/accept|decline`) — accepting
      only records interest, it doesn't auto-register them.
- [x] `EventsService.duplicate` (§28): copies an event (always to a fresh
      DRAFT, own media/registrationFields, no participants/stats/series
      linkage) and `.getStats` (§35): on-demand
      registrations/confirmed/cancellations/paymentClicks/saves counts.
      Deliberately not a full analytics-events + daily-aggregate pipeline —
      documented in code as an MVP-scale trade-off; `views`/
      `conversionViewToRegistration` are omitted rather than faked, since
      there's no page-view tracking yet.
- [x] 19 new e2e tests (collaborators/event-series/invitations/
      organizer-tools specs) — 117/117 total across 17 suites passing.
- [x] Web UI: `/organizer/events/:id/collaborators` (add by user ID,
      per-permission checkboxes, remove), `/organizer/events/:id/series`
      (create + list occurrences), `/organizer/events/:id/stats`,
      `/organizer/events/:id/invite` (search + invite past participants),
      `/invitations` (accept/decline, linked from the nav dropdown), a
      "Дублювати" button on `/organizer/events`. Verified live against the
      real API (register → draft event → create series → add collaborator →
      duplicate → stats), not just typechecked.
- [ ] Invite-candidate search has no debounce (fires on every keystroke) —
      fine at current scale, worth revisiting if this becomes a public/high-
      traffic surface.
- [ ] No UI to cancel/unlink a whole series at once (only creating one and
      viewing its occurrences) — each occurrence is an independent event, so
      the existing per-event cancel/delete already covers it, just not in
      bulk.
- [ ] Mobile screens — still not started.

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
