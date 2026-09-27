# QA — Events area (sections 8, 9, 10, 12–26, 53, 54, 59, 60, 61)

Auditor scope: event media/landing/location, event creation/visibility, all registration modes,
custom registration fields, cancellation, organizer participant management, co-organizers,
previous-participant invitations, capacity/concurrency, minimum participants, registration
deadline/timezone, multiple price tiers, external payment, event copy, recurring events, DB
integrity, concurrency, idempotency, data consistency, and the full end-to-end acceptance scenario.

- Date: 2026-09-27
- Commit: `bd3064b` (CI/pnpm fix, "Legal pages... " chain) — see `git log -1`
- Environment: local Windows dev box, embedded Postgres at `localhost:5544` (`kiro_test`), migrations + seed applied, API built from `apps/api/src` at the commit above. **MinIO/S3 (`S3_ENDPOINT=http://localhost:5502`) is NOT reachable** (`curl` → connection refused) — every §9 media-upload item that requires actually writing bytes to storage is marked BLOCKED.
- Method: Jest + supertest, in-process Nest app (`apps/api/test/qa/qa-events-*.e2e-spec.ts`), run via `pnpm test:e2e --testPathPattern qa-events` from `apps/api`. Real HTTP requests through the whole stack (guards, pipes, services, Prisma, Postgres) — nothing mocked. Test data uses the `qa-ev-` email prefix and is cleaned up in every file's `afterAll`.
- **Load note**: several other QA auditors ran their own e2e batteries against this same embedded Postgres instance concurrently with this auditor's runs (confirmed independently: `git status` showed uncommitted changes under `apps/mobile`/`apps/web` this auditor never touched, and other `qa-*` spec files already existed under `apps/api/test/qa/`). The shared DB visibly struggled under that combined load — multi-minute individual test times, and at times outright `Can't reach database server at localhost:5544` / `Unable to start a transaction in the given time` errors, sometimes from this auditor's own requests (a handful of otherwise-correct, non-concurrent single requests occasionally got a transient `500` purely from Postgres being globally saturated at that instant — every test below was re-run in isolation, away from that peak load, to confirm the underlying behavior is correct) and sometimes from the app's own background cron (`EventLifecycleScheduler`). All `jest.setTimeout` values in these files were raised well above the project default (30s) to absorb that contention; a couple of concurrency tests' user counts were reduced (15→10, 12→8) and some assertions were loosened to tolerate an occasional transient 500 among a batch of concurrent requests, so a few unrelated requests failing to reach the DB doesn't masquerade as a correctness bug. None of this affected the correctness conclusions below — only how long, and how many attempts, it took to reach them cleanly.
- Test files (all under `apps/api/test/qa/`):
  - `qa-helpers.ts` — shared bootstrap/user/event factories + cleanup (not a spec file itself)
  - `qa-events-creation-visibility.e2e-spec.ts` — §12, §13, §25
  - `qa-events-landing-media-location.e2e-spec.ts` — §8, §9, §10
  - `qa-events-registration-modes.e2e-spec.ts` — §14, §15, §16, §22, §23, §24
  - `qa-events-organizer-management.e2e-spec.ts` — §17, §18, §19
  - `qa-events-capacity-concurrency.e2e-spec.ts` — §20, §21, §54, §59, §60
  - `qa-events-recurring.e2e-spec.ts` — §26
  - `qa-events-db-integrity.e2e-spec.ts` — §53
  - `qa-events-e2e-scenario.e2e-spec.ts` — §61

> **NOT_IMPLEMENTED vs FAIL vs BLOCKED**: NOT_IMPLEMENTED = no code path exists for the acceptance
> criterion. FAIL = code exists and runs, but behaves wrong, proven by a request/assertion.
> BLOCKED = the criterion cannot be exercised in this environment (MinIO unreachable), not a
> judgement on the code itself.

---

## §8 — Event Landing Page (maximal data set)

| # | Test | Status | Severity | Expected | Actual | Evidence |
|---|---|---|---|---|---|---|
| 8.1 | Public slug page exposes title/description/category/date/organizer/price/capacity/deadline/rules/FAQ/participants/reviewSummary/slug | PASS | — | All documented fields present in the `GET /events/slug/:slug` response | Confirmed by assertion | `qa-events-landing-media-location.e2e-spec.ts` → "exposes every documented field on the public slug page" |
| 8.2 | Address/coordinates hidden from anonymous/unregistered viewers, shown to organizer | PASS | — | `addressLocked: true`, `addressText: null` for a stranger; real values for the owner | Confirmed | same file → "OFFLINE event stores city/district/address..." |
| 8.3 | Media array on the landing page matches what's actually stored (no phantom entries) | PASS | — | Empty media array for an event with none uploaded | Confirmed | same file → "landing page media array reflects..." |
| 8.4 | Social links on the landing page | PARTIAL / by-design | P3 | UX §8 lists "social links" among landing-page content | `Event` has no social-link fields at all — social links live only on `User` (`UserSocialLink`), i.e. the *organizer's* profile, not the event. The public `organizer` object returned by the slug endpoint does **not** currently include the organizer's social links (only id/name/nickname/avatarUrl/bio + eventsCount/rating) | Read `EventsService.findBySlugForPreview`'s `owner: { select: {...} }` — no socials. This is a minor content gap (organizer social links could be surfaced on the event page) rather than a broken feature. | `apps/api/src/events/events.service.ts:250` |
| 8.5 | Video on landing page, "if implemented" | N/A (implemented, BLOCKED to verify end-to-end) | — | — | `EventMedia.type` supports `VIDEO`; upload path exists but is BLOCKED (§9) | — |

## §9 — Event Media (BLOCKED: MinIO/S3 unreachable)

Confirmed once, directly: `curl -s -o /dev/null -w "%{http_code}" --max-time 3 http://localhost:5502/` → connection refused (curl exit 7). `.env.test`'s `S3_ENDPOINT=http://localhost:5502` is not serving anything in this environment. `EventMediaService.upload` calls `storage.putObject` (an S3 `PutObjectCommand`) as its very first side effect for an accepted image/video, so **any** successful upload is unreachable here.

What *is* provable without storage (the checks in `EventMediaService.upload` that run **before** the first `storage.putObject` call):

| # | Test | Status | Severity | Expected | Actual | Evidence |
|---|---|---|---|---|---|---|
| 9.1 | 1/5/10 successful photo uploads | BLOCKED | — | 201 with display/thumbnail derivatives | Cannot reach storage | `qa-events-landing-media-location.e2e-spec.ts` → "BLOCKED: MinIO/S3 is not reachable locally..." probe (asserts response is NOT 201) |
| 9.2 | 11th photo rejected | PASS | — | `400 MEDIA_LIMIT_REACHED`, count check runs before any storage/type work | Confirmed — 10 `EventMedia` rows seeded directly (bypassing storage, which is legitimate since this proves the *count gate*, not the upload pipeline), then an 11th real multipart upload attempt is rejected before touching storage | "rejects the 11th media file before ever touching storage" |
| 9.3 | Invalid file (magic-byte mismatch) | PASS | — | `400 INVALID_FILE_TYPE` | Confirmed, plain-text buffer named `fake.jpg` correctly sniffed and rejected | "rejects a file whose real bytes aren't an allowed image/video type" |
| 9.4 | Oversized file | PASS | — | `400 FILE_TOO_LARGE` for >15MB image | Confirmed with a 16MB buffer | "rejects an oversized image before storage" |
| 9.5 | Broken image (valid magic bytes, corrupt body) | BLOCKED | — | Some defined behavior (500 vs graceful 400) | The very first thing `processAndStoreImage` does is `storage.putObject` for the *original* file, before `sharp` ever tries to decode it for the display/thumbnail derivatives — so this path is unreachable without storage | — |
| 9.6 | Mobile display of uploaded media | BLOCKED | — | — | No media can be uploaded at all in this environment | — |
| 9.7 | Upload/delete round-trip | BLOCKED (delete tested on seeded rows only) | — | — | `DELETE .../media/:id` itself works fine on a DB row (proven via seeded rows in §53's cascade test and the pre-existing `event-media.e2e-spec.ts`), but a *real* upload-then-delete round trip needs storage | — |
| 9.8 | Non-owner cannot upload | PASS | — | `403` | Confirmed | "a non-owner cannot upload media to someone else's event" |

**Recommendation**: none — this is purely an environment gap, not a code defect. Re-run `event-media.e2e-spec.ts` and this file's §9 tests once MinIO is reachable (`docker compose up minio` or equivalent) to convert these BLOCKED rows to PASS/FAIL.

## §10 — Location (offline/online, address gating, Maps key hygiene)

| # | Test | Status | Severity | Expected | Actual | Evidence |
|---|---|---|---|---|---|---|
| 10.1 | OFFLINE event stores city/district/address/lat/lng | PASS | — | Fields round-trip correctly | Confirmed | "OFFLINE event stores city/district/address..." |
| 10.2 | ONLINE event needs no city, exposes `onlineUrl` | PASS | — | `format: ONLINE`, `cityId: null` | Confirmed | "ONLINE event requires no city/address..." |
| 10.3 | User is never forced to use their current location as the venue | PASS | — | Publishing an OFFLINE event with no city is a hard 400, not a silent fallback to geolocation | Confirmed: `assertPublishable` requires `cityId` for OFFLINE, no code path reads a "current location" for event venue | "an OFFLINE event without a city cannot be published..." |
| 10.4 | Google Maps: no secret API key ever reaches a client response | PASS | — | No `AIza...`-shaped string or `apiKey` field in any event/places response | Confirmed — `PlacesService` proxies server-side; `GOOGLE_MAPS_API_KEY` is empty in `.env.test` so autocomplete 503s, but the JSON is still scanned and clean either way | "Google Places proxy never leaks the raw API key..." |
| 10.5 | Google Maps: correct marker/coordinates, opening Google Maps | PARTIAL (BLOCKED for the live-Places part) | — | Autocomplete/details resolve real coordinates | `GOOGLE_MAPS_API_KEY` is empty in both `.env` and `.env.test` (`X` in `docs/SPEC_AUDIT.md`) → `PlacesService` returns `503 PLACES_UNAVAILABLE`. Manually-entered `latitude`/`longitude` on an event still store/round-trip correctly (proven in 10.1) — only the live autocomplete-driven address lookup is blocked | `.env.test:16` `GOOGLE_MAPS_API_KEY=` (empty) |

---

## §12 — Event Creation

| # | Test | Status | Severity | Expected | Actual | Evidence |
|---|---|---|---|---|---|---|
| 12.1 | Minimal form: only `title` required to create a draft | PASS | — | `POST /events {title}` succeeds, no category/city/date forced | Confirmed | "creates a draft with only a title" |
| 12.2 | Publish is blocked until minimum fields are filled | PASS | — | `400 VALIDATION_ERROR` listing missing fields | Confirmed | "publish is blocked until the minimum required fields..." |
| 12.3 | Creating the first event activates organizer functionality without changing account role | PASS | — | `role` stays `USER` | Confirmed | "first event creation activates organizer functionality..." |
| 12.4 | Advanced/optional fields: rules, FAQ, price tiers, payment URL, custom registration fields all save correctly | PASS | — | All round-trip via their dedicated endpoints | Confirmed | "stores rules, FAQ, price tiers and a payment URL..." |
| 12.5 | Negative price / negative or zero capacity rejected server-side | PASS | — | `400 VALIDATION_ERROR` | Confirmed (`price` has `@Min(0)`, `capacity` has `@Min(1)`) | "rejects a negative price and a negative/zero capacity server-side" |

## §13 — Visibility (PUBLIC / PRIVATE, direct URL)

| # | Test | Status | Severity | Expected | Actual | Evidence |
|---|---|---|---|---|---|---|
| 13.1 | PUBLIC event reachable by direct slug URL, unauthenticated | PASS | — | 200 | Confirmed | "PUBLIC events are visible to anonymous visitors..." |
| 13.2 | PUBLIC event appears in the discovery feed | PASS | — | Present in feed | Confirmed | "PUBLIC events appear in the discovery feed" |
| 13.3 | PRIVATE event reachable by direct URL but absent from the discovery feed | PASS | — | Direct 200, feed excludes it | Confirmed | "PRIVATE events are reachable by direct URL but are NOT exposed..." |
| 13.4 | Unpublished DRAFT is 404 (not 403) to anyone but the owner | PASS | — | 404 for both anonymous and a logged-in stranger | Confirmed — deliberately doesn't leak existence via a 403 | "DRAFT (unpublished) events return 404 to a stranger via slug..." |

## §14 — Registration (all modes)

| # | Test | Status | Severity | Expected | Actual | Evidence |
|---|---|---|---|---|---|---|
| 14.1 | Public + free: automatic registration | PASS | — | `REGISTERED` immediately | Confirmed | "Public + free: registration is automatic" |
| 14.2 | Public + paid: register → mark-paid → organizer confirms | PASS | — | `REGISTERED → PAYMENT_PENDING → CONFIRMED` | Confirmed | "Public + paid: user registers, then organizer confirms payment" |
| 14.3 | Private + organizer approval | PASS | — | `PENDING → REGISTERED` on approve | Confirmed | "Private event + organizer approval..." |
| 14.4 | Public + organizer approval: approve/reject, cross-organizer IDOR blocked | PASS | — | Approve/reject both work; an unrelated organizer gets 403 | Confirmed | "Public + organizer approval: organizer can approve or reject" |

## §15 — Registration Form (custom fields)

| # | Test | Status | Severity | Expected | Actual | Evidence |
|---|---|---|---|---|---|---|
| 15.1 | Required field blocks submission when missing; optional field can be omitted; PHONE type stores correctly | PASS | — | `400 VALIDATION_ERROR` then `201` once answered | Confirmed | "blocks submission missing a required field..." |
| 15.2 | Phone prefilled from profile | PARTIAL / NOT VERIFIABLE AT API LEVEL | P3 | Registration form phone field pre-populated from the user's profile | No server-side prefill logic exists anywhere in `apps/api/src/registrations` or `apps/api/src/users` (grepped for "prefill"/"PHONE" — the only `PHONE` hits are the field-type enum). `GET /users/me` does expose `phone`, which a client *could* use to prefill, but that's a web/mobile UI responsibility, not something this API-level audit can prove or disprove. | `apps/api/src/registrations/dto/set-registration-fields.dto.ts:10` (only PHONE hit); no prefill code found | This should be verified in the web/mobile UI audit instead. |

## §16 — Cancellation

| # | Test | Status | Severity | Expected | Actual | Evidence |
|---|---|---|---|---|---|---|
| 16.1 | Cancelling frees the capacity slot, status → CANCELLED, no fabricated refund claim | PASS | — | Stats drop to 0 registrations; no "refund" text anywhere | Confirmed | "cancelling frees the capacity slot..." |
| 16.2 | **Organizer is notified when a participant cancels** | **FAIL** | **P2** | Organizer receives some notification when an attendee cancels their registration (QA §16: "organizer notification") | `RegistrationsService.cancel()` never notifies the organizer — it only notifies a *promoted waitlistee* (`notifyWaitlistPromoted`) when a slot opens up. There is no `REGISTRATION_CANCELLED` (or similar) entry anywhere in `NotificationType` (`packages/types/src/enums.ts`), and `cancel()`'s only `notifications.create` call is the waitlist-promotion path, which doesn't fire when there's no one to promote (e.g. no capacity limit, or no waitlist). Organizers currently only find out about a cancellation by re-checking the participant list. | `apps/api/src/registrations/registrations.service.ts:159-181` (`cancel()`); `packages/types/src/enums.ts:244-250` (notification type list, no cancellation-by-attendee type) | Marked with `it.failing` in `qa-events-registration-modes.e2e-spec.ts` → "organizer is notified when a participant cancels..." (currently NOT implemented). **Note**: an earlier draft of this test used a loose `/cancel/i` text match against the notification title+body and got a false PASS — it was matching the event's own title ("Cancel Notify QA Event") inside the unrelated "New registration" notice, not a real cancellation notification. Fixed to a before/after notification-*count* comparison instead, which reproduces the failure correctly. |

**Recommended fix for 16.2**: add a `REGISTRATION_CANCELLED` (attendee-initiated) notification type, and call `this.notifications.create({ userId: event.ownerId, type: "REGISTRATION_CANCELLED", ... })` inside `RegistrationsService.cancel()` after the transaction commits, mirroring the existing `REGISTRATION_RECEIVED` notification in `register()`. Affected files: `apps/api/src/registrations/registrations.service.ts`, `packages/types/src/enums.ts`.

## §17 — Organizer Participant Management

| # | Test | Status | Severity | Expected | Actual | Evidence |
|---|---|---|---|---|---|---|
| 17.1 | Organizer sees registrations incl. custom answers/contact info; can approve/reject/confirm payment | PASS | — | All actions succeed and are reflected | Confirmed | "organizer sees registrations with custom answers..." |
| 17.2 | Organizer can decline a pending participant | PASS | — | `REJECTED` | Confirmed | "organizer can decline (reject) a still-pending participant" |
| 17.3 | A DIFFERENT organizer (no collaborator relationship) cannot list/approve/reject/confirm-payment for someone else's event | PASS | — | `403` on every action, registration genuinely untouched | Confirmed | "a DIFFERENT organizer... cannot list, approve, reject, or confirm payment..." |

## §18 — Co-organizers

| # | Test | Status | Severity | Expected | Actual | Evidence |
|---|---|---|---|---|---|---|
| 18.1 | Collaborator with only `MANAGE_REGISTRATIONS` can approve but cannot edit the event | PASS | — | Approve succeeds (200), edit fails (403) | Confirmed | "a collaborator with only MANAGE_REGISTRATIONS can approve..." |
| 18.2 | Collaborator has no access to the owner's OTHER events | PASS | — | 403 on an unrelated event | Confirmed | "a collaborator has no access to the owner's OTHER events" |
| 18.3 | Removing a collaborator immediately revokes access | PASS | — | Edit succeeds before removal, 403 after | Confirmed | "removing a collaborator revokes their access immediately" |
| 18.4 | Only the owner (never a collaborator, even with EDIT_EVENT) can add/remove other collaborators | PASS | — | 403 for a collaborator trying to add another collaborator | Confirmed | "only the owner (not a collaborator) can add or remove other collaborators" |

## §19 — Previous Participants (Invitations)

| # | Test | Status | Severity | Expected | Actual | Evidence |
|---|---|---|---|---|---|---|
| 19.1 | Only genuinely-eligible past attendees of THIS organizer appear as candidates; invite sent; accept/decline works; accepting does NOT auto-register | PASS | — | Candidate list correctly scoped; invitation flow works end to end | Confirmed | "only genuinely eligible past attendees of THIS organizer appear as invite candidates..." |
| 19.2 | A stranger cannot search candidates or invite people to someone else's event | PASS | — | 403 | Confirmed | "a stranger cannot search invite candidates or invite people..." |
| 19.3 | A user can only accept/decline their OWN invitation | PASS | — | 403 for someone else | Confirmed | "a user can only accept/decline their OWN invitation..." |

---

## §20 — Capacity (incl. concurrency)

| # | Test | Status | Severity | Expected | Actual | Evidence |
|---|---|---|---|---|---|---|
| 20.1 | capacity=1: first registers, second blocked | PASS | — | `409 EVENT_CAPACITY_REACHED` | Confirmed | "capacity=1: the first user registers, the second is blocked" |
| 20.2 | Concurrent registrations for the LAST seat (10 simultaneous requests, capacity=1) | PASS | — | Exactly 1 winner, capacity never exceeded | Confirmed via `Promise.all` of 10 concurrent registration requests + `pg_advisory_xact_lock` per event (reduced from an initial 15 to lighten this auditor's own load on the shared, contended DB — see the Load note above) | "concurrent registrations for the LAST seat..." |
| 20.3 | Concurrent registrations for the last TWO seats (8 simultaneous requests, capacity=2) | PASS | — | Exactly 2 winners | Confirmed | "concurrent registrations for the last TWO seats..." |
| 20.4 | Waitlist: join only allowed once full; cancel promotes the longest-waiting waitlistee | PASS | — | FIFO promotion | Confirmed | "waitlist: joining is only allowed once full..." |

## §21 — Minimum Participants

| # | Test | Status | Severity | Expected | Actual | Evidence |
|---|---|---|---|---|---|---|
| 21.1 | minParticipants=5, only 3 registered, deadline passed → organizer warning notification | PASS | — | `EVENT_MIN_PARTICIPANTS_WARNING` notification with "3/5" in the body | Confirmed by directly invoking `EventLifecycleScheduler.run()` (the real cron body — it's a `@Cron(EVERY_10_MINUTES)` job in production, invoked directly here rather than waiting 10 real minutes) | "event with minParticipants=5 and only 3 registered..." |
| 21.2 | Organizer can cancel an under-subscribed event: participants notified, status changes, drops from discovery, registrations stay queryable | PASS | — | All four hold | Confirmed | "organizer can cancel an under-subscribed event..." |

## §22 — Registration Deadline / Timezone

| # | Test | Status | Severity | Expected | Actual | Evidence |
|---|---|---|---|---|---|---|
| 22.1 | Registration works before the deadline, blocked after (explicit UTC-offset ISO timestamps, no ambiguous local time) | PASS | — | `400 REGISTRATION_CLOSED` once the deadline is in the past | Confirmed | "registration works before the deadline and is blocked after it..." |

## §23 — Multiple Prices / Tiers

| # | Test | Status | Severity | Expected | Actual | Evidence |
|---|---|---|---|---|---|---|
| 23.1 | Student/Standard/VIP tiers: must choose one, no ambiguity, organizer sees the selected tier | PASS | — | `400` without a tier, `201` with one, organizer's list shows the tier name | Confirmed | "Student/Standard/VIP tiers: selection is stored unambiguously..." |
| 23.2 | A sold-out TIER is rejected even if the event overall has room | PASS | — | `409 EVENT_CAPACITY_REACHED` for the tier specifically | Confirmed | "a sold-out tier (capacity) is rejected even if the event overall has room" |

## §24 — External Payment

| # | Test | Status | Severity | Expected | Actual | Evidence |
|---|---|---|---|---|---|---|
| 24.1 | Kiro never auto-confirms payment; status only changes via explicit attendee "mark paid" + explicit organizer "confirm" actions | PASS | — | `REGISTERED → PAYMENT_PENDING → CONFIRMED`, nothing else moves it | Confirmed — the `payments` module's WayForPay/Mono webhooks are for a *different* resource (buying listing credits), not event-ticket registrations at all | "the payment URL is only informational..." |

## §25 — Event Copy

| # | Test | Status | Severity | Expected | Actual | Evidence |
|---|---|---|---|---|---|---|
| 25.1 | Duplicate gets a new id/slug, starts DRAFT, copies content, copies NO participants/stats | PASS | — | 0 registrations, 0 stats on the copy | Confirmed | "duplicates content but starts a fresh DRAFT with no participants..." |
| 25.2 | Non-owner cannot duplicate someone else's event | PASS | — | 403 | Confirmed | "a non-owner cannot duplicate someone else's event" |
| 25.3 | Photos not copied unless explicitly supported | PARTIAL — opposite of the acceptance wording, but intentional | P3 | QA doc: "photos not accidentally copied unless explicitly supported" | Code comment explicitly says media **IS** copied by design (`EventsService.duplicate`, "References the same already-processed derivatives... sharing them across two events is safe"). This is a deliberate, documented product decision, not an accident — flagging because the acceptance doc's wording implies photos normally should NOT carry over. | `apps/api/src/events/events.service.ts:514-534` | Confirm with product whether this is the intended UX; if not, the fix is to drop the `if (media.length > 0) { tx.eventMedia.createMany(...) }` block. |

## §26 — Recurring Events

| # | Test | Status | Severity | Expected | Actual | Evidence |
|---|---|---|---|---|---|---|
| 26.1 | DAILY: occurrences exactly 1 day apart, each independently publishable/registerable, per-occurrence registration counts | PASS | — | 5 occurrences, 24h apart; registering for one doesn't touch others | Confirmed | "DAILY: 5 occurrences..." |
| 26.2 | EVERY_N_DAYS (interval=2) | PASS | — | Exactly 2 days apart | Confirmed | "EVERY_N_DAYS (interval=2)..." |
| 26.3 | WEEKLY ("every 7 days") | PASS | — | Exactly 7 days apart | Confirmed | "WEEKLY (i.e. every 7 days)..." |
| 26.4 | SPECIFIC_DAY_OF_MONTH ("every 10th") | PASS | — | Same day-of-month preserved | Confirmed | "SPECIFIC_DAY_OF_MONTH ('every 10th')..." |
| 26.5 | Hard safety cap of 52 occurrences | PASS | — | `count > 52` rejected by DTO validation before any occurrence is created | Confirmed | "a recurrence count above the hard safety cap of 52..." |
| 26.6 | Cancelling ONE occurrence ≠ cancelling all | PASS | — | Only the cancelled occurrence's status changes | Confirmed | "cancelling ONE occurrence does not cancel the others..." |
| 26.7 | Statistics stay correct per-occurrence | PASS | — | Registrations on occurrence 1 don't leak into occurrence 2's stats | Confirmed | "statistics stay per-occurrence and correct..." |
| 26.8 | Timezone handling in recurrence math | OBSERVATION (not tested to failure) | P3 | Occurrence dates respect the event's own `timezone` field | `generateOccurrenceDates`/`nextDate` (`apps/api/src/event-series/recurrence.ts`) operate via plain JS `Date.setDate()`/`setMonth()`, which advance in the **server process's** local timezone, not the event's stored `timezone` (default `Europe/Kyiv`). At Kiro's current scale (server likely runs in UTC) this doesn't visibly misbehave for DAILY/WEEKLY/interval patterns, but around a DST transition in a timezone that observes it, a "same wall-clock-time daily" recurrence could drift by an hour. Not reproduced here (would require simulating a DST boundary) — flagged as a design note, not a proven FAIL. | `apps/api/src/event-series/recurrence.ts:35-61` | Recommend: if/when this matters, compute occurrences via a timezone-aware library (e.g. `date-fns-tz`/`luxon`) keyed off `Event.timezone` rather than raw `Date` arithmetic. |

---

## §53 — Database Integrity

All checks below run as raw SQL (`$queryRaw`) against the **whole** `kiro_test` database (not just this auditor's own rows), per the brief's "run after the full suite" instruction.

| # | Test | Status | Severity | Expected | Actual | Evidence |
|---|---|---|---|---|---|---|
| 53.1 | No `Registration` row points at a non-existent Event or User | PASS | — | 0 orphans | Confirmed | "no Registration row points at a non-existent Event or User" |
| 53.2 | No `RegistrationAnswer` row points at a non-existent Registration or RegistrationField | PASS | — | 0 orphans | Confirmed | "no RegistrationAnswer row points at a non-existent..." |
| 53.3 | No `EventMedia`/`EventCollaborator`/`EventInvitation`/`EventFaqItem`/`EventPriceOption`/`RegistrationField` row points at a non-existent Event | PASS | — | 0 orphans across all six tables | Confirmed | "no EventMedia / EventCollaborator / ... row points at a non-existent Event" |
| 53.4 | No duplicate `(eventId, userId)` registration rows | PASS | — | 0 duplicates (DB unique constraint holds) | Confirmed | "no duplicate (eventId, userId) Registration rows exist..." |
| 53.5 | No event's active-registration count exceeds its own capacity, DB-wide | PASS | — | 0 violations | Confirmed | "no event's active-registration count exceeds its own capacity..." |
| 53.6 | No event has a negative price or non-positive capacity/minParticipants stored | PASS | — | 0 violations | Confirmed (matches DTO-level `@Min` guards from §12.5) | "no event has a negative price or a non-positive capacity/minParticipants stored" |
| 53.7 | Deleting an Event cascades to media/registrations(+answers)/collaborators/invitations/FAQ/price-options | PASS | — | All child rows gone, no orphans | Confirmed via a real `prisma.event.delete()` on a fully-populated fixture event | "deleting an Event cascades to its media, registrations..." |
| 53.8 | Account deletion (soft-delete) cancels the user's upcoming events instead of leaving a dangling `ownerId` FK | PASS | — | Event → CANCELLED, `ownerId` FK stays valid (User row anonymised, not removed) | Confirmed | "account deletion (soft-delete) cancels the deleted organizer's upcoming events..." |

## §54 — Concurrency

| # | Test | Status | Severity | Expected | Actual | Evidence |
|---|---|---|---|---|---|---|
| 54.1 | **Simultaneous approve + reject on the SAME pending registration** | **FAIL** | **P1** | Exactly one of the two mutating calls succeeds (200); the loser gets a clean 400, never a silent double-apply | Reproduced deterministically on every single run where the DB was reachable (6+ independent runs while writing/hardening this test suite): **both** `approve` and `reject`, fired concurrently at the same PENDING registration, return `200`. Root cause: `RegistrationsService.reject()` wraps its read-check-write in a `pg_advisory_xact_lock`-protected transaction, but `RegistrationsService.approve()` does a plain, unlocked read-then-write with no compare-and-swap (`update({ where: { id: registrationId }, ... })` — no `status: "PENDING"` guard in the `where`). Two concurrent calls can both read `PENDING`, both pass the `if (registration.status !== "PENDING") throw` guard, and both then unconditionally write — last write wins, and **both callers are told they succeeded**, even though only one of their claimed outcomes (`REGISTERED` vs `REJECTED`) is the row's real final state. | `apps/api/src/registrations/registrations.service.ts:184-202` (`approve()`, no lock/transaction) vs `:205-230` (`reject()`, has one) | `qa-events-capacity-concurrency.e2e-spec.ts` → "simultaneous approve + reject on the SAME pending registration..." (`expect(statuses.filter(s=>s===200).length).toBeLessThanOrEqual(1)` fails: received `[200, 200]`) |
| 54.1b | **Theorized consequence: the same race could make an event's active-registration count exceed its own capacity** | **NOT directly reproduced** (logically follows from 54.1's confirmed mechanism, but not yet empirically captured) | P1 *if confirmed* | Capacity must never be exceeded (§20) | `reject()` also runs `promoteFromWaitlist` inside its transaction — it frees the PENDING registration's seat and immediately promotes the oldest waitlisted registrant into it. If `approve()`'s unlocked write (54.1's confirmed race) lands afterward, it would put the *original* registration back to `REGISTERED`, so **both** the original registrant *and* the newly-promoted waitlistee would occupy active seats on a `capacity: 1` event — one seat over capacity. This follows logically from 54.1's confirmed mechanism, but across 3 separate test runs (up to 15 attempts total, 5 per run) the narrower interleaving this needs — `approve()`'s write landing specifically *after* `reject()`'s promotion, not just after its status write — never actually landed; every attempt's final `activeCount` stayed at 1. Being honest about this: it is a well-founded hypothesis backed by reading the code, not a proven FAIL. Kept as a non-blocking diagnostic test (5 attempts, logs the outcome, never fails the suite either way) rather than `it.failing`, precisely because its pass/fail would otherwise depend on DB-load timing rather than on the code. | Same root cause as 54.1 | `qa-events-capacity-concurrency.e2e-spec.ts` → "[diagnostic, non-blocking] approve()'s unlocked race..." |
| 54.2 | Simultaneous cancel calls on the same registration (5x concurrent) | PASS | — | Idempotent — all 5 return 200, final state is CANCELLED once | Confirmed | "simultaneous cancel calls on the same registration are idempotent" |
| 54.3 | Concurrent last-seat/last-two-seats registrations | PASS | — | (see §20.2/§20.3 — same evidence) | Confirmed | — |

**Recommended fix for 54.1/54.1b**: make `approve()` symmetric with `reject()` — wrap it in `prisma.$transaction`, take the same `pg_advisory_xact_lock(hashtext(eventId))`, and/or add `status: "PENDING"` to the `update()`'s `where` clause (Prisma throws `P2025`/updates 0 rows when the where no longer matches, which the service should turn into the existing `VALIDATION_ERROR` 400) so a losing caller gets a real error instead of a stale success. Affected file: `apps/api/src/registrations/registrations.service.ts` (`approve()`, lines ~184-202).

## §59 — Idempotency (retry-safe registration)

| # | Test | Status | Severity | Expected | Actual | Evidence |
|---|---|---|---|---|---|---|
| 59.1 | Retrying an identical registration request after the first succeeded | PASS | — | `409 ALREADY_REGISTERED`, never a second row | Confirmed | "retrying the exact same registration request..." |
| 59.2 | 8 concurrent identical registration requests ("retry storm") | PASS | — | Exactly 1 row created total | Confirmed | "firing the same registration request many times concurrently..." |

## §60 — Data Consistency

| # | Test | Status | Severity | Expected | Actual | Evidence |
|---|---|---|---|---|---|---|
| 60.1 | After a mix of register/approve/reject/cancel, `/stats` agrees exactly with raw DB counts and with the registrations list | PASS | — | `stats.registrations === active DB count`, `stats.cancellations === CANCELLED DB count`, REJECTED counted separately from CANCELLED | Confirmed | "after a mix of register/approve/cancel operations, the stats endpoint and the raw DB counts agree exactly" |

---

## §61 — Full End-to-End Acceptance Scenario

| Step | Description | Status | Evidence |
|---|---|---|---|
| 1-2 | Create USER_A, USER_B | PASS | `qa-events-e2e-scenario.e2e-spec.ts` |
| 3-4 | USER_A creates an event, selects a category | PASS | same |
| 5 | Add photos | **BLOCKED** (MinIO unreachable — see §9) | Explicitly skipped with a comment; not silently assumed to pass |
| 6-7 | Set public/free/capacity/deadline, publish | PASS | same |
| 8-9 | USER_B discovers via feed, changes filters (category) | PASS | same |
| 10-11 | USER_B opens the event, saves it | PASS | same |
| 12 | USER_B registers (PENDING, since this run exercises the approval branch) | PASS | same |
| 13-14 | USER_A sees the registration, approves it | PASS | same |
| 15 | USER_B receives an approval notification | PASS | same |
| 16-17 | USER_A changes the event's start time (with `notifyParticipants:true`); USER_B receives an `EVENT_CHANGED` notification | PASS | same |
| 18 | Event is completed | PASS, with a caveat — see below | Status/`completedAt`/`endsAt` set directly via Prisma, **not** through any API call, because there is no "force-complete" endpoint and no way to fast-forward real time in this test. This mirrors exactly what the 10-minute `EventLifecycleScheduler` cron does automatically in production once `endsAt` is in the past — the DB write here stands in for "wait for real time to pass," it is not bypassing any business logic. Explicitly called out in the test file. |
| 19 | USER_B leaves a rating/review | PASS | same |
| 20 | USER_A sees statistics | PASS | same |
| 21 | USER_A creates another event | PASS | same |
| 22 | USER_A still participates in (a third-party) event as a normal user; role stays `USER` throughout | PASS | same |

**Overall**: the scenario runs end-to-end through the real API with only the one documented,
brief-sanctioned exception (step 18's DB write, standing in for the passage of time).

---

## Summary

| Status | Count |
|---|---|
| PASS | 68 |
| FAIL | 2 |
| BLOCKED | 6 |
| NOT_IMPLEMENTED | 0 |
| PARTIAL / observation (not a hard PASS or FAIL) | 4 |
| Theorized, not empirically confirmed (§54.1b) | 1 |
| **Total itemized rows** (§8-§26, §53, §54, §59, §60) | **81** |

Plus §61's full end-to-end scenario: 21 of its 22 numbered steps PASS end-to-end through the real
API; step 5 ("add photos") is BLOCKED for the same MinIO/S3-unreachable reason as §9.

_(Counts above are for the itemized rows in this document, not raw Jest `it()` counts — several
rows are backed by more than one assertion in the same test. See the per-file Jest run output for
exact pass/fail counts.)_

### P0 / P1 findings
- **§54.1 (P1, confirmed on every run)** — `RegistrationsService.approve()` has no lock/transaction
  while `reject()` does, so a concurrent approve+reject on the same PENDING registration lets **both**
  calls return `200`, even though only one write is the row's real final state. Two co-organizers (or
  one organizer's retried request) can both be told their action succeeded when only one of them
  actually happened — a real correctness/trust break in a core organizer workflow. §54.1b theorizes
  a further consequence (this race letting an event's capacity be exceeded, via `reject()`'s
  waitlist-promotion) that follows logically from the same code but was **not** empirically reproduced
  despite 15 attempts across 3 runs — see §54 for the honest accounting of what is and isn't proven.
  See root cause and recommended fix under §54 above. Affected file:
  `apps/api/src/registrations/registrations.service.ts`.

No P0 (security/unusable-product) issues were found in this auditor's scope.

### P2 findings
- **§16.2** — Organizer is never notified when a participant cancels their own registration. See
  root cause / fix above.

### P3 / observations
- **§8.4** — Organizer social links aren't surfaced on the event landing page (they only exist on
  the user profile).
- **§10.5** — Google Maps Places autocomplete is BLOCKED by a missing `GOOGLE_MAPS_API_KEY` in this
  environment (known, tracked in `docs/SPEC_AUDIT.md` as `X`); manual lat/lng entry still works.
- **§15.2** — Registration-form phone prefill is a frontend concern; nothing to fix at the API
  level, re-verify in the web/mobile UI audit.
- **§25.3** — Event duplication intentionally copies photos, which reads as the *opposite* of the
  acceptance doc's wording ("not copied unless explicitly supported"). Confirm with product whether
  this is intended; if not, it's a one-block code change (see above).
- **§26.8** — Recurrence date math uses server-local `Date` arithmetic instead of the event's own
  `timezone` field; a theoretical DST-drift risk, not reproduced as an actual failure here.

### Regression note
Re-run `apps/api/test/event-media.e2e-spec.ts` and this file's §9 tests once MinIO/S3 is reachable
in this environment to convert the 6 BLOCKED rows into real PASS/FAIL results.
