# ---- Build stage ----
FROM golang:1.25-alpine AS builder
WORKDIR /app

# Copy only go.mod (no go.sum needed)
COPY go.mod ./
RUN go mod download  # harmless even if no deps

# Copy the rest of the project
COPY . .

# Build the binary
RUN go build -o workoutservice ./cmd/workoutservice

# ---- Run stage ----
FROM alpine:3.18
WORKDIR /app

# Copy the built binary
COPY --from=builder /app/workoutservice .

# Expose port 8080
EXPOSE 8080

# Run the service
CMD ["./workoutservice"]
