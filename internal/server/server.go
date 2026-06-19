package server

import (
	"encoding/json"
	"fmt"
	"log"
	"math/rand"
	"net/http"
	"strings"
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

type apiError struct {
	Status  int    `json:"-"`
	Error   string `json:"error"`
	Param   string `json:"param,omitempty"`
	Details string `json:"details,omitempty"`
}

var (
	allowedBodyParts = []string{"chest", "legs", "back", "arms", "shoulders", "core", "full body"}
	allowedStyles    = []string{"strength", "cardio", "flexibility", "balance"}

	bodyPartAliases = map[string]string{
		"chest":     "chest",
		"legs":      "legs",
		"back":      "back",
		"arms":      "arms",
		"shoulders": "shoulders",
		"core":      "core",
		"full body": "full body",
		"full-body": "full body",
		"fullbody":  "full body",
	}
	styleAliases = map[string]string{
		"strength":    "strength",
		"cardio":      "cardio",
		"flexibility": "flexibility",
		"balance":     "balance",
	}
)

// Server struct holds dependencies (expandable later)
type Server struct{}

// New initializes a new server
func New() *Server {
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
	bodyPart, style, err := parseFilters(r)
	if err != nil {
		writeAPIError(w, err)
		return
	}

	filtered := filterWorkouts(bodyPart, style)
	if len(filtered) == 0 {
		writeError(w, http.StatusNotFound, "no workouts match the requested filters", fmt.Sprintf("bodyPart=%q style=%q", bodyPart, style))
		return
	}

	rand.Seed(time.Now().UnixNano())
	choice := filtered[rand.Intn(len(filtered))]

	writeJSON(w, choice)
}

// handlePlan returns a full workout plan (flat list of exercises)
func (s *Server) handlePlan(w http.ResponseWriter, r *http.Request) {
	bodyPart, style, err := parseFilters(r)
	if err != nil {
		writeAPIError(w, err)
		return
	}

	filtered := filterWorkouts(bodyPart, style)
	if len(filtered) == 0 {
		writeError(w, http.StatusNotFound, "no workouts match the requested filters", fmt.Sprintf("bodyPart=%q style=%q", bodyPart, style))
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
	opts := map[string][]string{
		"bodyParts": allowedBodyParts,
		"styles":    allowedStyles,
	}
	writeJSON(w, opts)
}

// --- Helpers ---

func parseFilters(r *http.Request) (string, string, *apiError) {
	bodyPart := r.URL.Query().Get("bodyPart")
	if bodyPart == "" {
		bodyPart = r.URL.Query().Get("body")
	}

	style := r.URL.Query().Get("style")

	if bodyPart != "" {
		normalized, ok := normalizeFilter(bodyPart, bodyPartAliases)
		if !ok {
			return "", "", &apiError{
				Status:  http.StatusBadRequest,
				Error:   "invalid bodyPart",
				Param:   "bodyPart",
				Details: fmt.Sprintf("supported values: %s", strings.Join(allowedBodyParts, ", ")),
			}
		}
		bodyPart = normalized
	}

	if style != "" {
		normalized, ok := normalizeFilter(style, styleAliases)
		if !ok {
			return "", "", &apiError{
				Status:  http.StatusBadRequest,
				Error:   "invalid style",
				Param:   "style",
				Details: fmt.Sprintf("supported values: %s", strings.Join(allowedStyles, ", ")),
			}
		}
		style = normalized
	}

	return bodyPart, style, nil
}

func normalizeFilter(raw string, allowed map[string]string) (string, bool) {
	normalized := strings.TrimSpace(strings.ToLower(raw))
	value, ok := allowed[normalized]
	return value, ok
}

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

func writeError(w http.ResponseWriter, status int, message, details string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(apiError{Error: message, Details: details}); err != nil {
		log.Printf("failed to encode error response: %v", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
	}
}

func writeAPIError(w http.ResponseWriter, apiErr *apiError) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(apiErr.Status)
	if err := json.NewEncoder(w).Encode(apiErr); err != nil {
		log.Printf("failed to encode api error response: %v", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
	}
}

func writeJSON(w http.ResponseWriter, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(v); err != nil {
		log.Printf("failed to encode response: %v", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
	}
}

func (s *Server) Mux() *http.ServeMux {
	mux := http.NewServeMux()
	mux.HandleFunc("/workout", s.handleWorkout)
	mux.HandleFunc("/workout/plan", s.handlePlan)
	mux.HandleFunc("/workout/options", s.handleOptions)
	return mux
}
