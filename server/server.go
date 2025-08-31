package server

import (
	"encoding/json"
	"log/slog"
	"math/rand"
	"net/http"
	"strings"
	"time"
)

type Server struct {
	mux     *http.ServeMux
	logger  *slog.Logger
	started time.Time
}

func New(logger *slog.Logger) *Server {
	s := &Server{
		mux:     http.NewServeMux(),
		logger:  logger,
		started: time.Now(),
	}
	s.routes()
	return s
}

func (s *Server) Mux() *http.ServeMux { return s.mux }

func (s *Server) routes() {
	s.mux.HandleFunc("/", s.handleRoot)
	s.mux.HandleFunc("/healthz", s.handleHealth)
	s.mux.HandleFunc("/workout", s.handleWorkout)
	s.mux.HandleFunc("/workout/random", s.handleWorkoutRandom)
}

// -------- shared error helpers --------

type errorResponse struct {
	Error string `json:"error"`
}

func writeJSONError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(errorResponse{Error: msg})
}

// -------- health --------

type healthResponse struct {
	Status        string `json:"status"`
	UptimeSeconds int64  `json:"uptime_seconds"`
	Time          string `json:"time"`
}

func (s *Server) handleRoot(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSONError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	_, _ = w.Write([]byte("workout service is running\n"))
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSONError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	resp := healthResponse{
		Status:        "ok",
		UptimeSeconds: int64(time.Since(s.started).Seconds()),
		Time:          time.Now().UTC().Format(time.RFC3339),
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(resp)
}

// -------- workouts --------

type Workout struct {
	Name     string `json:"name"`
	BodyPart string `json:"body_part"`
	Style    string `json:"style"`
	Sets     int    `json:"sets"`
	Reps     int    `json:"reps"`
	Duration string `json:"duration,omitempty"`
}

var workouts = []Workout{
	{"Push-ups", "chest", "strength", 3, 15, ""},
	{"Squats", "legs", "strength", 3, 20, ""},
	{"Plank", "core", "stability", 3, 0, "60s"},
	{"Burpees", "full", "hiit", 4, 12, ""},
	{"Mountain Climbers", "core", "hiit", 4, 20, ""},
	{"Deadlifts", "back", "strength", 4, 8, ""},
	{"Jump Rope", "full", "cardio", 1, 0, "5m"},
}

func (s *Server) handleWorkout(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSONError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	body := strings.ToLower(r.URL.Query().Get("body"))
	style := strings.ToLower(r.URL.Query().Get("style"))

	var result []Workout
	for _, wo := range workouts {
		if body != "" && wo.BodyPart == body {
			result = append(result, wo)
		} else if style != "" && wo.Style == style {
			result = append(result, wo)
		}
	}

	if len(result) == 0 {
		writeJSONError(w, http.StatusNotFound, "no workouts found")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(result)
}

func (s *Server) handleWorkoutRandom(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSONError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	rand.Seed(time.Now().UnixNano())
	wo := workouts[rand.Intn(len(workouts))]
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(wo)
}
