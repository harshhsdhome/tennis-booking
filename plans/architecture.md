# Architecture Plan — Tennis Court Booking System

## Overview

A Node.js + TypeScript + Express REST API backed by PostgreSQL (via Docker Compose).
No ORM — raw SQL through the `pg` driver. No frontend. No background jobs.
All business logic is enforced server-side per `requirements.md`.

---

## Directory Structure

```
tennis-booking/
├── docker-compose.yml          # Postgres + app services
├── .env.example                # Required env vars template
├── package.json
├── tsconfig.json
├── src/
│   ├── server.ts               # Express app bootstrap, middleware registration
│   ├── index.ts                # Process entry point — binds port, starts server
│   ├── config.ts               # Reads and validates env vars (PORT, DB_URL, JWT_SECRET)
│   ├── db/
│   │   ├── pool.ts             # pg Pool singleton
│   │   └── migrations/
│   │       ├── 001_create_users.sql
│   │       ├── 002_create_courts.sql
│   │       ├── 003_create_bookings.sql
│   │       └── 004_seed_courts.sql
│   ├── middleware/
│   │   ├── authenticate.ts     # JWT verification → attaches req.user
│   │   └── errorHandler.ts     # Global Express error handler → { error, code, details }
│   ├── errors/
│   │   └── AppError.ts         # Typed application error class carrying httpStatus + code
│   ├── routes/
│   │   ├── auth.routes.ts
│   │   ├── courts.routes.ts
│   │   └── bookings.routes.ts
│   ├── controllers/
│   │   ├── auth.controller.ts
│   │   ├── courts.controller.ts
│   │   └── bookings.controller.ts
│   ├── services/
│   │   ├── auth.service.ts
│   │   ├── courts.service.ts
│   │   └── bookings.service.ts
│   ├── repositories/
│   │   ├── users.repository.ts
│   │   ├── courts.repository.ts
│   │   └── bookings.repository.ts
│   └── utils/
│       ├── timeUtils.ts        # parseHHmm, toMinutes, overlaps, isFuture helpers
│       └── logger.ts           # Structured JSON logger (NFR-2)
└── tests/
    ├── unit/
    │   └── timeUtils.test.ts
    └── integration/
        ├── auth.test.ts
        ├── courts.test.ts
        └── bookings.test.ts
```

---

## Layers & Responsibilities

### Routes
- Mount controllers on paths.
- Apply `authenticate` middleware only to protected routes (AC-3).
- No business logic.

### Controllers
- Parse and validate HTTP request shape (presence of required fields, basic type checks).
- Call one service method.
- Return HTTP response with correct status code.
- Throw `AppError` for validation failures; let `errorHandler` serialize them.

### Services
- Own all business rule enforcement (BR-1 through BR-8).
- Coordinate repositories and apply lazy completion (FR-6, SD-3).
- For `createBooking`: open a DB transaction, run all checks inside it, insert, commit (SD-7).
- For `getMyBookings`: apply lazy completion before returning, persist updates (FR-4, FR-6).
- Never touch `req` / `res` — only plain data in, plain data out.

### Repositories
- One function per SQL query. Accept a `PoolClient` or `Pool` parameter so services can pass a transaction client when needed.
- No business logic — pure data access.

### Middleware

**`authenticate.ts`**
- Reads `Authorization: Bearer <token>`.
- Verifies JWT. Attaches `req.user = { id, email }` on success.
- Throws `AppError(401, 'UNAUTHORIZED')` for any failure (missing, malformed, expired).

**`errorHandler.ts`**
- Catches all errors passed via `next(err)`.
- If `AppError`: responds `{ error, code, details }` with the stored HTTP status.
- Otherwise: logs the error, responds `500` with code `INTERNAL_SERVER_ERROR` — never leaks stack traces (NFR-3).

### `AppError`
```
class AppError extends Error {
  constructor(
    public readonly httpStatus: number,
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>
  )
}
```
Every business rule violation throws an `AppError`. Controllers and services never call `res.status(...).json(...)` for errors — they throw and let `errorHandler` handle serialisation.

---

## Request Flow

```
HTTP Request
    │
    ▼
Express Router
    │
    ├─ [if protected] authenticate middleware
    │       ├─ valid JWT  → attach req.user, next()
    │       └─ invalid    → throw AppError(401)
    │
    ▼
Controller
    │   validate request shape → throw AppError(400) if invalid
    │
    ▼
Service
    │   enforce business rules → throw AppError(4xx) if violated
    │   (booking creation runs inside pg transaction)
    │
    ▼
Repository
    │   execute SQL via pg Pool/PoolClient
    │
    ▼
Controller
    │   send res.status(2xx).json(data)
    │
    ▼
[on any thrown error]
    ▼
errorHandler middleware
    └─ serialize AppError → { error, code, details }
    └─ unknown error      → 500 INTERNAL_SERVER_ERROR
```

---

## Database Connection

- Single `pg.Pool` instance exported from `src/db/pool.ts`.
- Repositories accept either the pool or a `PoolClient` (for transactions).
- Migrations run sequentially at startup via a small `runMigrations()` function that executes each `.sql` file in order if not already applied (tracked in a `schema_migrations` table).

---

## Environment Variables

| Variable | Description |
|---|---|
| `PORT` | HTTP port (default `3000`) |
| `DATABASE_URL` | Full postgres connection string |
| `JWT_SECRET` | Secret for signing/verifying JWTs |
| `JWT_EXPIRES_IN` | Token TTL e.g. `7d` |
| `BCRYPT_ROUNDS` | bcrypt cost factor (default `10`) |

---

## Docker Compose

Two services:
1. `db` — `postgres:16-alpine`, exposes `5432`, named volume for data persistence.
2. `app` — builds from `Dockerfile`, depends on `db`, mounts source for dev hot-reload.

---

## Key Constraints & Non-Obvious Rules

- `startTime` / `endTime` are stored as `HH:mm` strings, not `TIME` columns — time arithmetic converts to minutes-since-midnight internally via `timeUtils.ts`.
- Lazy completion (FR-6) is applied in the **service layer**, not the repository. The repository fetches raw rows; the service checks and updates status before returning to the controller.
- `GET /bookings/mine` **writes** to the DB (persists lazy completions) — it is not a read-only endpoint.
- Overlap check SQL must filter `status = 'active'` to ignore cancelled/completed bookings (BR-4).
- The `bookings` service must apply lazy completion **before** evaluating BR-5 and BR-6 during booking creation, so completed bookings do not incorrectly count against limits.
- `DELETE /bookings/:id/cancel`: ownership check (403) must execute **before** business rule checks (400) to avoid leaking booking info (AC-4).
- All error codes are fixed by NFR-3. No codes outside that list may be used.
