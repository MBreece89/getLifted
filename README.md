# getLifted

A project to learn Go

🚀 Go Advantages:

Goroutines: Each request handled concurrently with minimal memory overhead
Fast JSON encoding: Native JSON marshaling is extremely fast
Low memory footprint: ~5-10MB memory usage vs Node.js ~50MB+
No garbage collection pauses during request handling
Compiled binary: No runtime interpretation overhead

🏗️ API Features:

CORS enabled for web client access
Proper error handling with structured JSON responses
Query parameters: ?style=functional&equipment=garage
Health check endpoint for monitoring
Clean JSON responses with all workout data

Example API Calls:
bash# Default functional gym workout
GET http://localhost:8080/workout

# Functional garage workout  
GET http://localhost:8080/workout?style=functional&equipment=garage

# Bodybuilding calisthenics workout
GET http://localhost:8080/workout?style=bodybuilding&equipment=calisthenics

# Get all available options
GET http://localhost:8080/styles

# Health check
GET http://localhost:8080/health
To Run:
bash# Initialize Go module
go mod init workout-api

# Run the server
go run main.go

# Or build and run binary
go build -o workout-api
./workout-api
Performance Expectations:

100 req/min: Easily handled with <1ms response times
1000+ req/min: Still performs excellently
Memory: ~10-20MB under load vs Node.js ~100MB+
CPU: Much more efficient than interpreted languages
