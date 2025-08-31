## Endpoints

- `GET /healthz` → JSON health
- `GET /workout?body=legs` → workouts filtered by body part
- `GET /workout?style=hiit` → workouts filtered by style
- `GET /workout/random` → one random workout


make run
curl -s localhost:8080/workout?body=legs | jq
curl -s localhost:8080/workout/random | jq


## 2025-08-30 — Step 1 (Workout Service)
- Added workout dataset (in-memory)
- Endpoints:
  - GET /workout?body=...
  - GET /workout?style=...
  - GET /workout/random
- Basic tests for filtering
- Next: consistent error responses + input validation
