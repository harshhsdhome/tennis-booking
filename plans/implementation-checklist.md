# Implementation Checklist — Tennis Court Booking System

## How to Use This File

Each sub-task is designed to be implemented independently in sequence.
In Agent mode, reference this file alongside `plans/architecture.md` and `plans/database-schema.md`.
After completing each sub-task, update its status from `[ ] pending` to `[x] done`.

---

## Sub-Task 1 — Project Scaffold & Docker Setup

**Status:** `[ ] pending`

**Intent:**
Bootstrap the TypeScript project, install dependencies, configure Docker Compose, and verify the app starts and connects to Postgres.

**Expected Outcomes:**
- `docker compose up` starts Postgres and the app without errors.
- `GET /health` returns `200 OK`.
- TypeScript compiles with `tsc --noEmit`.

**Todo List:**
1. Initialise `package.json` with `name`, `version`, `scripts` (`dev`, `build`, `start`, `migrate`).
2. Install runtime dependencies: `express`, `pg`, `bcrypt`, `jsonwebtoken`, `dotenv`.
3. Install dev dependencies: `typescript`, `ts-node`, `nodemon`, `@types/*`, `jest`, `supertest`, `@types/supertest`, `ts-jest`.
4. Create `tsconfig.json` with `strict: true`, `outDir: dist`, `rootDir: src`.
5. Create `.env.example` with all required env vars (see `plans/architecture.md` Environment Variables).
6. Create `docker-compose.yml` with `db` (postgres:16-alpine) and `app` services.
7. Create `Dockerfile` for the app (development: `ts-node`, production: compiled `dist/`).
8. Implement `src/config.ts` — read and validate env vars, throw on missing required vars.
9. Implement `src/db/pool.ts` — export a single `pg.Pool` instance.
10. Implement `src/db/migrate.ts` — migration runner (see `plans/database-schema.md` Migration Runner Logic).
11. Create all migration SQL files in `src/db/migrations/` (001 through 005 per `plans/database-schema.md`).
12. Implement `src/server.ts` — create Express app, register `express.json()`, mount `/health` route.
13. Implement `src/index.ts` — call `runMigrations()`, then `app.listen(PORT)`.
14. Verify: `docker compose up`, `curl localhost:3000/health` returns `200`.

**Relevant Context:**
- `plans/architecture.md` → Directory Structure, Docker Compose, Environment Variables sections.
- `plans/database-schema.md` → all migration files and Migration Runner Logic.

---

## Sub-Task 2 — Core Infrastructure: AppError + errorHandler + logger

**Status:** `[ ] pending`

**Intent:**
Establish the shared error and logging infrastructure that all subsequent sub-tasks depend on.

**Expected Outcomes:**
- `AppError` can be thrown anywhere and `errorHandler` serialises it to `{ error, code, details }`.
- Unhandled errors produce `500 INTERNAL_SERVER_ERROR` without leaking stack traces.
- Logger writes structured JSON to stdout.

**Todo List:**
1. Implement `src/errors/AppError.ts` — class with `httpStatus`, `code`, `message`, `details?`.
2. Implement `src/middleware/errorHandler.ts` — Express error-handling middleware (4-arg signature). Handle `AppError` vs unknown errors per NFR-3.
3. Implement `src/utils/logger.ts` — structured JSON logger with `info(action, meta)` and `warn(action, meta)` methods (NFR-2).
4. Register `errorHandler` as the **last** middleware in `src/server.ts`.
5. Write a unit test confirming `AppError` is serialised correctly by `errorHandler`.

**Relevant Context:**
- `requirements.md` § NFR-3 — error response shape `{ error, code, details }` and all valid error codes.
- `requirements.md` § NFR-2 — log fields for `BOOKING_CREATED` and `BOOKING_CANCELLED`.
- `plans/architecture.md` → `AppError`, `errorHandler`, Request Flow sections.

---

## Sub-Task 3 — Time Utilities

**Status:** `[ ] pending`

**Intent:**
Centralise all time/date arithmetic used by business rules into one tested utility module so business rule implementations are simple comparisons.

**Expected Outcomes:**
- `timeUtils.ts` exports helpers used by booking service.
- Unit tests cover all edge cases from BR-1 through BR-3 and BR-7.

**Todo List:**
1. Implement `src/utils/timeUtils.ts` with the following exports:
   - `parseHHmm(time: string): { hours: number; minutes: number } | null` — returns `null` if format is not exactly `HH:mm`.
   - `toMinutes(time: string): number` — converts `HH:mm` to minutes since midnight.
   - `isAlignedToHalfHour(time: string): boolean` — minutes must be `0` or `30` (BR-2).
   - `isWithinOperatingHours(startTime: string, endTime: string): boolean` — `startTime >= 06:00` and `endTime <= 22:00` and `startTime < endTime` (BR-1).
   - `getDurationMinutes(startTime: string, endTime: string): number`.
   - `isValidDateFormat(date: string): boolean` — strict `YYYY-MM-DD`, reject invalid calendar dates like `2025-02-30`.
   - `combineDateAndTime(date: string, time: string): Date` — constructs a JS `Date` in server-local time.
   - `isFutureDateTime(date: string, time: string): boolean` — `date + time > now` (BR-7, SD-5).
2. Write unit tests in `tests/unit/timeUtils.test.ts` covering all edge cases from BR-1, BR-2, BR-3, BR-7.

**Relevant Context:**
- `requirements.md` § BR-1, BR-2, BR-3, BR-7, SD-2 — all time constraints use `HH:mm` strings.
- `plans/architecture.md` → Key Constraints section — times are strings, arithmetic uses minutes-since-midnight.
- `plans/database-schema.md` → Overlap check query — string comparison of `HH:mm` works lexicographically within a single day.

---

## Sub-Task 4 — Authentication (Register + Login)

**Status:** `[ ] pending`

**Intent:**
Implement user registration and login endpoints with bcrypt password hashing and JWT issuance.

**Expected Outcomes:**
- `POST /auth/register` creates a user, returns `201` with JWT + `{ id, email, name }`.
- `POST /auth/login` validates credentials, returns `200` with JWT.
- Correct error codes for all error cases (AC-1, AC-2).
- Integration tests pass.

**Todo List:**
1. Implement `src/repositories/users.repository.ts`:
   - `findByEmail(email: string): Promise<User | null>`
   - `createUser(email: string, name: string, hashedPassword: string): Promise<User>`
2. Implement `src/services/auth.service.ts`:
   - `register(email, name, password)` — trim+lowercase email, validate format, hash password, call repo, sign JWT. Throw `AppError(409, 'EMAIL_ALREADY_EXISTS')` on duplicate. Throw `AppError(400, 'VALIDATION_ERROR')` for bad input.
   - `login(email, password)` — lowercase email, find user, compare bcrypt hash, sign JWT. Throw `AppError(401, 'INVALID_CREDENTIALS')` for any mismatch (no specifics — AC-2).
3. Implement `src/controllers/auth.controller.ts` — parse body, call service, return response.
4. Implement `src/routes/auth.routes.ts` — `POST /auth/register`, `POST /auth/login`.
5. Mount auth routes in `src/server.ts` at `/auth`.
6. Write integration tests in `tests/integration/auth.test.ts` covering AC-1 and AC-2 acceptance criteria and edge cases.

**Relevant Context:**
- `requirements.md` § AC-1, AC-2, SD-6.
- `plans/architecture.md` → Layers & Responsibilities, `AppError` section.

---

## Sub-Task 5 — Authentication Middleware

**Status:** `[ ] pending`

**Intent:**
Implement the `authenticate` middleware that protects booking endpoints.

**Expected Outcomes:**
- Protected routes reject missing/malformed/expired JWTs with `401 UNAUTHORIZED`.
- Valid JWTs attach `req.user` for downstream use.
- Public routes remain unaffected.

**Todo List:**
1. Implement `src/middleware/authenticate.ts`:
   - Extract `Bearer <token>` from `Authorization` header. Missing or wrong scheme → `AppError(401, 'UNAUTHORIZED')`.
   - Verify token with `jsonwebtoken`. Expired → `AppError(401, 'TOKEN_EXPIRED')`. Invalid → `AppError(401, 'UNAUTHORIZED')`.
   - Attach `req.user = { id, email }` on success.
2. Extend Express `Request` type in `src/types/express.d.ts` to include `user?: { id: number; email: string }`.
3. Add middleware to protected routes only: `POST /bookings`, `GET /bookings/mine`, `DELETE /bookings/:id/cancel`.
4. Add auth middleware integration tests to `tests/integration/auth.test.ts` covering AC-3 edge cases.

**Relevant Context:**
- `requirements.md` § AC-3 — lists exactly which endpoints are protected and which are public.
- `plans/architecture.md` → `authenticate.ts` middleware, Request Flow diagram.

---

## Sub-Task 6 — Courts Endpoints

**Status:** `[ ] pending`

**Intent:**
Implement `GET /courts` and `GET /courts/:id/availability`.

**Expected Outcomes:**
- `GET /courts` returns array of 3 seeded courts (FR-1).
- `GET /courts/:id/availability?date=YYYY-MM-DD` returns `{ freeSlots, bookedSlots }` (FR-2).
- Correct errors for missing/invalid date and unknown court ID.

**Todo List:**
1. Implement `src/repositories/courts.repository.ts`:
   - `getAllCourts(): Promise<Court[]>`
   - `findCourtById(id: number): Promise<Court | null>`
   - `getActiveBookingsForCourtOnDate(courtId: number, date: string): Promise<Booking[]>`
2. Implement `src/services/courts.service.ts`:
   - `listCourts()` — return all courts.
   - `getAvailability(courtId, date)`:
     - Validate `date` format via `timeUtils.isValidDateFormat`. Throw `AppError(400, 'VALIDATION_ERROR')` if invalid.
     - Verify court exists. Throw `AppError(404, 'COURT_NOT_FOUND')` if not.
     - Fetch active bookings for court+date.
     - Apply lazy completion: identify completed bookings, persist updates, exclude them.
     - Compute `freeSlots` by subtracting active booking intervals from `[06:00, 22:00]` window.
     - Return `{ freeSlots, bookedSlots }`.
3. Implement `src/controllers/courts.controller.ts` and `src/routes/courts.routes.ts`.
4. Mount courts routes in `src/server.ts` at `/courts` (no auth middleware).
5. Write integration tests in `tests/integration/courts.test.ts` covering FR-1, FR-2 acceptance criteria and all edge cases.

**Relevant Context:**
- `requirements.md` § FR-1, FR-2, BR-4 (overlap/availability logic), NFR-1 (composite index already in schema).
- `plans/database-schema.md` → `idx_bookings_court_date` index, availability query.
- `plans/architecture.md` → Lazy completion note (service layer, not repository).

---

## Sub-Task 7 — Create Booking

**Status:** `[ ] pending`

**Intent:**
Implement `POST /bookings` with all business rule validation inside a single atomic database transaction.

**Expected Outcomes:**
- Valid booking returns `201` with full booking entity.
- Each of BR-1 through BR-7 violation returns the correct HTTP status and error code.
- Two concurrent requests for the same slot produce exactly one `201` and one `409` (SD-7).

**Todo List:**
1. Implement `src/repositories/bookings.repository.ts` (transaction-aware — accept `PoolClient`):
   - `getActiveBookingsForUserOnDate(client, userId, date)` — for BR-5 check.
   - `getFutureActiveBookingsForUser(client, userId, nowDate, nowTime)` — for BR-6 check.
   - `getOverlappingBookings(client, courtId, date, startTime, endTime)` — for BR-4 check (uses overlap SQL from `plans/database-schema.md`).
   - `insertBooking(client, userId, courtId, date, startTime, endTime)` — returns created booking.
   - `updateBookingStatusBatch(ids: number[], status: string)` — for lazy completion.
2. Implement `src/services/bookings.service.ts` — `createBooking(userId, { courtId, date, startTime, endTime })`:
   - Validate presence of all fields → `AppError(400, 'VALIDATION_ERROR')`.
   - Verify court exists → `AppError(404, 'COURT_NOT_FOUND')`.
   - Validate `date` format → `AppError(400, 'VALIDATION_ERROR')`.
   - Begin DB transaction.
   - Inside transaction:
     - Apply lazy completion for user's existing bookings (persist updates).
     - BR-7: `isFutureDateTime(date, startTime)` → `AppError(400, 'CANNOT_BOOK_PAST_TIME')`.
     - BR-1: `isWithinOperatingHours(startTime, endTime)` → `AppError(400, 'OUTSIDE_OPERATING_HOURS')`.
     - BR-2: `isAlignedToHalfHour(startTime)` && `isAlignedToHalfHour(endTime)` → `AppError(400, 'INVALID_TIME_ALIGNMENT')`.
     - BR-3: duration check (30–120 min) → `AppError(400, 'DURATION_TOO_SHORT' | 'DURATION_TOO_LONG')`.
     - BR-5: daily active booking count → `AppError(400, 'DAILY_BOOKING_LIMIT_EXCEEDED')`.
     - BR-6: future active booking count → `AppError(400, 'FUTURE_BOOKING_LIMIT_EXCEEDED')`.
     - BR-4: overlap check → `AppError(409, 'COURT_DOUBLE_BOOKING')`.
     - Insert booking.
   - Commit. Return booking.
   - Log `BOOKING_CREATED` via logger (NFR-2).
3. Implement controller method and mount `POST /bookings` with `authenticate` middleware.
4. Write integration tests in `tests/integration/bookings.test.ts` covering FR-3 and all BR-1 through BR-7 edge cases including concurrent booking test.

**Relevant Context:**
- `requirements.md` § FR-3, BR-1 through BR-7, SD-7, SD-4, SD-5.
- `plans/architecture.md` → Key Constraints — lazy completion before BR-5/BR-6 evaluation.
- `plans/database-schema.md` → overlap query, daily/future limit queries.

---

## Sub-Task 8 — My Bookings & Booking Cancellation

**Status:** `[ ] pending`

**Intent:**
Implement `GET /bookings/mine` (with lazy completion) and `DELETE /bookings/:id/cancel`.

**Expected Outcomes:**
- `GET /bookings/mine` returns user's bookings with lazy-completed statuses, sorted chronologically. `courtName` included (FR-4).
- `DELETE /bookings/:id/cancel` enforces ownership (403), business rules (400), and cut-off window (BR-8).
- Audit logs emitted for cancellation (NFR-2).

**Todo List:**
1. Add to `src/repositories/bookings.repository.ts`:
   - `getBookingsForUser(userId)` — join with `courts` table, return `courtName`. Order by `date ASC, start_time ASC`.
   - `findBookingById(id)` — returns booking or null.
   - `updateBookingStatus(id, status)` — single row update.
2. Add to `src/services/bookings.service.ts`:
   - `getMyBookings(userId)`:
     - Fetch all bookings for user (via repo).
     - Identify those with `status = 'active'` and `date + endTime <= now`.
     - Persist batch status update to `completed`.
     - Return updated list.
   - `cancelBooking(userId, bookingId)`:
     - Find booking by ID. Not found → `AppError(404, 'BOOKING_NOT_FOUND')`.
     - Ownership check: `booking.userId !== userId` → `AppError(403, 'FORBIDDEN')`.
     - Status check: already `cancelled` → `AppError(400, 'ALREADY_CANCELLED')`. Already `completed` → `AppError(400, 'ALREADY_COMPLETED')`.
     - Cut-off check: `now > date + startTime - 60min` → `AppError(400, 'CANCELLATION_DEADLINE_PASSED')` (BR-8).
     - Update status to `cancelled`.
     - Log `BOOKING_CANCELLED` (NFR-2).
     - Return updated booking.
3. Implement controller methods and mount routes with `authenticate`:
   - `GET /bookings/mine`
   - `DELETE /bookings/:id/cancel`
4. Extend integration tests in `tests/integration/bookings.test.ts` covering FR-4, FR-5, AC-4, BR-8 acceptance criteria and all edge cases.

**Relevant Context:**
- `requirements.md` § FR-4, FR-5, FR-6, AC-4, BR-8, NFR-2, SD-3.
- `plans/architecture.md` → Key Constraints — ownership check before business rule checks; `GET /bookings/mine` is a write operation.
- `plans/database-schema.md` → My bookings query (JOIN with courts for `courtName`).

---

## Sub-Task 9 — Final Wiring, Testing & Validation

**Status:** `[ ] pending`

**Intent:**
Ensure all routes are correctly assembled, all integration tests pass, TypeScript compiles clean, and the app runs end-to-end via Docker Compose.

**Expected Outcomes:**
- `tsc --noEmit` passes with zero errors.
- All unit and integration tests pass.
- `docker compose up` starts cleanly, migrations run, seeded courts visible on `GET /courts`.

**Todo List:**
1. Verify all routes are mounted in `src/server.ts` with correct auth middleware placement.
2. Verify `errorHandler` is registered last.
3. Confirm `AGENTS.md` and `plans/` accurately reflect the final implementation — update if anything diverged.
4. Run full test suite: `npm test`.
5. Run TypeScript check: `npx tsc --noEmit`.
6. Start with Docker Compose and manually verify all public and protected endpoints with a REST client.

**Relevant Context:**
- `requirements.md` § AC-3 — definitive list of public vs protected endpoints.
- `requirements.md` § NFR-3 — all valid error codes must be present; no extras.
