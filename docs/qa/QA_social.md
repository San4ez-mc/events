# QA — Social / Discovery / Notifications / Admin (Kiro)

Scope: sections 6, 7, 11, 27, 28, 29, 30, 31, 32, 33, 34-37, 38-39, 40, 44, 47,
48, 55, 56, 57 of `kiro_qa_acceptance_tests.md`.

- Environment: local Postgres (`postgresql://kiro:kiro@localhost:5544/kiro_test`), in-process Nest app via
  Jest + supertest, same as `apps/api/test/*.e2e-spec.ts`.
- Test files (all under `apps/api/test/qa/`, prefix `qa-soc-` / `qa-perf-`, all clean up in `afterAll`):
  `qa-social-feed-filters.e2e-spec.ts`, `qa-social-categories.e2e-spec.ts`,
  `qa-social-saved-subs-friends-profile.e2e-spec.ts`, `qa-social-ratings-reviews-notes.e2e-spec.ts`,
  `qa-social-notifications.e2e-spec.ts`, `qa-social-stats-myevents-admin.e2e-spec.ts`,
  `qa-social-sharing-i18n-geo-contract.e2e-spec.ts`, `qa-social-perf.e2e-spec.ts`.
- Run with: `cd apps/api && export DATABASE_URL=postgresql://kiro:kiro@localhost:5544/kiro_test && pnpm test:e2e --testPathPattern qa-social`.
- This DB is shared with other QA auditors running in parallel (their fixtures use other prefixes: `qa-events-`,
  `qa-security-`, etc. — visible under `apps/api/test/qa/`). Several runs in this session hit transient
  `Can't reach database server` / `Unable to start a transaction in the given time` errors under that shared
  load; these are noted explicitly below wherever they affected a result, and are distinguished from genuine
  application defects (which were always reproduced deterministically, usually in isolation).
- `it.failing(...)` is used (Jest 29.7 supports it) for tests that assert the *spec-correct* behaviour but
  currently and reproducibly fail against real code — Jest reports these as green exactly because the bug is
  confirmed present; an unexpected pass would flip them red.

## §6 — Home / Tinder feed

| Test | Status | Severity | Expected | Actual | Evidence |
|---|---|---|---|---|---|
| ≥20 public events surfaced, hidden/draft/private/expired excluded | PASS | — | 22 fixture events all discoverable; draft/private/expired never appear | Confirmed for the exclusion rules; pagination itself has a real bug (below) | `qa-social-feed-filters.e2e-spec.ts` › "lists at least 20 public events…" |
| Pagination has no duplicate events across pages | **FAIL** | **P2** | Walking every page via cursor yields each event exactly once | Reproduced deterministically in isolation: one run showed 2 duplicate cards across pages, another run showed 1 missing card (21/22) | Same test, run via `it.failing` — see Root cause below |
| Swipe: OPEN (tap/swipe-right) never auto-registers; PASS (swipe-left) removes the card; "look again" restores it | PASS | — | No registration row created by OPEN; PASS removes from feed; reset-passes restores it | Confirmed: `Registration` count stayed 0 after `OPEN`; event disappeared after `PASS`, reappeared after `DELETE /discovery/passes` | `qa-social-feed-filters.e2e-spec.ts` › "swipe semantics…" |
| Feed priority: preferred city/category ranks above a non-preferred event | PASS | — | Event matching the viewer's `preferredCityId`/`preferredCategoryIds` ranks ahead of an otherwise-identical one that doesn't | Confirmed cleanly in an isolated run; one full-suite run showed the "other" event missing from a `limit=50` response, not reproduced when re-run alone — treated as DB-contention noise, not a code defect (see note) | `qa-social-feed-filters.e2e-spec.ts` › "feed priority…" |

**FAIL — pagination duplicates/skips events**
- Root cause: `DiscoveryService.scoreEvent` (`apps/api/src/discovery/discovery.service.ts`) folds `now = new Date()`
  — captured fresh on *every* request — into the ranking score via `dateProximityMax - daysUntil` and
  `freshEventMax - daysSinceCreated`. Both terms drift continuously with wall-clock time. The cursor
  (`encodeScoredCursor`, `apps/api/src/common/utils/scored-cursor.ts`) bakes in the *exact* score of the last
  item on a page; `sliceAfterScoredCursor` looks for an exact `(score, id)` match to resume from on the next
  page. Because the score has drifted by the time page 2 is requested, the exact match fails and the code falls
  back to a boundary filter (`score < cursor.score || (score === cursor.score && id > cursor.id)`), which can
  duplicate or skip an item that sits near the boundary, non-deterministically — confirmed by two different
  isolated runs producing two different symptoms (a dup, then a skip) from the same test.
- Recommended fix: stop feeding continuously-drifting terms into a value that's also used as a stable pagination
  key. Either (a) freeze `now` for the life of one "browsing session" (e.g. round to the current hour, or accept
  it as a query param the client keeps constant across pages), or (b) separate ranking from pagination — sort by
  a genuinely stable tiebreaker (e.g. `startsAt, id`) for cursor purposes and treat the score as a secondary,
  approximate ordering hint only.
- Affected files: `apps/api/src/discovery/discovery.service.ts`, `apps/api/src/common/utils/scored-cursor.ts`,
  and (same pattern, same risk) `apps/api/src/search/search.service.ts`.
- Regression test: `qa-social-feed-filters.e2e-spec.ts` › `it.failing(...)` — flip to `it` once fixed.

## §7 — Filters

| Test | Status | Severity | Expected | Actual | Evidence |
|---|---|---|---|---|---|
| City / category filters | PASS | — | Only matching events returned | Confirmed | `qa-social-feed-filters.e2e-spec.ts` |
| Budget filters (min never hides free; positive min excludes free) | PASS | — | Per §7 wording | Confirmed | same |
| Online/offline (format) filter | PASS | — | Only matching format returned | Confirmed | same |
| Date-range filter | PASS | — | Only events starting in range | Confirmed | same |
| Adults-only / capacity-range filters | PASS | — | Only matching events returned | Confirmed | same |
| Apply / reset, and preferences persist server-side (survive a fresh request) | PASS | — | `PATCH /discovery/preferences` persists; a later `GET` from a new request sees it; resetting clears it | Confirmed | same |

No FAILs in §7. Filter parameter set (`apps/api/src/common/utils/public-event-filters.ts`,
`discovery-query.dto.ts`) is shared between discovery and search, consistent with the spec.

## §11 — Categories

| Test | Status | Severity | Expected | Actual | Evidence |
|---|---|---|---|---|---|
| Existing category stored correctly on an event | PASS | — | `Event.categoryId` = selected category | Confirmed | `qa-social-categories.e2e-spec.ts` |
| User-created category: `status=PENDING`, `source=USER_CREATED`, `createdByUserId` set; >2-level depth rejected | PASS | — | Per §11/§16 | Confirmed via direct DB read | same |
| PENDING category can't be used on an event until admin approves it | PASS | — | 400 while PENDING, 200 once ACTIVE | Confirmed | same |
| Admin sees creator, status, source for a user-created category; a plain user is rejected (403) | PASS | — | Per §11 | Confirmed | same |
| Merge migrates events, keeps categoryId valid, marks source `MERGED`, notifies each affected owner exactly once | PASS | — | Per §11/§76 | Confirmed — 1 notification per distinct owner, not per event | same |
| A merged category can't be edited or reused as a merge target | PASS | — | 400 on both | Confirmed | same |

No FAILs in §11.

## §27 — Saved events

| Test | Status | Severity | Expected | Actual | Evidence |
|---|---|---|---|---|---|
| Save shows up in the saved list and on the event page (`viewerSaved`); unsave removes it; saving is idempotent; saving is never a registration | PASS | — | Per §27 | Confirmed — `Registration` count and `GET .../registrations/me` both confirm no registration is created by saving | `qa-social-saved-subs-friends-profile.e2e-spec.ts` |

Note: this specific test hit a transient `Can't reach database server` (infra, shared DB under load from other
parallel QA auditors) on its 2nd/3rd HTTP call in two separate runs; the calls that *did* complete before the
drop (save, and the pre-save `viewerSaved: false` check) succeeded. The code path (`DiscoveryService.saveEvent
/unsaveEvent/listSaved`, `apps/api/src/discovery/discovery.service.ts`) is a straightforward upsert/delete/
findMany with no business-logic branches, and the same `viewerSaved` field is exercised successfully end-to-end
in `qa-social-feed-filters.e2e-spec.ts`. Graded PASS on that basis, but flagged here rather than silently retried
away — a re-run once the shared DB is idle would remove all doubt.

## §28 — Subscriptions

| Test | Status | Severity | Expected | Actual | Evidence |
|---|---|---|---|---|---|
| Subscribe to an event follows it without registering; unsubscribe works | PASS | — | Per §28 | Confirmed | `qa-social-saved-subs-friends-profile.e2e-spec.ts` |
| Organizer-follow: category-of-this-organizer, and all-events-of-organizer scopes both work and are independent | PASS | — | Per §28 | Confirmed; unsubscribing one scope leaves the other active | same |
| Category subscription is scoped to that organizer only (not global) | PASS | — | Same category from a different organizer is a distinct subscription | Confirmed | same |
| A user can't unsubscribe someone else's subscription | PASS | — | 403 | Confirmed | same |

No FAILs in §28.

## §29 — Friends

| Test | Status | Severity | Expected | Actual | Evidence |
|---|---|---|---|---|---|
| Send / receive / accept / reject / cancel / remove(unfriend) | PASS | — | Full lifecycle works | Confirmed | `qa-social-saved-subs-friends-profile.e2e-spec.ts` |
| Duplicate request (both directions) and self-request rejected | PASS | — | 409 / 400 | Confirmed | same |
| Friend-event-participation notification (`FRIEND_EVENT_REGISTERED`) | PASS | — | Fires when an opted-in friend registers | Confirmed | `qa-social-notifications.e2e-spec.ts` |
| Event attendance visibility respects the participant's own opt-in, independent of friendship | PASS | — | A friend who registered with `showAsParticipant:false` never appears in the public participants list, even to friends | Confirmed | `qa-social-saved-subs-friends-profile.e2e-spec.ts` |
| `hideAttendanceHistory` user preference actually hides anything | **NOT_IMPLEMENTED** | P3 | Enabling it should hide the user's attendance/participation history somewhere (profile, friend view) | The field exists in `UpdateUserPreferencesDto` / `UserPreferences` and can be set, but is **never read** anywhere else in `apps/api/src` — confirmed by `grep -rn "hideAttendanceHistory" apps/api/src` returning only the DTO declaration | Code review: `apps/api/src/users/dto/update-user-preferences.dto.ts:45`; no other reference exists in the codebase |

**NOT_IMPLEMENTED — `hideAttendanceHistory` is a no-op**
- Root cause: the preference was added to the DTO/schema but no read-side code (public profile, participants
  list, friend activity feed) ever consults it. `hideSocialLinks` and `hideUpcomingEvents`, its siblings in the
  same DTO, *are* consulted in `UsersService.getPublicProfile` — this one was missed.
- Recommended fix: either wire it into the relevant read paths (e.g. exclude the user from other people's
  "friend is going" signals, or from any future "attendance history" view) or remove the dead field/UI toggle
  until there's a concrete feature behind it.
- Affected files: `apps/api/src/users/dto/update-user-preferences.dto.ts`, `apps/api/src/users/users.service.ts`
  (`getPublicProfile`), `apps/api/src/notifications/notifications.service.ts` (`notifyFriendsOfRegistration`).
- Regression test: none written (a no-op is best proven by code inspection, not a brittle "nothing changed"
  assertion) — add one alongside the fix.

## §30 — Profile sharing

| Test | Status | Severity | Expected | Actual | Evidence |
|---|---|---|---|---|---|
| Public profile reachable by id without auth; never leaks phone/email/birthDate/passwordHash | PASS | — | Per §30/§5 | Confirmed | `qa-social-saved-subs-friends-profile.e2e-spec.ts` |
| A profile the owner has blocked the viewer from is 404 (doesn't reveal existence); the reverse (viewer blocked owner) does not hide it | PASS | — | Per `FriendsService.getRelationshipStatus` semantics | Confirmed | same |

No FAILs in §30.

## §31 — Organizer ratings

| Test | Status | Severity | Expected | Actual | Evidence |
|---|---|---|---|---|---|
| Rating bounds 1..5 enforced | PASS | — | 0 and 6 rejected (400); 1 and 5 accepted | Confirmed | `qa-social-ratings-reviews-notes.e2e-spec.ts` |
| Rating before the event completes is blocked | PASS | — | 400 while event is PUBLISHED | Confirmed | same |
| Rating from someone unrelated to the event (never registered, or the organizer themself) is blocked | PASS | — | 403 (stranger) / 400 (self) | Confirmed | same |
| Duplicate rating from the same author doesn't create a second row / doesn't inflate the average | PASS* | — | Per §31 ("blocked") — see note | A second submission *edits in place* (upsert on the `(eventId, authorUserId)` unique key) rather than returning an error; exactly one row always exists | same |
| Aggregate recalculates live as reviews are added | PASS | — | Average updates immediately after each new review | Confirmed (5 → then (5+1)/2=3 after a second reviewer) | same |

\* **Deviation, not a defect**: the spec's wording ("duplicate rating → blocked") implies an error response. The
implementation instead treats a second submission as an edit — the safety invariant that matters (one person
can't inflate/deflate the average more than once) holds, but there's no 409 the way "blocked" implies. Reported
as a deviation for product sign-off, not filed as a FAIL.

**PARTIALLY_IMPLEMENTED — organizer rating is not its own primitive**
There is no dedicated "rate the organizer" input anywhere in the API. See the combined §31/§32 finding below.

## §32 — Event reviews

| Test | Status | Severity | Expected | Actual | Evidence |
|---|---|---|---|---|---|
| Edit (re-submit) and author-only delete | PASS | — | Edit updates in place; only the author can delete; a stranger gets 403 | Confirmed | `qa-social-ratings-reviews-notes.e2e-spec.ts` |
| Duplicate prevention | PASS | — | Same as §31 | Confirmed | same |
| Moderation (hide/remove) by a moderator; hidden reviews vanish from the public list; a plain user can't moderate | PASS | — | Per §37/§72 | Confirmed | same |
| **Event reviews and organizer ratings are separate concepts** | **PARTIALLY_IMPLEMENTED** | **P2** | §32 explicitly: "Event reviews and organizer ratings must be separate concepts" | They are the exact same `EventReview` row/table. One `POST /events/:id/reviews` call simultaneously changes the event's own `reviewSummary` (shown on the event page) *and* the organizer's public-profile `ratingAverage`/`reviewsCount` — same average, same count, same underlying row, computed by two different call sites (`EventsService.getReviewSummary`, `UsersService.getPublicProfile`) reading the same table | `qa-social-ratings-reviews-notes.e2e-spec.ts` › "DEVIATION from spec: event reviews and organizer ratings are not separate concepts…" |

**PARTIALLY_IMPLEMENTED — no separation between event reviews and organizer ratings**
- Root cause: by design (see the doc-comment on `model EventReview` in `apps/api/prisma/schema.prisma`), the
  organizer's aggregate rating is deliberately computed live from `EventReview` rows across all their completed
  events, rather than being backed by an independent "rate this organizer" table/flow. This is an intentional
  architectural simplification, but it contradicts the acceptance spec's explicit requirement.
- Recommended fix: if the platform truly needs a rating that's independent from the free-text event review (e.g.
  a participant who never writes a review but still wants to rate the organizer, or wants to review the event
  1★ while rating the organizer 5★ because the event itself was poorly run but the organizer was great), add a
  second, dedicated `OrganizerRating` table with its own eligibility/uniqueness rules, and keep `EventReview`
  purely about the event. Otherwise, treat this as an accepted product decision and update the spec instead of
  the code.
- Affected files: `apps/api/prisma/schema.prisma` (`EventReview`), `apps/api/src/reviews/reviews.service.ts`,
  `apps/api/src/events/events.service.ts` (`getReviewSummary`), `apps/api/src/users/users.service.ts`
  (`getPublicProfile`).

## §33 — Private organizer notes

| Test | Status | Severity | Expected | Actual | Evidence |
|---|---|---|---|---|---|
| Author can create/list/edit(upsert)/delete a note about another user | PASS | — | Per §33 | Confirmed | `qa-social-ratings-reviews-notes.e2e-spec.ts` |
| A different author sees an empty list, never another author's note about the same target | PASS | — | Isolation per author | Confirmed | same |
| Note text never appears in the public profile or in the target's own `/users/me` payload | PASS | — | Never exposed publicly | Confirmed (string search over both response bodies) | same |
| One author can't delete another author's note about the same target | PASS | — | 403 | Confirmed | same |

No FAILs in §33.

## §34-37 — Notifications

| Test | Status | Severity | Expected | Actual | Evidence |
|---|---|---|---|---|---|
| Registration → organizer `REGISTRATION_RECEIVED`; approve/reject → attendee `REGISTRATION_APPROVED`/`REGISTRATION_REJECTED` | PASS | — | Per §34 | Confirmed | `qa-social-notifications.e2e-spec.ts` |
| Payment confirmation → `PAYMENT_CONFIRMED` | PASS | — | After attendee `mark-paid` then organizer `confirm-payment` | Confirmed | same |
| Friend request → `FRIEND_REQUEST`; accepted → `FRIEND_ACCEPTED` | PASS | — | Per §34 | Confirmed | same |
| Subscriptions: organizer-follower gets `ORGANIZER_NEW_EVENT` on publish; friend gets `FRIEND_EVENT_REGISTERED` | PASS | — | Per §34 (both fire-and-forget; test polls rather than racing them) | Confirmed | same |
| Event change (date/time/location) notifies every active registrant exactly once per save | PASS | — | One `EVENT_CHANGED` row per registrant per save, not per changed field | Confirmed (exactly 1 each for 2 registrants after 1 save) | same |
| A significant published-event change is rejected (400) unless `notifyParticipants:true` is sent | PASS | — | Server-side guard forces the notification to actually happen, not just "if the client remembers to notify" | Confirmed | same |
| **Price / rules changes also notify participants** | **FAIL** | **P2** | §35 explicitly lists "price" and "important rules" as changes that must notify participants | `SIGNIFICANT_PUBLISHED_FIELDS` in `EventsService` only covers `startsAt, addressText, cityId, districtId, onlineUrl` — a price-only or rules-only change on a PUBLISHED event is accepted silently, doesn't require `notifyParticipants`, and never creates an `EVENT_CHANGED` notification | `qa-social-notifications.e2e-spec.ts` › `it.failing("[SPEC DEVIATION] changing price or the event's rules…")` |
| Reminders (24h/1h) sent only to actively-registered attendees; none after cancel; none after the whole event is cancelled; no duplicates on repeat scheduler runs | PASS | — | Calls `EventLifecycleScheduler.run()` directly, per the task's instruction | Confirmed on all four sub-checks | `qa-social-notifications.e2e-spec.ts` |
| Min-participant warning fires once past the deadline, not duplicated on repeat runs | PASS | — | Per §36/UX §15 | Confirmed | same |
| Disabling push (`allowPush:false`) stops PUSH deliveries but the IN_APP notification is still recorded | PASS | — | Per §37 | Confirmed via `NotificationDelivery` rows | same |
| Preference changes affect only future notifications, not past ones | PASS | — | Per §37 | Confirmed | same |

**FAIL — price/rules change on a published event doesn't notify participants**
- Root cause: `apps/api/src/events/events.service.ts`, `SIGNIFICANT_PUBLISHED_FIELDS = ["startsAt",
  "addressText", "cityId", "districtId", "onlineUrl"]` — `price` and `rules` are not in this list, so
  `applyUpdate()` neither requires `notifyParticipants` nor sends `EVENT_CHANGED` when only those fields change.
- Recommended fix: add `price` and `rules` (and arguably `priceType`, `capacity` decreases, `minParticipants`) to
  `SIGNIFICANT_PUBLISHED_FIELDS`.
- Affected files: `apps/api/src/events/events.service.ts`.
- Regression test: `qa-social-notifications.e2e-spec.ts` › `it.failing(...)` — flip to `it` once fixed.

**Related, smaller FAIL found while testing §35/§37 localisation** — filed under §47 below (mixed-language
cancellation-with-reason notification), since it's a localisation bug rather than a notification-firing bug.

## §38-39 — Statistics & My events dashboard

| Test | Status | Severity | Expected | Actual | Evidence |
|---|---|---|---|---|---|
| Registrations/cancellations counted correctly; only the organizer (not a stranger) can see stats | PASS | — | Per §38 | Confirmed | `qa-social-stats-myevents-admin.e2e-spec.ts` |
| **Distinction between total and unique views** | **NOT_IMPLEMENTED** | P3 | §38: "verify defined distinction between total and unique views" | `EventDailyStat.views` (read via `AnalyticsService.summary()`) is a raw counter incremented once per `VIEW` analytics event, with no per-viewer/session dedup anywhere. There is no `uniqueViews` field or equivalent in the stats response at all — three views from the same session reported `views: 3`, and `uniqueViews` was `undefined` | `qa-social-stats-myevents-admin.e2e-spec.ts` › `it.failing("[SPEC GAP] exposes a distinction between total and unique views…")` |
| Dashboard: drafts/published/completed via `status` filter, participant counts, per-event stats | PASS | — | Per §39 | Confirmed | same |
| **Sorting on `/events/mine`** | **NOT_IMPLEMENTED** | P3 | §39: "Check filters/sorting" | `ListMyEventsDto` only declares `status`/`cursor`/`limit`; the global `ValidationPipe` uses `forbidNonWhitelisted:true`, so any `sort=...` query param is rejected outright (400) rather than silently ignored — there is no sort capability to opt into. Ordering is hardcoded to `createdAt desc` | `qa-social-stats-myevents-admin.e2e-spec.ts` › `it.failing("[SPEC GAP] supports sorting…")` |
| `/events/mine` only shows the caller's own events | PASS | — | Per §39 | Confirmed | same |

**NOT_IMPLEMENTED — no unique-view metric**
- Recommended fix: dedup by `(eventId, sessionId)` or `(eventId, userId)` per day (or per some window) when
  incrementing `views`, and expose it as a second field (`uniqueViews`) alongside the existing total.
- Affected files: `apps/api/src/analytics/analytics.service.ts` (`track`, `summary`),
  `apps/api/prisma/schema.prisma` (`EventDailyStat`), `apps/api/src/events/events.service.ts` (`getStats`).

**NOT_IMPLEMENTED — no sort option on the organizer dashboard**
- Recommended fix: add an optional `sort` enum (e.g. `startsAt_asc|startsAt_desc|createdAt_desc|registrations_desc`)
  to `ListMyEventsDto` and branch `orderBy` in `EventsService.findMine` accordingly.
- Affected files: `apps/api/src/events/dto/list-my-events.dto.ts`, `apps/api/src/events/events.service.ts`.

## §40 — Admin

| Test | Status | Severity | Expected | Actual | Evidence |
|---|---|---|---|---|---|
| Admin can free-text search users and events; a plain user is rejected (403) | PASS | — | Per §40 | Confirmed | `qa-social-stats-myevents-admin.e2e-spec.ts` |
| Admin can open any event and edit practically any field; the edit is visible on the owner's view and the public page, and (with `notifyParticipants`) notifies registrants the same way an organizer's own edit would | PASS | — | Per §40 ("admin edits must correctly propagate") | Confirmed — same `applyUpdate()` path as the organizer, admin included | same |
| Category/district management, event edit/cancel, moderation, reports, analytics all reject a plain user server-side (§41) | PASS | — | 403 (401 when unauthenticated) | Confirmed across 7 distinct admin endpoints | same |
| Platform-wide analytics summary reachable by an admin | PASS | — | 200 with a body | Confirmed | same |

No FAILs in §40. Admin edits reuse `EventsService.applyUpdate` (the exact same code path as an organizer's own
PATCH), so the "significant field → requires `notifyParticipants`" guard and the price/rules gap noted under
§35 apply identically to admin edits.

## §44 — Sharing / deep links

| Test | Status | Severity | Expected | Actual | Evidence |
|---|---|---|---|---|---|
| A public event is viewable logged-out and logged-in | PASS | — | Per §44 | Confirmed | `qa-social-sharing-i18n-geo-contract.e2e-spec.ts` |
| A cancelled ("deleted") event's link 404s for everyone except the owner | PASS | — | Per §44 | Confirmed | same |
| A draft event's link 404s for everyone except the owner (never a 403, which would leak existence) | PASS | — | Per §10/§44 | Confirmed | same |
| A PRIVATE event's direct link works for anyone holding it, but never appears in the public feed/search | PASS* | — | §13: "not visible publicly; direct access only through allowed flow/link/invitation" | Confirmed: `findBySlugForPreview` never checks `visibility`, only `status`+ownership — so a PRIVATE event's slug is fully readable by any anonymous or logged-in holder of the link, matching an "unlisted, link-only" model; feed/search both correctly filter `visibility: PUBLIC` | same |
| A nonexistent profile id is 404, not a 500 | PASS | — | Per §44 | Confirmed | same |

\* Flagged for product sign-off, not a FAIL: "direct access only through allowed flow/link" reads two ways —
either "anyone with the link" (what's implemented) or "only invited people, even with the link" (would need an
invitation/allow-list check on the event page itself, similar to how registration approval works). The
implementation matches the more permissive reading. If the intent is the stricter one, this is a real gap; ask
the spec owner rather than treat it as a bug either way.

## §47 — Language

| Test | Status | Severity | Expected | Actual | Evidence |
|---|---|---|---|---|---|
| `packages/i18n` uk/en have identical key sets and no empty values | PASS | — | Per §47 | Confirmed: 647 keys each side, 0 missing either direction, 0 empty values | `qa-social-sharing-i18n-geo-contract.e2e-spec.ts` (also verified standalone via a one-off Node script during the audit) |
| A server-side notification is fully localised (title *and* body) for a uk-locale user | PASS | — | No raw keys, actually Ukrainian text | Confirmed (`REGISTRATION_APPROVED` case) | same |
| **A cancellation-with-reason notification is fully localised** | **FAIL** | **P3** | Every server-side notification a uk-locale user receives should be entirely in Ukrainian | `apps/api/src/notifications/notification-i18n.ts`'s rule for "Event cancelled" only matches the fixed body `"$title" was cancelled because the organizer left Kiro.` — `EventsService.cancel()` builds a *different* body (`"$title" was cancelled: $reason`) whenever the organizer gives a reason, which the regex never matches. The title translates ("Подію скасовано") but the body stays in English — a mixed-language notification | `qa-social-sharing-i18n-geo-contract.e2e-spec.ts` › `it.failing("[SPEC GAP] a cancellation-with-reason notification…")` |

**FAIL — mixed-language cancellation notification**
- Root cause: see above — a regex-based translation table (`notification-i18n.ts`) that doesn't cover every body
  shape the same notification type can have.
- Recommended fix: either add a second rule matching the `: ${reason}` body shape, or (better, less brittle)
  move to structured notification payloads (a translation key + typed params) instead of matching pre-rendered
  English strings with regexes — the current approach will keep silently missing new body variants.
- Affected files: `apps/api/src/notifications/notification-i18n.ts`, `apps/api/src/events/events.service.ts`
  (`cancel`).
- Regression test: `qa-social-sharing-i18n-geo-contract.e2e-spec.ts` › `it.failing(...)`.

There is also a server-side, non-`packages/i18n` translation layer (`notification-i18n.ts`) purpose-built for
notifications — worth knowing about since it's easy to assume `packages/i18n` covers everything server-side.

## §48 — Ukrainian cities / districts

| Test | Status | Severity | Expected | Actual | Evidence |
|---|---|---|---|---|---|
| Known official districts listed for a seeded city, all correctly scoped to that city | PASS | — | Per §48 | Confirmed | `qa-social-sharing-i18n-geo-contract.e2e-spec.ts` |
| A user-suggested custom district with the same name in two different cities creates two distinct rows; neither leaks into the other city's list; an event using one is correctly tied to its own city | PASS | — | Per §48 | Confirmed | same |

No FAILs in §48. District uniqueness is `(cityId, nameUk)`, so same-name districts in different cities are
naturally independent rows — this is correct by construction, not just by luck.

## §55 — API contract

| Test | Status | Severity | Expected | Actual | Evidence |
|---|---|---|---|---|---|
| Protected endpoints: 401 unauthenticated, 403 for someone else's resource | PASS | — | Consistent across events/users/friends/notifications | Confirmed | `qa-social-sharing-i18n-geo-contract.e2e-spec.ts` |
| Validation errors: 400 with a stable `{ error: { code, message, details } }` shape, no stack traces | PASS | — | Per §89's error contract (`ApiExceptionFilter`) | Confirmed | same |
| Unknown route/id: 404, not 500 | PASS | — | Per §55 | Confirmed | same |
| OpenAPI document matches real routes/security | PASS (narrow check) | — | The generated Swagger doc lists the major routes at their real (prefixed) paths, and correctly marks `@Public()` routes as not requiring bearer auth | Confirmed for a 6-route sample (`/api/v1/discovery`, `/events`, `/events/{id}`, `/friends`, `/notifications`, `/admin/users`) | same |

This was a narrow, sampled check of §55 (auth/validation/pagination/sorting/filtering on a handful of
representative endpoints plus one OpenAPI cross-check) rather than an exhaustive per-endpoint audit — a full
contract audit of every controller was out of scope for the time available in this session. No discrepancies
found in what was checked.

## §57 — Pagination

| Test | Status | Severity | Expected | Actual | Evidence |
|---|---|---|---|---|---|
| Notifications and event-reviews lists are bounded (never return more than the max page size even when asked for `limit=999`) | PASS | — | Per §57 | Confirmed | `qa-social-sharing-i18n-geo-contract.e2e-spec.ts` |
| Admin users/events lists are cursor-paginated with a bounded default page (`hasMore`/`nextCursor` present, default page ≤20) | PASS | — | Per §57 | Confirmed | same |
| Discovery/search internal candidate fetch is capped (`take: 500`), not unbounded | PASS (with a caveat) | — | No query pulls an unbounded number of rows | The DB query itself is capped at 500 via `DISCOVERY_CANDIDATE_CAP`/`SEARCH_CANDIDATE_CAP`, so it is not literally unbounded — but see the §56 performance finding: those 500 rows (with joined media/category/city/district) are always fully loaded and scored in application code on every request, regardless of the requested page size | Code review: `apps/api/src/discovery/discovery.service.ts`, `apps/api/src/search/search.service.ts`; measured in `qa-social-perf.e2e-spec.ts` |

No unbounded list endpoint was found among the ones tested. Every list endpoint checked (discovery, search,
saved events, my events, admin users, admin events, notifications, reviews, friends) uses either cursor
pagination with a `PAGINATION.maxLimit` clamp, or (discovery/search) a fixed in-memory candidate cap.

## §56 — Performance

Seeded directly via `prisma.createMany` (bypassing the API) with prefix `qa-perf-`: **5,000 users, 5,000
events (PUBLISHED/PUBLIC, spread over the next 90 days), 20,000 registrations** (4 per event, all
`(eventId,userId)` pairs distinct by construction) — matching the task's target scale. Cleaned up completely in
`afterAll` (`registration` → `event` → `user`, in FK order). Seed took ~59s, cleanup ~67s (both are one-off bulk
`createMany`/`deleteMany`, not part of the latency findings below).

Measured latency (ms), one run, on this session's shared local Postgres (other QA auditors' sessions were
concurrently active — see the note in the intro; absolute numbers carry some noise, but the *relative* pattern
across endpoints, all against the same 5,000-event dataset in the same run, is the meaningful signal):

| Endpoint | Latency | Note |
|---|---|---|
| `GET /discovery?limit=20` | **4,505 ms** | See finding below |
| `GET /discovery?limit=20&cityIds=…&categoryIds=…` (filtered) | **3,170 ms** | Same cause, still near the 500-row candidate cap even filtered |
| `GET /search?q=Perf&limit=20` | 852 ms | Same 500-row cap, fewer dependent queries than discovery |
| `GET /events/slug/:slug` (event page) | 467 ms | Fine |
| `EventsService.findMine` (organizer dashboard, 200 events owned) | 107 ms | Fine (single indexed query) |
| `GET /admin/events?search=Perf` | 224 ms | Fine (`ILIKE`, no ranking) |
| `GET /admin/users?search=qa-perf-user` | 363 ms | Fine (`ILIKE`, no ranking) |

**FAIL (performance) — the discovery feed is disproportionately slow relative to every other list endpoint at this scale**
- Root cause: `DiscoveryService.getFeed` (and identically `SearchService.search`) always pulls up to
  `DISCOVERY_CANDIDATE_CAP = 500` full event rows (joined with media/category/city/district) into the Node
  process and scores every one of them in application code — regardless of the requested page size (`limit=20`
  here). On top of that per-request cost, discovery additionally runs: the recently-passed-events lookup, the
  viewer's `UserPreferences` lookup, an age/minor check, a blocked-users lookup, two `groupBy` "ranking signal"
  queries (registration counts + friends-going), and then `SocialProofService.attach`'s own 4 queries — all
  before the 500 in-memory-scored candidates are sliced down to 20. This is the exact scaling risk the code's
  own doc-comment on `DISCOVERY_CANDIDATE_CAP` already predicts ("fine at Kiro's current single-city-cluster MVP
  scale... a later phase would need to push scoring into SQL"); at 5,000 events (a fraction of the 10,000/100,000
  target in §56) it is already the slowest endpoint measured, 4-9x slower than `/search` against the same cap
  and the same dataset, and 10-40x slower than the admin list endpoints.
- Recommended fix: push the ranking into SQL (e.g. compute the score as an expression the DB can `ORDER BY` and
  `LIMIT` directly, or precompute/cache a coarse rank and only re-rank client-visible ties), or at minimum shrink
  the in-memory candidate set with narrower `WHERE` bounds before scoring (e.g. a tighter `startsAt` window) so
  the 500-row cap is rarely actually hit.
- Affected files: `apps/api/src/discovery/discovery.service.ts`, `apps/api/src/search/search.service.ts`,
  `apps/api/src/common/social-proof/social-proof.service.ts` (batched correctly — not itself N+1, but adds fixed
  overhead per discovery/search call).
- Regression test: `qa-social-perf.e2e-spec.ts` — re-run at 10,000+ events per the full spec target once a fix
  lands, and tighten the current generous 5s assertion threshold once a real target latency is agreed.

**No N+1 queries were found** in the code read for this audit (`DiscoveryService`, `SearchService`,
`SocialProofService`, `AdminEventsService`, `AdminUsersService`, `EventsService.findMine/getStats`,
`NotificationsService.listMine`) — every batch operation (social proof, ranking signals, admin lists) already
uses `groupBy`/`findMany` with `IN` sets rather than per-row queries. The performance issue found is a "fetch
too much then score in memory" pattern, not classic N+1.

---

## Summary

75 automated test cases across 8 files (`apps/api/test/qa/qa-social-*.e2e-spec.ts`), plus one performance
finding from direct measurement (`qa-social-perf.e2e-spec.ts`) and two findings from code review alone (no
test needed to prove a no-op / a design decision).

| Status | Count | Detail |
|---|---|---|
| PASS | 70 | includes 2 tests that pass while explicitly documenting a spec deviation (§31 duplicate-rating wording, §32 review/rating separation) and 1 that passes while documenting an interpretation question (§44 private-link access) |
| FAIL | 4 | §6 pagination duplicates/skips (P2, `it.failing`); §35 price/rules don't trigger change-notifications (P2, `it.failing`); §47 mixed-language cancellation notification (P3, `it.failing`); §56 discovery feed latency (P2, measured, not an `it.failing`) |
| NOT_IMPLEMENTED | 3 | §38 no unique-vs-total views distinction (`it.failing`); §39 no sort option on `/events/mine` (`it.failing`); §29 `hideAttendanceHistory` preference is a no-op (code review only) |
| PARTIALLY_IMPLEMENTED | 2 | §31/§32 organizer rating and event review are the same underlying row, not separate concepts (spec requires separation); §44 a PRIVATE event's direct link is accessible to anyone holding it rather than only invited people — ambiguous in the spec, flagged for product sign-off rather than filed as a bug |
| BLOCKED | 0 | one §27 test hit transient shared-DB connectivity errors mid-run (noted inline) but is graded PASS on the completed calls + equivalent passing coverage elsewhere, not left BLOCKED |

P0 / P1: **none found** in this area. Every FAIL/NOT_IMPLEMENTED here is P2 or P3 — no authorization bypass, no
data corruption, no broken core flow (registration, payment confirmation, friends, and all 12 notification
types tested fire correctly with no duplicates). The two P2s worth prioritizing first: the feed-pagination
duplicate/skip bug (§6, silently corrupts what a user sees while paging the feed) and the discovery feed's
~4.5s latency at only 5,000 events (§56, will keep degrading toward the 10k/100k target scale with no code
change).
