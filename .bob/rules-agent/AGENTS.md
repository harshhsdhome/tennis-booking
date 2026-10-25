# AGENTS.md (Agent/Code Mode)

This file provides guidance to agents when writing code in this repository.

## Implementation Rules (non-obvious)

- **No implementation exists yet.** When building, derive all behaviour strictly from `requirements.md`. Do not add endpoints, fields, or rules beyond the spec.
- The DB schema is defined by `SD-8`: `id`, `userId`, `courtId`, `date` (`YYYY-MM-DD`), `startTime` (`HH:mm`), `endTime` (`HH:mm`), `status` (`active|cancelled|completed`), `createdAt`.
- `startTime`/`endTime` are stored as `HH:mm` strings, not timestamps — time arithmetic must parse and compare them as strings or convert to minutes-since-midnight.
- Lazy completion must update the DB (not just return in-memory state) so subsequent queries see the updated status (`FR-6`).
- Overlap query must filter `status = 'active'` — do not rely on application-layer filtering after fetching all bookings (`BR-4`).
- Use a composite index on `(courtId, date)` for the availability query (`NFR-1`).
- The `GET /bookings/mine` response must include `courtName` (joined from courts table), not just `courtId` (`FR-4`).
- `POST /auth/register` normalises email to lowercase and trims whitespace before storing (`AC-1`).
- `DELETE /bookings/:id/cancel` — check ownership (`403`) before checking cancellation rules (`400`) (`AC-4`, `FR-5`).
