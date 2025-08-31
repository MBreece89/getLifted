package server

import (
	"encoding/json"
	"log"
	"math/rand"
	"net/http"
	"time"
)

// Workout represents a single exercise
type Workout struct {
	Name     string `json:"name"`
	BodyPart string `json:"bodyPart"`
	Style    string `json:"style"`
	Sets     int    `json:"sets,omitempty"`
	Reps     int    `json:"reps,omitempty"`
	Duration string `json:"duration,omitempty"`
}

// Server struct holds dependencies (expandable later)
type Server struct{}

// NewServer initializes a new server
func NewServer() *Server {
	return &Server{}
}

// Routes registers HTTP handlers
func (s *Server) Routes() {
	http.HandleFunc("/workout", s.handleWorkout)
	http.HandleFunc("/workout/plan", s.handlePlan)
	http.HandleFunc("/workout/options", s.handleOptions)
}

// --- Handlers ---

// handleWorkout returns a single random workout (optionally filtered)
func (s *Server) handleWorkout(w http.ResponseWriter, r *http.Request) {
	bodyPart := r.URL.Query().Get("bodyPart")
	style := r.URL.Query().Get("style")

	filtered := filterWorkouts(bodyPart, style)
	if len(filtered) == 0 {
		http.Error(w, "no workouts found", http.StatusNotFound)
		return
	}

	rand.Seed(time.Now().UnixNano())
	choice := filtered[rand.Intn(len(filtered))]

	writeJSON(w, choice)
}

// handlePlan returns a full workout plan (flat list of exercises)
func (s *Server) handlePlan(w http.ResponseWriter, r *http.Request) {
	bodyPart := r.URL.Query().Get("bodyPart")
	style := r.URL.Query().Get("style")

	filtered := filterWorkouts(bodyPart, style)
	if len(filtered) == 0 {
		http.Error(w, "no workouts found", http.StatusNotFound)
		return
	}

	// Shuffle and take up to 5 exercises
	rand.Seed(time.Now().UnixNano())
	rand.Shuffle(len(filtered), func(i, j int) { filtered[i], filtered[j] = filtered[j], filtered[i] })

	limit := 5
	if len(filtered) < limit {
		limit = len(filtered)
	}
	plan := filtered[:limit]

	writeJSON(w, plan)
}

// handleOptions returns the available body parts and styles
func (s *Server) handleOptions(w http.ResponseWriter, r *http.Request) {
	bodyParts := []string{"chest", "legs", "back", "arms", "shoulders", "core", "full body"}
	styles := []string{"strength", "cardio", "flexibility", "balance"}

	opts := map[string][]string{
		"bodyParts": bodyParts,
		"styles":    styles,
	}
	writeJSON(w, opts)
}

// --- Helpers ---

func filterWorkouts(bodyPart, style string) []Workout {
	var result []Workout
	for _, w := range workouts {
		if (bodyPart == "" || w.BodyPart == bodyPart) &&
			(style == "" || w.Style == style) {
			result = append(result, w)
		}
	}
	return result
}

func writeJSON(w http.ResponseWriter, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(v); err != nil {
		log.Printf("failed to encode response: %v", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
	}
}
