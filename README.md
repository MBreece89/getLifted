# Workout Service 🏋️‍♂️
A simple Go service that generates workouts and full workout plans. Filter by **body part** or **style** and get random exercises or a complete plan.

## Quick Start

### Prerequisites
- Go 1.21+ installed
- Node 20+ and npm installed
- Basic understanding of `go run`, `npm`, and `git`

### Setup & Build
1. Clone the repository:

```sh
git clone https://github.com/MBreece89/getLifted.git
cd getLifted
```

2. Build the backend service:

```sh
go build -o workoutservice ./cmd/workoutservice
```

3. Install frontend dependencies:

```sh
npm --prefix frontend/terminal-ui install
```

### Run the Service

#### Backend only (development):

```sh
go run ./cmd/workoutservice
```

The backend listens on `http://localhost:8080` by default.

#### Frontend terminal UI:

```sh
npm --prefix frontend/terminal-ui start
```

Open `http://localhost:4200` in your browser to use the terminal-style frontend.

#### Full stack local workflow
- Start the backend with `go run ./cmd/workoutservice`
- Start the frontend with `npm --prefix frontend/terminal-ui start`
- Use the UI at `http://localhost:4200`

### Available Frontend Commands
From the terminal UI, use:

- `help` — show available commands and backend metadata
- `get-workout [type] [bodyPart]` — fetch a random workout
- `plan [type] [bodyPart]` — fetch a full workout plan
- `options` — list supported workout types and body parts

Example:

```sh
get-workout strength legs
plan cardio core
options
```

### Backend API Endpoints

- `GET /workout` — random workout
- `GET /workout?type=<type>&bodyPart=<bodyPart>` — random workout filtered by type and body part
- `GET /workout/plan?type=<type>&bodyPart=<bodyPart>` — full workout plan
- `GET /workout/options` — listing of supported body parts and styles
- `GET /commands` — available terminal commands and parameters
- `POST /logs` — accept structured log events from the frontend

Example requests:

```sh
curl http://localhost:8080/workout
curl "http://localhost:8080/workout?type=strength&bodyPart=legs"
curl "http://localhost:8080/workout/plan?type=core&bodyPart=strength"
curl http://localhost:8080/workout/options
curl http://localhost:8080/commands
```

### Run Tests

Backend tests:

```sh
go test ./internal/server
```

Frontend tests:

```sh
npm --prefix frontend/terminal-ui run test -- --watch=false
```

### Docker

Build the Docker image:

```sh
docker build -t workout-service .
```

Run the container:

```sh
docker run -d -p 8080:8080 --name workout workout-service
```

Test endpoints:

```sh
curl http://127.0.0.1:8080/workout
curl "http://127.0.0.1:8080/workout?bodyPart=legs"
curl "http://127.0.0.1:8080/workout/plan?bodyPart=core&style=strength"
curl http://127.0.0.1:8080/workout/options
```

### Adding Exercises

1. Open `internal/server/data.go`
2. Add a new `Workout` entry to the `workouts` slice:

```go
Workout{Name: "New Exercise", BodyPart: "legs", Style: "strength", Sets: 3, Reps: 12}
```

### Contributing
- Fork the repository
- Add new workouts or improve the plan generation
- Open a pull request

### License
MIT License
