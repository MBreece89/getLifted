
---

### `docs/build-log.md`
```md
# Build Log

## 2025-08-30 — Step 1 (Scaffold)
- Initialized Go module and repo
- Added minimal HTTP server with `/` and `/healthz`
- Graceful shutdown, timeouts, and basic test

## 2025-08-30 — Step 2 (Workout Service + Error Handling)
- Added workout dataset (in-memory)
- Endpoints:
  - GET /workout?body=...
  - GET /workout?style=...
  - GET /workout/random
- Introduced `errorResponse` for consistent JSON errors
- Tests for successful and not-found cases
