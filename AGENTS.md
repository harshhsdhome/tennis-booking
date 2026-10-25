# AGENTS.md

This file provides guidance to agents when working with code in this repository.

## Project

Tennis Court Booking System — spec-only at this stage. No implementation exists yet.
The single source of truth is `requirements.md`. All design decisions, business rules, and
API contracts are defined there. Do not invent behaviour not covered by the spec.

## Key Spec Decisions (non-obvious)

- **3 fixed seeded courts** (`Court 1`, `Court 2`, `Court 3`) — no court management endpoints.
- **Lazy completion** — bookings transition `active → completed` only when read, never via a cron job (`SD-3`).
- **"Active" ≠ "future"** — `active` means `status = 'active'`; "future" additionally requires `date + startTime > now` (`SD-4`, `SD-5`).
- **Daily limit counts only `active` status** — completed bookings from earlier the same day do NOT consume the 1-booking-per-day limit (`BR-5`).
- **Overlap formula** — `max(E_start, R_start) < min(E_end, R_end)`; back-to-back bookings are explicitly allowed (`BR-4`).
- **Cancellation cut-off** — `now <= date + startTime - 1 hour`; exactly 60 min before is allowed, 59 min 59 sec is rejected (`BR-8`).
- **Booking creation must be atomic** — overlap check + insert inside a single DB transaction (`SD-7`).
- **All times are server-local single timezone** — no UTC conversion, no DST handling (`SD-2`).
- **Error response shape** is mandated: `{ error, code, details }` with specific machine-readable codes per rule (`NFR-3`).
- **Availability endpoint is public** — no auth required for `GET /courts` and `GET /courts/:id/availability` (`AC-3`).
