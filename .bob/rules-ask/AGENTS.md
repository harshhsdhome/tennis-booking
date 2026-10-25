# AGENTS.md (Ask Mode)

This file provides guidance to agents when answering questions in this repository.

## Documentation Context (non-obvious)

- `requirements.md` is the **only** authoritative source. There is no separate ADR folder, wiki, or design doc.
- Requirement IDs (`AC-*`, `FR-*`, `BR-*`, `NFR-*`, `SD-*`) are used as canonical references — always cite them when explaining behaviour.
- "Active booking" and "future booking" have **distinct technical definitions** in this project (`SD-4`, `SD-5`) — do not use them interchangeably.
- The spec deliberately excludes: timezone handling, admin UI, court creation/deletion, password reset, email confirmation, and background schedulers. These are out of scope, not oversights.
