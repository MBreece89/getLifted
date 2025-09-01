# Workout Service 🏋️‍♂️
A simple Go service that generates workouts and full workout plans. Filter by **body part** or **style** and get random exercises or a complete plan.

## Quick Start

### Prerequisites
- Go 1.21+ installed
- Basic understanding of `go run` and `go build`

### Setup & Build
1. Clone the repository:

git clone https://github.com/your-username/workout-service.git
cd workout-service

markdown
Copy code

2. Build the service:

go build -o workoutservice ./cmd/workoutservice

shell
Copy code

This generates an executable named `workoutservice`.

### Run the Service
#### Development (with `go run`):

go run ./cmd/workoutservice

shell
Copy code

#### Production (compiled binary):

./workoutservice

nginx
Copy code

The server runs on `http://localhost:8080` by default.

### Example Requests

Get a random workout:

curl http://localhost:8080/workout

css
Copy code

Filter by body part:

curl http://localhost:8080/workout?bodyPart=legs

sql
Copy code

Get a full workout plan:

curl http://localhost:8080/workout/plan?bodyPart=core&style=strength

arduino
Copy code

See available options:

curl http://localhost:8080/workout/options

markdown
Copy code

**Example response:**

{
"bodyParts": ["chest", "legs", "back", "arms", "shoulders", "core", "full body"],
"styles": ["strength", "cardio", "flexibility", "balance"]
}

markdown
Copy code

### Adding Exercises
1. Open `internal/server/data.go`
2. Add a new `Workout` struct to the `workouts` slice:

{Name: "New Exercise", BodyPart: "legs", Style: "strength", Sets: 3, Reps: 12}

markdown
Copy code

3.  Build service in docker
# 1️⃣ Build the Docker image
docker build -t workout-service .

# 2️⃣ Stop and remove any existing container named "workout"
docker stop workout -ErrorAction SilentlyContinue
docker rm workout -ErrorAction SilentlyContinue

# 3️⃣ Run the container
docker run -d -p 8080:8080 --name workout workout-service

# 4️⃣ Wait a few seconds for the server to start
Start-Sleep -Seconds 3

# 5️⃣ Test endpoints
Write-Host "Testing /workout endpoint..."
curl http://127.0.0.1:8080/workout

Write-Host "`nTesting /workout?bodyPart=legs endpoint..."
curl "http://127.0.0.1:8080/workout?bodyPart=legs"

Write-Host "`nTesting /workout/plan endpoint..."
curl "http://127.0.0.1:8080/workout/plan?bodyPart=core&style=strength"

Write-Host "`nTesting /workout/options endpoint..."
curl http://127.0.0.1:8080/workout/options



### Contributing
- Fork the repository
- Add new workouts or improve the plan generation
- Open a pull request

### License
MIT License