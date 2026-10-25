# Tennis Court Booking System - Specification & Requirements

This document is the authoritative source of truth for the Tennis Court Booking Demo Application. It follows the **Easy Approach to Requirements Syntax (EARS)** and defines explicit requirement identifiers for spec-driven development (SDD) and full requirement-to-test traceability.

---

## 1. System Overview & Architecture Decisions

### 1.1 Goal & Scope
The application is a lightweight tennis court booking system allowing registered users to check court availability, create bookings within defined operational hours, view their bookings, and cancel eligible future bookings under strict business constraints.

### 1.2 Explicit Spec Decisions & Assumptions

| ID | Decision / Assumption | Details |
|---|---|---|
| **SD-1** | **Seeded Courts** | The system operates with 3 fixed, pre-seeded courts (`Court 1`, `Court 2`, `Court 3`). No administrative court management UI or court creation/deletion endpoints are in scope. |
| **SD-2** | **Single Timezone Context** | All dates (`YYYY-MM-DD`) and times (`HH:mm`) are interpreted and evaluated in a single fixed server local timezone. Timezone conversions and daylight saving offsets are out of scope for this demo. |
| **SD-3** | **Lazy Booking State Transitions** | The system transitions bookings from `active` to `completed` lazily when records are read or queried if `date + endTime <= now`. No background cron jobs or external schedulers are required. |
| **SD-4** | **Active Booking Definition** | An "active" booking is any booking with `status = 'active'`. Bookings with status `cancelled` or `completed` do not count as active and do not consume booking limits or block time slots. |
| **SD-5** | **Future Booking Definition** | A "future booking" is defined as any booking where `status = 'active'` and `date + startTime > now`. |
| **SD-6** | **Demo-Grade Authentication** | Authentication uses email and password with secure bcrypt password hashing and token-based session management (JWT in `Authorization: Bearer <token>` header). User self-registration is open; password reset and email confirmation are out of scope. |
| **SD-7** | **Atomic Conflict & Overlap Prevention** | Booking creation and double-booking checks must execute within an isolated database transaction to guarantee concurrency safety and prevent race conditions. |
| **SD-8** | **Stored Booking Schema** | Stored bookings contain: `id` (UUID or autoincrement ID), `userId` (foreign key), `courtId` (foreign key), `date` (`YYYY-MM-DD`), `startTime` (`HH:mm`), `endTime` (`HH:mm`), `status` (`'active' | 'cancelled' | 'completed'`), and `createdAt` (timestamp). |

---

## 2. EARS Notation Reference

Requirements in this specification use standard EARS sentence patterns:
- **Ubiquitous:** `The <system> shall <system response>`
- **Event-Driven:** `When <trigger>, the <system> shall <system response>`
- **State-Driven:** `While <state>, the <system> shall <system response>`
- **Unwanted Behavior / Error:** `If <trigger/condition>, then the <system> shall <system response>`
- **Complex:** `While <state>, when/if <trigger>, the <system> shall <system response>`

---

## 3. Account Requirements (`AC-*`)

### `AC-1`: User Registration
- **EARS Pattern:**
  - *Normal:* When a guest submits a registration request with a valid email and password, the system shall create a new user account with a securely hashed password and return an authentication token.
  - *Error:* If a registration request contains an email that already exists in the system, then the system shall reject the request with HTTP `409 Conflict`.
  - *Error:* If a registration request is missing required fields or provides an invalid email format or empty password, then the system shall reject the request with HTTP `400 Bad Request`.
- **Acceptance Criteria:**
  - `POST /auth/register` creates a user record in the database.
  - Passwords are never stored in plaintext (hashed using bcrypt).
  - Returns HTTP `201 Created` with a JWT token and basic user info (`id`, `email`, `name`).
  - Duplicate registration with the same email (case-insensitive) fails with HTTP `409 Conflict`.
- **Edge Cases:**
  - Whitespace in email addresses is trimmed and normalised to lowercase.
  - Empty or whitespace-only password is rejected with HTTP `400 Bad Request`.
  - Malformed email string (e.g. `invalid-email`, `@domain.com`, `user@`) is rejected with HTTP `400 Bad Request`.

---

### `AC-2`: User Login
- **EARS Pattern:**
  - *Normal:* When a user submits valid login credentials (registered email and matching password), the system shall return an authentication token and user profile information.
  - *Error:* If the submitted email does not exist or the password does not match, then the system shall reject the login request with HTTP `401 Unauthorized`.
- **Acceptance Criteria:**
  - `POST /auth/login` validates credentials against stored bcrypt hash.
  - Successful authentication returns HTTP `200 OK` with a valid JWT token.
  - Unsuccessful authentication returns HTTP `401 Unauthorized` without exposing whether the email or password was the specific failure reason.
- **Edge Cases:**
  - Case-insensitive email matching (e.g., `User@Example.COM` matches `user@example.com`).
  - Account with no password or empty input fields returns HTTP `400 Bad Request`.

---

### `AC-3`: Authentication Enforcement
- **EARS Pattern:**
  - *Normal:* While processing any request to a protected endpoint (`POST /bookings`, `GET /bookings/mine`, `DELETE /bookings/:id/cancel`), if the request lacks a valid JWT token in the `Authorization` header, then the system shall reject the request with HTTP `401 Unauthorized`.
- **Acceptance Criteria:**
  - Missing `Authorization` header returns HTTP `401 Unauthorized`.
  - Expired, tampered, or malformed JWT token returns HTTP `401 Unauthorized`.
  - Public endpoints (`GET /courts`, `GET /courts/:id/availability`, `POST /auth/register`, `POST /auth/login`) remain accessible without authentication.
- **Edge Cases:**
  - Header present with incorrect scheme (e.g. `Basic <token>` or token without `Bearer ` prefix) returns HTTP `401 Unauthorized`.
  - Token signed with an invalid secret or corrupted payload returns HTTP `401 Unauthorized`.

---

### `AC-4`: Resource Authorization & Scoping
- **EARS Pattern:**
  - *Normal:* While an authenticated user requests their bookings list (`GET /bookings/mine`), the system shall return only bookings associated with the authenticated user's ID.
  - *Error:* If an authenticated user attempts to cancel a booking owned by another user (`DELETE /bookings/:id/cancel`), then the system shall reject the request with HTTP `403 Forbidden`.
  - *Error:* If an authenticated user attempts to cancel a booking ID that does not exist, then the system shall reject the request with HTTP `404 Not Found`.
- **Acceptance Criteria:**
  - Users cannot view, modify, or cancel bookings belonging to other users.
  - `GET /bookings/mine` automatically scopes database queries to the user ID extracted from the authenticated JWT token.
  - Cancellation requests check `booking.userId === authenticatedUser.id` before processing rules.
- **Edge Cases:**
  - User A cannot cancel User B's booking even if User A provides a valid booking ID and valid token.
  - Non-existent booking ID returns HTTP `404 Not Found`.

---

## 4. Functional Requirements (`FR-*`)

### `FR-1`: Court Listing
- **EARS Pattern:**
  - *Normal:* When a client requests the list of courts (`GET /courts`), the system shall return all available courts with their identifiers and display names.
- **Acceptance Criteria:**
  - Returns HTTP `200 OK` with an array of 3 seeded courts (`Court 1`, `Court 2`, `Court 3`).
  - Each court object includes `id` and `name`.
- **Edge Cases:**
  - Endpoint is public and does not require an `Authorization` header.

---

### `FR-2`: Court Availability Query
- **EARS Pattern:**
  - *Normal:* When a client requests availability for a court on a specific date (`GET /courts/:id/availability?date=YYYY-MM-DD`), the system shall compute and return the available (free) time intervals and booked time intervals between 06:00 and 22:00.
  - *Error:* If the query parameter `date` is missing or is not formatted as `YYYY-MM-DD`, then the system shall reject the request with HTTP `400 Bad Request`.
  - *Error:* If the requested `courtId` does not correspond to an existing court, then the system shall return HTTP `404 Not Found`.
- **Acceptance Criteria:**
  - Availability is calculated by subtracting active booking intervals from the daily operating window `[06:00, 22:00]`.
  - Cancelled bookings are ignored during availability calculation.
  - Back-to-back bookings leave adjacent time slots free.
  - The response returns both `freeSlots` (or free intervals) and `bookedSlots` for the specified date.
- **Edge Cases:**
  - Date with zero bookings returns a single free interval `[06:00, 22:00]`.
  - Date with fully booked operating hours returns an empty free intervals list.
  - Query for a past date calculates availability based on historical bookings without error.
  - Invalid date format (e.g. `2025-02-30`, `today`, `15/03/2025`) returns HTTP `400 Bad Request`.

---

### `FR-3`: Create Court Booking
- **EARS Pattern:**
  - *Normal:* When an authenticated user submits a booking request specifying `courtId`, `date`, `startTime`, and `endTime` that satisfies all business rules (`BR-1` through `BR-7`), the system shall create an `active` booking and return HTTP `201 Created` with the booking details.
  - *Error:* If the booking request violates any business rule, then the system shall reject the request with the appropriate HTTP status code (`400 Bad Request` or `409 Conflict`) and a descriptive error message.
- **Acceptance Criteria:**
  - `POST /bookings` accepts payload `{ courtId, date, startTime, endTime }`.
  - Request is validated against all business rules (`BR-1` to `BR-7`) inside an atomic database transaction.
  - On success, saves record with `status: 'active'` and returns HTTP `201 Created` with the complete booking entity.
- **Edge Cases:**
  - Missing payload properties return HTTP `400 Bad Request`.
  - Invalid court ID returns HTTP `404 Not Found` or `400 Bad Request`.

---

### `FR-4`: User Bookings Listing ("My Bookings")
- **EARS Pattern:**
  - *Normal:* When an authenticated user requests their bookings list (`GET /bookings/mine`), the system shall evaluate lazy completion for expired active bookings, persist status updates, and return all bookings belonging to the user sorted chronologically.
- **Acceptance Criteria:**
  - Returns HTTP `200 OK` with an array of bookings for the authenticated user.
  - Each booking contains `id`, `courtId`, `courtName`, `date`, `startTime`, `endTime`, `status`, and `createdAt`.
  - Active bookings whose `date + endTime <= now` are returned with `status: 'completed'`.
  - Cancelled bookings retain `status: 'cancelled'`.
- **Edge Cases:**
  - User with zero bookings receives HTTP `200 OK` with an empty array `[]`.
  - Bookings are returned sorted primarily by `date` ascending/descending and secondarily by `startTime`.

---

### `FR-5`: Booking Cancellation
- **EARS Pattern:**
  - *Normal:* When an authenticated user submits a cancellation request (`DELETE /bookings/:id/cancel` or `POST /bookings/:id/cancel`) for an active booking they own, if the current time is at least 1 hour prior to the booking start time (`now <= date + startTime - 1 hour`), then the system shall update the booking status to `cancelled` and return HTTP `200 OK`.
  - *Error:* If the cancellation request is submitted less than 1 hour before the booking start time, or after the start time, then the system shall reject the request with HTTP `400 Bad Request`.
  - *Error:* If the booking is already in `cancelled` or `completed` status, then the system shall reject the cancellation with HTTP `400 Bad Request`.
- **Acceptance Criteria:**
  - Status updates from `active` to `cancelled`.
  - Once cancelled, the court time slot is immediately available for new bookings.
  - The cancelled booking no longer counts toward the user's daily booking limit (`BR-5`) or future booking limit (`BR-6`).
- **Edge Cases:**
  - Cancellation submitted at exactly 60 minutes (1 hour) before start time succeeds.
  - Cancellation submitted at 59 minutes and 59 seconds before start time fails with HTTP `400 Bad Request`.
  - Attempting to cancel an already cancelled booking returns HTTP `400 Bad Request` with code `ALREADY_CANCELLED`.
  - Attempting to cancel a completed booking returns HTTP `400 Bad Request` with code `ALREADY_COMPLETED`.

---

### `FR-6`: Lazy Status Transition to Completed
- **EARS Pattern:**
  - *Normal:* While retrieving booking records for queries, availability checks, or listings, if a booking has `status = 'active'` and its end timestamp is in the past (`date + endTime <= now`), then the system shall transition its status to `completed` in memory and update the database lazily.
- **Acceptance Criteria:**
  - `status` updates from `active` to `completed` without requiring manual user intervention or cron triggers.
  - Completed bookings do not restrict future bookings or daily limits for future dates.
- **Edge Cases:**
  - A booking that is currently ongoing (`startTime <= now < endTime`) remains `active` and is not yet marked `completed`.
  - A booking that ended 1 minute ago (`endTime <= now`) transitions to `completed`.

---

## 5. Business Rules (`BR-*`)

### `BR-1`: Operating Hours Window (06:00 – 22:00)
- **EARS Pattern:**
  - *Normal:* While validating a booking request, the system shall ensure the booking slot falls entirely within daily operating hours of 06:00 to 22:00.
  - *Error:* If the booking `startTime < "06:00"` or `endTime > "22:00"`, then the system shall reject the booking with HTTP `400 Bad Request` (Error Code: `OUTSIDE_OPERATING_HOURS`).
- **Acceptance Criteria:**
  - Earliest permissible start time is `06:00`.
  - Latest permissible end time is `22:00`.
  - Start time must be strictly before end time (`startTime < endTime`).
- **Edge Cases:**
  - Booking `06:00` to `07:00` is accepted.
  - Booking `21:00` to `22:00` is accepted (ends exactly at 22:00).
  - Booking `21:30` to `22:30` is rejected (exceeds 22:00).
  - Booking starting at `22:00` (e.g. `22:00` to `22:30`) is rejected.
  - Booking starting at `05:30` (e.g. `05:30` to `06:30`) is rejected.
  - Booking spanning across midnight (e.g. `21:30` to `00:30` next day) is rejected.

---

### `BR-2`: 30-Minute Slot Increments
- **EARS Pattern:**
  - *Normal:* While validating a booking request, the system shall ensure both `startTime` and `endTime` are aligned to 30-minute clock boundaries (`:00` or `:30`).
  - *Error:* If `startTime` or `endTime` does not land on a 30-minute increment, then the system shall reject the booking with HTTP `400 Bad Request` (Error Code: `INVALID_TIME_ALIGNMENT`).
- **Acceptance Criteria:**
  - Allowed minutes values for start and end times are `00` and `30`.
- **Edge Cases:**
  - `09:00` to `10:30` is accepted.
  - `09:15` to `10:15` is rejected.
  - `09:00` to `10:20` is rejected.
  - `09:45` to `10:45` is rejected.
  - Non-standard seconds or milliseconds (e.g. `09:00:15`) are rejected.

---

### `BR-3`: Booking Duration Limits (30 min to 2 hours)
- **EARS Pattern:**
  - *Normal:* While validating a booking request, the system shall ensure the booking duration (`endTime - startTime`) is between 30 minutes (minimum) and 120 minutes (maximum), inclusive.
  - *Error:* If the duration is less than 30 minutes, then the system shall reject the booking with HTTP `400 Bad Request` (Error Code: `DURATION_TOO_SHORT`).
  - *Error:* If the duration is greater than 120 minutes (2 hours), then the system shall reject the booking with HTTP `400 Bad Request` (Error Code: `DURATION_TOO_LONG`).
- **Acceptance Criteria:**
  - Permitted durations: exactly 30 minutes (0.5 h), 60 minutes (1.0 h), 90 minutes (1.5 h), or 120 minutes (2.0 h).
- **Edge Cases:**
  - Duration 30 min (e.g., `10:00` to `10:30`) is accepted.
  - Duration 120 min (e.g., `10:00` to `12:00`) is accepted.
  - Duration 0 min (e.g., `10:00` to `10:00`) is rejected.
  - Negative duration (e.g., `11:00` to `10:00`) is rejected.
  - Duration 15 min (e.g., `10:00` to `10:15`) is rejected.
  - Duration 150 min (2.5 hours, e.g. `10:00` to `12:30`) is rejected.

---

### `BR-4`: Court Non-Overlap & Double-Booking Prevention
- **EARS Pattern:**
  - *Normal:* While evaluating a booking creation request for a specific court and date, the system shall ensure the requested time interval `[startTime, endTime)` does not overlap with any existing booking on that court where `status = 'active'`.
  - *Error:* If an overlapping active booking exists on the same court and date, then the system shall reject the request with HTTP `409 Conflict` (Error Code: `COURT_DOUBLE_BOOKING`).
- **Acceptance Criteria:**
  - Overlap condition between existing interval `[E_start, E_end)` and requested interval `[R_start, R_end)`: `max(E_start, R_start) < min(E_end, R_end)`.
  - Back-to-back bookings on the same court do not overlap and are explicitly permitted.
  - Overlap check is executed within an atomic database transaction.
  - Bookings with `status = 'cancelled'` or `status = 'completed'` are ignored and do not cause conflict.
- **Edge Cases:**
  - *Back-to-back preceding:* Existing `10:00-11:00`, requested `09:00-10:00` on same court -> Allowed.
  - *Back-to-back following:* Existing `10:00-11:00`, requested `11:00-12:00` on same court -> Allowed.
  - *Exact match:* Existing `10:00-11:00`, requested `10:00-11:00` -> Rejected with HTTP `409 Conflict`.
  - *Partial start overlap:* Existing `10:00-11:00`, requested `09:30-10:30` -> Rejected with HTTP `409 Conflict`.
  - *Partial end overlap:* Existing `10:00-11:00`, requested `10:30-11:30` -> Rejected with HTTP `409 Conflict`.
  - *Enclosing interval:* Existing `10:00-11:00`, requested `09:00-12:00` -> Rejected with HTTP `409 Conflict`.
  - *Enclosed interval:* Existing `09:00-12:00`, requested `10:00-11:00` -> Rejected with HTTP `409 Conflict`.
  - *Different courts:* Existing `10:00-11:00` on Court 1, requested `10:00-11:00` on Court 2 by different users -> Allowed.
  - *Concurrent booking requests:* Two simultaneous requests for the same court and time must result in exactly one HTTP `201` and one HTTP `409`.

---

### `BR-5`: Daily Active Booking Limit (Max 1 Per User Per Day)
- **EARS Pattern:**
  - *Normal:* While evaluating a booking creation request, the system shall ensure the user does not already hold an active booking on the requested date across any court.
  - *Error:* If the user already has 1 active booking on that date, then the system shall reject the request with HTTP `400 Bad Request` (Error Code: `DAILY_BOOKING_LIMIT_EXCEEDED`).
- **Acceptance Criteria:**
  - A user is limited to at most 1 active booking per calendar date across all courts combined.
  - Cancelled bookings on that date do not count toward this limit.
  - Completed bookings on that date (e.g. from earlier in the day) do not count toward this limit, consistent with `SD-4`; only `status = 'active'` bookings count.
- **Edge Cases:**
  - User has an active booking on Court 1 for `2025-06-01 10:00-11:00`. User attempts to book Court 2 for `2025-06-01 14:00-15:00` -> Rejected with HTTP `400 Bad Request`.
  - User has an active booking on `2025-06-01`, cancels it, and then books another slot on `2025-06-01` -> Allowed.
  - User has a morning booking on today's date that has ended and become `completed`, then books an evening slot today -> Allowed (the completed booking is not active).
  - User has an active booking on `2025-06-01` and creates a booking on `2025-06-02` -> Allowed (different dates, subject to `BR-6`).

---

### `BR-6`: Future Booking Limit (Max 2 Active Future Bookings Per User)
- **EARS Pattern:**
  - *Normal:* While evaluating a booking creation request, the system shall ensure the total number of active future bookings held by the user across all dates and courts does not exceed 2.
  - *Error:* If the user currently holds 2 active future bookings (`status = 'active'` and `date + startTime > now`), then the system shall reject the creation of a 3rd future booking with HTTP `400 Bad Request` (Error Code: `FUTURE_BOOKING_LIMIT_EXCEEDED`).
- **Acceptance Criteria:**
  - A "future booking" is defined as any booking with `status = 'active'` and `date + startTime > now`.
  - Cancelled bookings and completed past bookings do not count as future bookings.
  - When a user with 2 active future bookings cancels one of them, they immediately have only 1 future booking and can create a new future booking.
  - Rules `BR-5` (max 1 per day) and `BR-6` (max 2 future total) apply concurrently: a user cannot have 2 bookings on the same day, but can have up to 2 bookings on 2 distinct future days.
- **Edge Cases:**
  - User has 2 active bookings for Day 1 and Day 2 (both in the future). Attempting to book Day 3 -> Rejected with HTTP `400 Bad Request`.
  - User has 2 future bookings, cancels one booking via `FR-5`, and then attempts to book Day 3 -> Allowed.
  - User had 2 bookings in the past that are now `completed`. User attempts to book 2 future bookings -> Allowed.
  - User has 1 active booking today that ended an hour ago (transitions to `completed`) and 1 future booking for tomorrow. User attempts to create another future booking for next week -> Allowed (total active future bookings = 1 before request, 2 after request).

---

### `BR-7`: Future Start Time Requirement
- **EARS Pattern:**
  - *Normal:* While validating a booking creation request, the system shall ensure the booking start time (`date + startTime`) is strictly in the future relative to the current server time (`date + startTime > now`).
  - *Error:* If the requested booking start time is in the past or equals the current time, then the system shall reject the request with HTTP `400 Bad Request` (Error Code: `CANNOT_BOOK_PAST_TIME`).
- **Acceptance Criteria:**
  - Bookings for past dates (e.g. yesterday) are rejected.
  - Bookings for earlier today (e.g. today at 08:00 when `now` is 10:00) are rejected.
- **Edge Cases:**
  - Attempting to book a slot that has already started (even if within operating hours) returns HTTP `400 Bad Request`.
  - Attempting to book a slot starting in 5 minutes is allowed (as long as `startTime > now` and falls on a valid increment).

---

### `BR-8`: Cancellation Cut-Off Window (1 Hour Before Start)
- **EARS Pattern:**
  - *Normal:* When an authenticated user requests cancellation of their active booking, if `now <= date + startTime - 1 hour`, then the system shall allow cancellation.
  - *Error:* If `now > date + startTime - 1 hour`, then the system shall reject the cancellation request with HTTP `400 Bad Request` (Error Code: `CANCELLATION_DEADLINE_PASSED`).
- **Acceptance Criteria:**
  - Cancellation is strictly forbidden within the 1-hour window before start time and any time after start time.
  - The cut-off is calculated relative to the booking's `date + startTime`.
- **Edge Cases:**
  - Booking is at `14:00`. Current time is `12:59` -> Cancellation Allowed (1 hour 1 minute before start).
  - Booking is at `14:00`. Current time is `13:00` -> Cancellation Allowed (exactly 1 hour before start).
  - Booking is at `14:00`. Current time is `13:01` -> Cancellation Rejected (59 minutes before start).
  - Booking is at `14:00`. Current time is `14:30` (during booking) -> Cancellation Rejected.
  - Booking is at `14:00`. Current time is `16:00` (after booking) -> Cancellation Rejected.

---

## 6. Non-Functional Requirements (`NFR-*`)

### `NFR-1`: Availability Query Latency
- **EARS Pattern:**
  - *Normal:* When a client queries court availability (`GET /courts/:id/availability?date=YYYY-MM-DD`), the system shall compute and return the response within 200 milliseconds under standard demo workload conditions.
- **Acceptance Criteria:**
  - Response time for availability endpoint is < 200ms at the 95th percentile under normal single-user and concurrent test suites.
  - Database queries for bookings on a specific court and date use composite indexes `(courtId, date)` for optimal lookup speed.
- **Edge Cases:**
  - Query performance remains < 200ms even when multiple bookings exist on the given date across multiple courts.

---

### `NFR-2`: Operational Audit Logging
- **EARS Pattern:**
  - *Normal:* When a booking is created or cancelled, the system shall write a structured log entry containing the operation metadata.
- **Acceptance Criteria:**
  - Booking creation logs: `timestamp`, `level: 'INFO'`, `action: 'BOOKING_CREATED'`, `userId`, `bookingId`, `courtId`, `date`, `startTime`, `endTime`.
  - Booking cancellation logs: `timestamp`, `level: 'INFO'`, `action: 'BOOKING_CANCELLED'`, `userId`, `bookingId`, `courtId`, `date`, `startTime`, `endTime`.
  - Log entries are output to standard output or a designated logger in structured JSON or clean log format.
- **Edge Cases:**
  - Failed booking attempts due to business rule violations are logged with `level: 'WARN'`, including the attempted parameters and error reason.
  - Sensitive credentials (e.g. passwords) are never logged.

---

### `NFR-3`: RESTful API Design & Consistent Error Formats
- **EARS Pattern:**
  - *Normal:* The system shall expose standard RESTful HTTP endpoints that use JSON for request and response payloads, returning consistent HTTP status codes and structured error bodies.
- **Acceptance Criteria:**
  - Successful responses return standard HTTP status codes (`200 OK`, `201 Created`).
  - Error responses consistently follow the JSON structure:
    ```json
    {
      "error": "Human-readable error message",
      "code": "MACHINE_READABLE_ERROR_CODE",
      "details": {}
    }
    ```
  - Standard error codes:
    - `400 Bad Request`: `OUTSIDE_OPERATING_HOURS`, `INVALID_TIME_ALIGNMENT`, `DURATION_TOO_SHORT`, `DURATION_TOO_LONG`, `DAILY_BOOKING_LIMIT_EXCEEDED`, `FUTURE_BOOKING_LIMIT_EXCEEDED`, `CANNOT_BOOK_PAST_TIME`, `CANCELLATION_DEADLINE_PASSED`, `VALIDATION_ERROR`
    - `401 Unauthorized`: `UNAUTHORIZED`, `INVALID_CREDENTIALS`, `TOKEN_EXPIRED`
    - `403 Forbidden`: `FORBIDDEN`
    - `404 Not Found`: `COURT_NOT_FOUND`, `BOOKING_NOT_FOUND`
    - `409 Conflict`: `COURT_DOUBLE_BOOKING`, `EMAIL_ALREADY_EXISTS`
- **Edge Cases:**
  - Unhandled internal server errors return `500 Internal Server Error` with code `INTERNAL_SERVER_ERROR` without leaking database stack traces to the client.

---

## 7. Requirement Traceability Matrix (Summary)

| Requirement ID | Category | Summary Description | Related Rules / Dependencies |
|---|---|---|---|
| **AC-1** | Account | User Registration (email/password, bcrypt, duplicate email prevention) | SD-6 |
| **AC-2** | Account | User Login (JWT generation, credential verification) | SD-6 |
| **AC-3** | Account | Authentication Enforcement on Protected Endpoints | AC-1, AC-2 |
| **AC-4** | Account | Resource Authorization (scoping My Bookings and cancel to owner) | AC-3, FR-4, FR-5 |
| **FR-1** | Functional | Court Listing (`GET /courts` returning 3 seeded courts) | SD-1 |
| **FR-2** | Functional | Court Availability Query (`GET /courts/:id/availability?date=`) | BR-1, BR-4, NFR-1 |
| **FR-3** | Functional | Booking Creation (`POST /bookings`) | BR-1 to BR-7, SD-7, SD-8 |
| **FR-4** | Functional | My Bookings Listing (`GET /bookings/mine` with lazy completion) | SD-3, FR-6, AC-4 |
| **FR-5** | Functional | Booking Cancellation (`DELETE /bookings/:id/cancel` with 1h cut-off) | BR-8, AC-4, NFR-2 |
| **FR-6** | Functional | Lazy Status Transition to `completed` | SD-3, FR-4 |
| **BR-1** | Business Rule | Operating Hours Window (06:00 – 22:00) | FR-2, FR-3 |
| **BR-2** | Business Rule | 30-Minute Slot Increments (:00 or :30) | FR-3 |
| **BR-3** | Business Rule | Booking Duration (30 min to 2 hours) | FR-3 |
| **BR-4** | Business Rule | Court Double-Booking / Overlap Prevention (back-to-back allowed) | FR-2, FR-3, SD-7 |
| **BR-5** | Business Rule | Daily Booking Limit (max 1 active booking per user per day) | FR-3, SD-4 |
| **BR-6** | Business Rule | Future Booking Limit (max 2 active future bookings per user) | FR-3, SD-5 |
| **BR-7** | Business Rule | Future Start Time Validation (no past bookings) | FR-3 |
| **BR-8** | Business Rule | Cancellation Cut-off (>= 1 hour before start time) | FR-5 |
| **NFR-1** | Non-Functional | Availability Latency Target (< 200 ms) | FR-2 |
| **NFR-2** | Non-Functional | Audit Logging for Booking & Cancel Actions | FR-3, FR-5 |
| **NFR-3** | Non-Functional | RESTful Conventions & Standard Error Format | All endpoints |
