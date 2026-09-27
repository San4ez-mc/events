# Kiro QA — Security & Validation Audit

Scope: QA acceptance-test spec sections **3** (smoke/registration), **4**
(auth/authorization, IDOR), **5** (profile privacy), **41** (admin security),
**42** (moderation policy), **43** (reports), **50** (security), **51**
(input validation), **58** (error handling).

- Environment: local Postgres (embedded-postgres, `kiro_test` @
  `localhost:5544`, migrations + seed already applied), in-process Nest app
  (`apps/api/test/qa/qa-security.e2e-spec.ts`, Jest + supertest, same
  bootstrap as `main.ts` via `configureApp`).
- Rate-limiting / brute-force tests were run against a **second, separately
  built process** (`pnpm build` then `node dist/src/main.js`, `PORT=3199`,
  `NODE_ENV=development`, `DATABASE_URL` pointed at the same local test
  Postgres) rather than only by reading `@Throttle`/`@RateLimit` decorators —
  `NODE_ENV=test` lifts every limit for the in-process Jest suite
  (`apps/api/src/common/throttle.ts`), so a live process was the only way to
  observe real enforcement. That process was stopped after the checks
  (specific PID, never a broad `taskkill`); it never touched the VPS.
- Every other finding below is a real request/assertion, either from the
  automated suite or from an equivalent one-off `fetch()` against that same
  live process (noted per-row). No `apps/*/src` or `packages/*` file was
  modified — this is an audit only.
- Command to reproduce: from `apps/api`, `$env:DATABASE_URL='postgresql://kiro:kiro@localhost:5544/kiro_test'` (PowerShell) then `pnpm test:e2e --testPathPattern qa-security`.

## Summary

| Status | Count |
|---|---|
| PASS | 36 |
| FAIL | 4 |
| BLOCKED | 0 |
| NOT_IMPLEMENTED | 0 |
| **Total** | **40** |

(Counts match the 40 `it`/`it.failing` cases in `qa-security.e2e-spec.ts` 1:1 — every row in this report's tables below corresponds to exactly one automated test, except the two "see above" cross-references in the §50 table, which restate an §4/§41 result rather than adding a new one.)

Severity of the 4 FAILs: **P2 × 4**, no P0/P1. There is **no known
authorization bypass** and **no known data leak** in this audit's scope —
every IDOR, admin-role, and phone/email-privacy check passed. All 4 FAILs are
input-validation/robustness gaps (wrong data accepted, or the wrong HTTP
status returned for a malformed/oversized request) — real bugs worth fixing,
but none of them let one user read or modify another user's data, and none
of them leak a stack trace or internal detail.

---

## §3 — Smoke / registration

| ID | Status | Expected | Actual | Evidence |
|---|---|---|---|---|
| ST-03a | PASS | Register → usable access token → `GET /users/me` works → same credentials log in | Confirmed | `qa-security.e2e-spec.ts` "ST-03a" |
| ST-03b | PASS | Duplicate email is rejected (400/409), not silently overwritten | 400 `VALIDATION_ERROR`-shaped rejection | "ST-03b" |
| ST-03c | PASS | Missing/invalid email, missing password, too-short password all rejected (400) | Confirmed | "ST-03c" |

## §4 — Authentication / authorization / IDOR

| ID | Status | Expected | Actual | Evidence |
|---|---|---|---|---|
| AUTH-01 | PASS | Protected endpoint, no token → 401 | Confirmed (`/users/me`, `/events/mine`) | "AUTH-01" |
| AUTH-02 | PASS | Wrong password → 401, generic `INVALID_CREDENTIALS` (doesn't reveal whether the email exists) | Confirmed | "AUTH-02" |
| AUTH-03 | PASS | A JWT signed with a different secret is rejected, never trusted | 401 | "AUTH-03" |
| AUTH-04 | PASS | A malformed bearer token is rejected cleanly (401), not a 500 | Confirmed | "AUTH-04" |
| IDOR-01 | PASS | USER_A cannot `PATCH` USER_B's event | 403, event unchanged | "IDOR-01" |
| IDOR-02 | PASS | USER_A cannot publish/cancel USER_B's event | 403 both | "IDOR-02" |
| IDOR-03 | PASS | A non-organizer/non-collaborator cannot list, approve, or reject another organizer's registrations | 403 on `GET .../registrations`, `.../approve`, `.../reject` | "IDOR-03" |
| IDOR-04 | PASS | `PATCH /users/me` only ever mutates the caller's own row | Confirmed | "IDOR-04" |

**Root cause of the good result:** every event-scoped write goes through `EventAccessService.assertPermission` (`apps/api/src/organizer/event-access.service.ts`), which checks `ownerId === userId` or a collaborator grant before returning the row; there is no path that trusts a client-supplied owner/user id. `JwtAuthGuard` + `RolesGuard` are registered as global `APP_GUARD`s (`apps/api/src/app.module.ts`), so this isn't opt-in per controller.

## §5 — Profile privacy

| ID | Status | Expected | Actual | Evidence |
|---|---|---|---|---|
| PROFILE-01 | PASS | `GET /users/:id/profile` never includes `phone` or `email`, for an anonymous viewer, an authenticated stranger, or a viewer with a token | Confirmed — response has no `phone`/`email` key at all, and the raw phone value never appears in the JSON | "PROFILE-01" |
| PROFILE-02 | PASS | `phone` is optional and can be omitted from a profile entirely | Confirmed | "PROFILE-02" |

**Root cause of the good result:** `UsersService.getPublicProfile` (`apps/api/src/users/users.service.ts`) selects from a fixed `PUBLIC_PROFILE_SELECT` (id/name/nickname/avatarUrl/bio/createdAt/socialLinks) and builds the response by hand — it never spreads the full `user` row, so there's no accidental field leak even if the schema grows more private fields later.

## §41 — Admin security (exhaustive sweep)

Swept **every** `/admin/*` route across all 11 admin controllers (users, events, moderation, reports, categories, districts, credits, payments, audit, analytics, reviews) plus the two admin-gated routes that live outside the `/admin/*` prefix (`PUT /admin/flags/:key`, `PUT /admin/app-version/:platform`) and one bonus admin-gated route elsewhere (`PATCH /payments/orders/:id/confirm-manual`) — 28 method+path combinations in total, covering GET/POST/PATCH/PUT.

| ID | Status | Expected | Actual | Evidence |
|---|---|---|---|---|
| ADMIN-SEC-401 | PASS | Every admin route rejects a request with **no token** → 401 | All 28/28 routes returned 401 | "ADMIN-SEC-401" |
| ADMIN-SEC-403 | PASS | Every admin route rejects a normal authenticated **USER**-role token → 403 | All 28/28 routes returned 403 | "ADMIN-SEC-403" |

This is on top of `admin.e2e-spec.ts`'s existing coverage (403-only sweep of 6 GET routes, plus full functional MODERATOR/ADMIN/SUPER_ADMIN role-boundary tests for users/events/categories) — this audit specifically closes the "no token at all" (401) gap and extends the 403 sweep to every mutating admin route (merge, adjust-credits, approve/reject, resolve, cancel, flags, app-version), not just the six GETs.

**Root cause of the good result:** `RolesGuard` and `JwtAuthGuard` are both registered as global `APP_GUARD`s (`apps/api/src/app.module.ts`), and every admin controller class carries `@Roles(...)` (`apps/api/src/admin/**/*.controller.ts`) — access control is enforced by the framework's guard pipeline before any handler runs, not by a per-route check that could be forgotten. Hiding the admin UI is explicitly *not* what's protecting this.

## §42 — Moderation policy

| ID | Status | Expected | Actual | Evidence |
|---|---|---|---|---|
| MOD-01 | PASS | Sexual-services content is hard-rejected at publish; event never goes live | `POST .../publish` → 400, event `status` becomes `REJECTED` in DB | "MOD-01" |
| MOD-02 | PASS | War-related content is held as `PENDING_MODERATION` (not blocked outright) and opens a `ModerationCase` with `reasonCode: WAR_RELATED` | Confirmed | "MOD-02" |
| MOD-03 | PASS | An ordinary, legal 18+ educational-workshop description is **not** blanket-blocked | `POST .../publish` → 201, `status: PUBLISHED` | "MOD-03" |
| MOD-04 | PASS | A MODERATOR can approve a flagged event from the queue, which then becomes `PUBLISHED` | Confirmed | "MOD-04" |

**Root cause of the good result:** `SensitiveContentService.scan` (`apps/api/src/moderation/sensitive-content.service.ts`) is a narrow two-tier keyword scan (REJECT for illegal-goods/sexual-services terms, FLAG for war-related terms) that explicitly does *not* flag "adult but legal" content — the organizer's own `ageRestriction` field is the mechanism for that, matching the spec's "do not blanket-block adult educational events" instruction. This matches the existing unit coverage in `sensitive-content.service.spec.ts`; this audit adds the missing *end-to-end* proof (through `publish()`, into the DB, through the moderator's approve action) that the unit test alone couldn't show.

## §43 — Reports

| ID | Status | Expected | Actual | Evidence |
|---|---|---|---|---|
| REPORT-01 | PASS | A user can file a report; a normal user cannot see or resolve the report queue | `POST /reports` → 201; `GET /admin/reports` as that same user → 403 | "REPORT-01" |
| REPORT-02 | **Note, not a hard FAIL** | Duplicate report handling is undefined by the spec ("test duplicate report") | The same user can file the identical report twice; both are recorded as separate rows, no dedup/rate-limit | "REPORT-02" |
| REPORT-03 | PASS | A MODERATOR can list and resolve (`RESOLVED`/`DISMISSED`) a report | Confirmed | "REPORT-03" |

**REPORT-02 detail (P3, not counted in the FAIL total):** `ReportsService.create` (`apps/api/src/reports/reports.service.ts`) has no uniqueness constraint or cooldown on `(reporterId, targetType, targetId)`, so the same user can spam-file the same report indefinitely — each is a full row a moderator has to look at. Not a security hole (reporter identity is only ever shown to MODERATOR+ via `admin/reports`, never to the public or the reported party), just a moderation-queue hygiene gap. Recommended fix: a unique constraint (or an app-level check) on `(reporterId, targetType, targetId, status)` so a second identical report updates/bumps the existing one instead of creating a duplicate. Affected file: `apps/api/src/reports/reports.service.ts`.

---

## §50 — Security

| ID | Status | Severity | Expected | Actual | Evidence |
|---|---|---|---|---|---|
| SEC-01 (SQLi) | PASS | — | SQL-injection-shaped strings in login/slug params are treated as inert data | Login with `a' OR '1'='1'` → 400 (fails `IsEmail`); slug lookup with `'; DROP TABLE users; --` → 404, `user` table row count unchanged | "SEC-01" |
| SEC-02 (XSS storage) | PASS | — | An XSS-shaped payload (`<script>...</script>`) is stored and returned as inert literal text, never executed/transformed server-side | Confirmed byte-for-byte round-trip | "SEC-02" |
| IDOR (cross-user) | PASS | — | See §4 IDOR-01..04 above | — | — |
| Admin bypass | PASS | — | See §41 above | — | — |
| Token misuse | PASS | — | Forged-secret / malformed tokens rejected (see AUTH-03/04); mass-assignment via extra body fields rejected outright (`forbidNonWhitelisted`) | Confirmed | "SEC-03" |
| Malicious file upload | PASS | — | A text file with a `.png` filename/MIME is rejected — content is sniffed by magic bytes, not trusted from the extension/MIME | 400 `INVALID_FILE_TYPE` | "SEC-04" |
| Malicious URL | PASS | — | `javascript:` scheme for `onlineUrl` is rejected | 400 | "SEC-05" |
| **SEC-06 (oversized payload)** | **FAIL** | **P2** | An oversized JSON body is rejected as a client error (413, or at worst 400) | **500 `INTERNAL_ERROR`** for any JSON body over Express's default ~100KB limit | `qa-security.e2e-spec.ts` "SEC-06" (`it.failing`); confirmed live via the second process at 150KB/1MB payloads too |
| Rate limiting (config) | PASS | — | Global default 120 req/min/IP (`ThrottlerModule.forRoot`), tighter per-route limits on sensitive endpoints | Confirmed by reading `apps/api/src/app.module.ts` + `apps/api/src/common/throttle.ts` + every `@RateLimit`/`@Throttle` call site | code review |
| **RATE-01 (brute-force login, live)** | PASS | — | `POST /auth/login` (`@RateLimit(10)`, i.e. 10/min) starts rejecting further attempts once the limit is hit | Live: 10× 401 then 429 on the 11th–15th attempt against the same IP within the window; `x-ratelimit-limit/remaining/reset` headers present | live `fetch()` against `node dist/src/main.js` on port 3199 |
| **RATE-02 (register limit, live)** | PASS | — | `POST /auth/register` (`@RateLimit(10)`) is similarly capped | Not separately load-tested live (same code path/decorator as login) — verified by decorator inspection only | code review (`RateLimit(10)` in `auth.controller.ts`) |

**SEC-06 root cause:** `configureApp` (`apps/api/src/bootstrap.ts`) never sets a JSON body-size limit, so Express/`body-parser` uses its default (~100KB). When a request exceeds it, `body-parser` throws a `PayloadTooLargeError` (with `.status === 413`) *before* Nest's routing even runs. `ApiExceptionFilter.toApiError` (`apps/api/src/common/filters/api-exception.filter.ts`) only special-cases `ApiException` and `HttpException` instances — `PayloadTooLargeError` is neither, so it falls into the generic "unknown/unhandled" branch and comes back as a bare 500. No stack trace leaks (the message is the generic "Internal server error"), so §58's core requirement still holds — this is a wrong-status-code bug, not an information-disclosure bug.
**Recommended fix:** in `apps/api/src/common/filters/api-exception.filter.ts`, add a branch that recognizes `(exception as any)?.status === 413 || (exception as any)?.type === "entity.too.large"` and maps it to a 413 `ApiErrorBody` before the generic fallback; optionally also set an explicit, generous JSON limit (e.g. `app.use(json({ limit: "2mb" }))` in `bootstrap.ts`) so the ceiling is a deliberate product decision rather than body-parser's default.
**Affected files:** `apps/api/src/common/filters/api-exception.filter.ts`, `apps/api/src/bootstrap.ts`.
**Regression test:** `qa-security.e2e-spec.ts` "SEC-06" (currently `it.failing` — flip to a normal `it` once fixed).

---

## §51 — Input validation

| ID | Status | Severity | Expected | Actual | Evidence |
|---|---|---|---|---|---|
| VAL-01 (empty string) | PASS | — | Empty `title` rejected | 400 | "VAL-01" |
| VAL-02 (very long string) | PASS | — | `title` over 200 chars rejected | 400 | "VAL-02" |
| VAL-03/04 (HTML/JS/Unicode/Cyrillic/emoji) | PASS | — | Accepted and preserved exactly (not over-restricted; no server-side mangling) | Confirmed byte-for-byte | "VAL-03/04" |
| VAL-05 (malformed URL) | PASS | — | A non-URL string for `onlineUrl` rejected | 400 | "VAL-05" |
| VAL-06 (negative price) | PASS | — | Negative `price` rejected | 400 | "VAL-06" |
| VAL-07 (negative/zero capacity) | PASS | — | Negative and zero `capacity` both rejected (`@Min(1)`) | 400 both | "VAL-07" |
| VAL-08 (invalid date) | PASS | — | A malformed date string for `startsAt` rejected | 400 | "VAL-08" |
| **VAL-09 (past dates)** | **FAIL** | **P2** | An event whose `startsAt` is already in the past cannot be published | **Publishes successfully (201, `status: PUBLISHED`)** with `startsAt` 30 days in the past | `qa-security.e2e-spec.ts` "VAL-09" (`it.failing`); confirmed live |
| **VAL-10 (invalid time range)** | **FAIL** | **P2** | `endsAt` before `startsAt` is rejected | **Accepted (200)** and stored as-is, inverted | `qa-security.e2e-spec.ts` "VAL-10" (`it.failing`); confirmed live |

**VAL-09 root cause:** neither `UpdateEventDto` (`apps/api/src/events/dto/update-event.dto.ts`) nor `EventsService.assertPublishable` (`apps/api/src/events/events.service.ts`, ~line 660) ever compares `startsAt` to `new Date()`. `assertPublishable` only checks that required fields are *present*, not that `startsAt` is in the future. A published event with a past `startsAt` would likely be filtered out of the discovery feed by its own `startsAt` ordering/filters, but it is directly reachable by slug/link and shows as a "live" `PUBLISHED` event in the owner's dashboard and via `GET /events/slug/:slug` to any visitor.
**Recommended fix:** add a check in `assertPublishable` (or a dedicated validator) that rejects publishing when `event.startsAt <= new Date()`, with a clear `VALIDATION_ERROR`. Consider whether editing an *already-published* event to move `startsAt` into the past should be blocked too (currently also unchecked, per VAL-10's neighboring gap).
**Affected files:** `apps/api/src/events/events.service.ts` (`assertPublishable`), possibly `apps/api/src/events/dto/update-event.dto.ts` if a DTO-level check is preferred for the plain "past date on save" case.
**Regression test:** `qa-security.e2e-spec.ts` "VAL-09".

**VAL-10 root cause:** there is no cross-field validation anywhere in the update/publish path comparing `endsAt` to `startsAt` — `UpdateEventDto` validates each field independently (`@IsISO8601()` on each), and `EventsService.applyUpdate`/`assertPublishable` never compare the two. An organizer (or a scripted/malicious client) can set an event that "ends" before it "starts", which would render oddly anywhere duration is computed or displayed.
**Recommended fix:** add a class-validator cross-field check on `UpdateEventDto` (e.g. a custom `@Validate` decorator, since class-validator's built-in `MinDate` can't reference a sibling field) or a service-level check in `applyUpdate`/`assertPublishable` that rejects `endsAt <= startsAt` when both are present (considering that `endsAt` is optional and can arrive in a different PATCH than `startsAt`, so the check needs the *resulting* merged event, not just the DTO in isolation).
**Affected files:** `apps/api/src/events/events.service.ts` (`applyUpdate`, `assertPublishable`), `apps/api/src/events/dto/update-event.dto.ts`.
**Regression test:** `qa-security.e2e-spec.ts` "VAL-10".

---

## §58 — Error handling: no stack traces in responses

| ID | Status | Severity | Expected | Actual | Evidence |
|---|---|---|---|---|---|
| ERR-01 | PASS | — | A 404 for an unknown resource is a clean JSON error with no stack frames | Confirmed | "ERR-01" |
| ERR-02 | PASS | — | A 400 validation error has the stable `{error:{code,message,details}}` shape, no `node_modules`/`.ts:` internals | Confirmed | "ERR-02" |
| **ERR-03 (malformed UUID param)** | **FAIL (status only)** | **P2** | A malformed id in a URL param (e.g. `not-a-uuid`) should be a clean 400 | **500 `{"error":{"code":"INTERNAL_ERROR","message":"Internal server error"}}`** — importantly, **no stack trace or file path leaks** in the response body | `qa-security.e2e-spec.ts` "ERR-03" (`it.failing` on the status-code expectation only); server log confirms the underlying `PrismaClientKnownRequestError` is only logged server-side, never sent to the client |

**This is the most important nuance in the whole report:** §58's actual ask — "no stack traces in production" — **passes**. `ApiExceptionFilter.catch` (`apps/api/src/common/filters/api-exception.filter.ts`) always normalizes any exception it doesn't recognize to a generic `{code:"INTERNAL_ERROR", message:"Internal server error"}` body, and only logs the real stack server-side (`this.logger.error(..., exception.stack)`) when `status >= 500`. That behavior does **not** vary with `NODE_ENV` — it's the same in the `NODE_ENV=development` live process used for the rate-limit checks as in the `NODE_ENV=test` suite. What's wrong is only the **status code**: an obviously-malformed UUID path param (`GET /users/not-a-uuid/profile`, or any `:id` route backed by a Postgres `uuid` column) isn't validated as a UUID before hitting Prisma, so Postgres's own "invalid input syntax for type uuid" error propagates up as an unrecognized `PrismaClientKnownRequestError` and gets the filter's generic-500 treatment instead of a 400.
**Recommended fix:** add a `ParseUUIDPipe` (or equivalent custom pipe) on `:id`/`:userId`/`:eventId`/etc. path params across controllers that expect a UUID, so a malformed id is rejected as a 400 by the pipe layer before it ever reaches Prisma. This is a broad, mechanical change (every controller with a `@Param("id") id: string` that's used in a `where: { id }` Prisma call), so it's reported here as one representative finding rather than enumerated per-controller.
**Affected files (representative):** `apps/api/src/users/users.controller.ts` (`getPublicProfile`), and by the same pattern any other `@Param()`-fed Prisma lookup — `apps/api/src/events/events.controller.ts`, `apps/api/src/admin/**/*.controller.ts`, etc.
**Regression test:** `qa-security.e2e-spec.ts` "ERR-03".

---

## Test suite

- File: `apps/api/test/qa/qa-security.e2e-spec.ts` — 40 tests (36 plain `it`, 4 `it.failing` for the confirmed defects above so the suite stays green while still asserting the *correct* expectation).
- Run: `pnpm test:e2e --testPathPattern qa-security` from `apps/api`, with `DATABASE_URL` pointed at the local test Postgres.
- Cleanup: `afterAll` deletes every row (users, events, registrations, media, price options, FAQ items, moderation cases, reports, credit ledger entries) whose owning user's email starts with `qa-sec-` — this also mops up the handful of users created by the one-off `fetch()` checks against the live second process, since those reused the same prefix.
- Rate-limiting/brute-force: verified live (see §50 above), not just by decorator inspection, using a second process built from the current tree (`pnpm build` → `node dist/src/main.js`, `PORT=3199`, `NODE_ENV=development`, `DATABASE_URL` pointed at the same local test Postgres) which was stopped by its own PID afterward.
- **Final run: 40/40 passing** (36 real passes + 4 `it.failing` correctly failing-as-expected, 0 unexpected failures), confirmed clean on the last of 5 full runs during this audit.
- **Observed transient flakiness during earlier runs (environment, not product):** several of the intermediate runs (while the test file itself was still being debugged, and once more afterward) hit a bare 500 on `PROFILE-01` or, once, on the whole suite's `beforeAll`, with the server/Prisma log reading `PrismaClientKnownRequestError`/`PrismaClientInitializationError: Can't reach database server at localhost:5544` — a transient connection drop against the shared local `kiro_test` Postgres, not a validation/business-logic error, and never a case where phone/email actually leaked. A live check during one such episode found the DB itself healthy and reachable moments later (`pg_stat_activity` showed 22/100 connections in use — nowhere near exhausted), so this reads as a brief blip on this shared local instance (each full run opens/closes several hundred short-lived connections over 8-13 minutes) rather than a systemic pool-exhaustion issue in the product's own Prisma config. If this suite is flaky in CI/on-call, treat a `PrismaClientKnownRequestError: Can't reach database server` failure as an infra retry candidate, not a regression, and re-run.

## Files touched by this audit

- `apps/api/test/qa/qa-security.e2e-spec.ts` (new)
- `docs/qa/QA_security.md` (this file)

No file under `apps/*/src` or `packages/*` was modified.
