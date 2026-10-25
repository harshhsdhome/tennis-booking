# AGENTS.md (Plan Mode)

This file provides guidance to agents when working in Plan mode in this repository.

## Architectural Constraints (non-obvious)

- Booking creation must be a **single atomic transaction**: read active bookings for overlap check + insert. Two separate queries will create a race condition (`SD-7`, `BR-4`).
- Lazy status transition (`active → completed`) must be applied **before** evaluating `BR-5` (daily limit) and `BR-6` (future limit) — otherwise completed bookings incorrectly block new ones.
- `BR-5` and `BR-6` are **independent, concurrent checks** — both must pass. A booking on a new date can fail `BR-6` even if `BR-5` passes.
- The `freeSlots` response for `FR-2` is derived by **subtracting active bookings from `[06:00, 22:00]`** — cancelled/completed bookings are invisible to availability.
- `GET /bookings/mine` triggers lazy completion and **persists** the status changes to the DB — it is not a read-only endpoint.
- Cancellation (`FR-5`) must recalculate the cut-off against **live clock time** at request time, not at booking creation time.

## Requirement Traceability

- Every endpoint maps to a requirement ID. When planning an implementation, trace decisions back to `requirements.md` IDs (e.g. `BR-4`, `AC-3`).
- Error codes are fixed by `NFR-3` — do not invent new codes; use only those listed in `requirements.md §6`.
