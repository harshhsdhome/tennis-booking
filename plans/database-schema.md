# Database Schema Plan — Tennis Court Booking System

## Overview

PostgreSQL database with 3 tables: `users`, `courts`, `bookings`.
Migrations are forward-only raw SQL files executed in order at startup.
A `schema_migrations` table tracks which files have been applied.

---

## Migration Files

### `001_create_schema_migrations.sql`
Tracks applied migrations — must run first.

```sql
CREATE TABLE IF NOT EXISTS schema_migrations (
  filename TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

### `002_create_users.sql`

```sql
CREATE TABLE users (
  id         SERIAL PRIMARY KEY,
  email      TEXT    NOT NULL UNIQUE,
  name       TEXT    NOT NULL,
  password   TEXT    NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users (email);
```

**Notes:**
- `email` stored lowercase (normalised at application layer — AC-1).
- `password` stores bcrypt hash, never plaintext (SD-6).

---

### `003_create_courts.sql`

```sql
CREATE TABLE courts (
  id   SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);
```

---

### `004_create_bookings.sql`

```sql
CREATE TYPE booking_status AS ENUM ('active', 'cancelled', 'completed');

CREATE TABLE bookings (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  court_id    INTEGER NOT NULL REFERENCES courts(id) ON DELETE CASCADE,
  date        DATE    NOT NULL,
  start_time  TEXT    NOT NULL,  -- stored as HH:mm string (SD-8)
  end_time    TEXT    NOT NULL,  -- stored as HH:mm string (SD-8)
  status      booking_status NOT NULL DEFAULT 'active',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Required for NFR-1: availability query performance
CREATE INDEX idx_bookings_court_date ON bookings (court_id, date);

-- Speeds up BR-5 daily limit check and BR-6 future limit check
CREATE INDEX idx_bookings_user_status ON bookings (user_id, status);
```

**Notes:**
- `start_time` / `end_time` are `TEXT` (`HH:mm`), not `TIME`, matching SD-8. All time arithmetic happens in application code via `timeUtils.ts`.
- `date` is a proper `DATE` column for correct date comparisons.
- `ON DELETE CASCADE` — if a user or court is ever deleted, associated bookings are removed. Courts are seeded and never deleted in practice (SD-1).

---

### `005_seed_courts.sql`

```sql
INSERT INTO courts (name) VALUES
  ('Court 1'),
  ('Court 2'),
  ('Court 3')
ON CONFLICT (name) DO NOTHING;
```

**Note:** `ON CONFLICT DO NOTHING` makes the seed idempotent — safe to re-run on restart.

---

## Key Queries (reference for repositories)

### Overlap check — `BR-4` (must run inside transaction)
```sql
SELECT id FROM bookings
WHERE court_id = $1
  AND date = $2
  AND status = 'active'
  AND start_time < $4   -- R_end > E_start
  AND end_time   > $3   -- R_start < E_end
LIMIT 1;
-- $3 = requested startTime, $4 = requested endTime
```
Implements: `max(E_start, R_start) < min(E_end, R_end)` using the equivalent two-inequality form.
String comparison of `HH:mm` works correctly for lexicographic order within a single day.

### Daily limit check — `BR-5` (run inside transaction)
```sql
SELECT COUNT(*) FROM bookings
WHERE user_id = $1
  AND date = $2
  AND status = 'active';
```

### Future booking limit check — `BR-6` (run inside transaction)
```sql
SELECT COUNT(*) FROM bookings
WHERE user_id = $1
  AND status = 'active'
  AND (date > CURRENT_DATE
       OR (date = CURRENT_DATE AND start_time > $2));
-- $2 = current HH:mm time
```

### Lazy completion update — `FR-6`
```sql
UPDATE bookings
SET status = 'completed'
WHERE id = ANY($1::int[])
  AND status = 'active';
-- $1 = array of booking IDs identified as completed in application layer
```

### My bookings — `FR-4`
```sql
SELECT
  b.id,
  b.court_id,
  c.name AS court_name,
  b.date,
  b.start_time,
  b.end_time,
  b.status,
  b.created_at
FROM bookings b
JOIN courts c ON c.id = b.court_id
WHERE b.user_id = $1
ORDER BY b.date ASC, b.start_time ASC;
```

---

## Migration Runner Logic

Implemented in `src/db/migrate.ts`:

1. Ensure `schema_migrations` table exists.
2. Read all `.sql` files from `src/db/migrations/` sorted alphabetically.
3. For each file not already in `schema_migrations`, execute its SQL in a transaction and insert its filename into `schema_migrations`.
4. Called once at application startup before the HTTP server binds.

Migrations are **forward-only** — no rollback support by design.

---

## Constraints Summary

| Constraint | Enforcement Layer |
|---|---|
| Email uniqueness | DB UNIQUE constraint + app 409 |
| Court name uniqueness | DB UNIQUE constraint |
| `status` valid values | DB ENUM type |
| `user_id` / `court_id` referential integrity | DB FOREIGN KEY |
| Overlap prevention | App-layer check inside DB transaction (SD-7) |
| Business rules BR-1 to BR-8 | Application service layer only |
