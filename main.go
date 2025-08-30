package main

import (
	"encoding/json"
	"fmt"
	"log"
	"math/rand"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"
)

// Exercise represents a single exercise
type Exercise struct {
	Name      string `json:"name"`
	Sets      int    `json:"sets,omitempty"`
	Reps      string `json:"reps,omitempty"`
	Duration  string `json:"duration,omitempty"`
	Rest      string `json:"rest,omitempty"`
	Equipment string `json:"equipment"`
}

// Workout represents a complete workout
type Workout struct {
	Style             string     `json:"style"`
	Equipment         string     `json:"equipment"`
	EstimatedDuration string     `json:"estimatedDuration"`
	Warmup           []Exercise `json:"warmup"`
	MainWorkout      []Exercise `json:"mainWorkout"`
	Cooldown         []Exercise `json:"cooldown"`
	TotalExercises   int        `json:"totalExercises"`
	Generated        string     `json:"generated"`
}

// ErrorResponse represents an error response
type ErrorResponse struct {
	Error            string   `json:"error"`
	AvailableStyles  []string `json:"availableStyles,omitempty"`
	AvailableEquipment []string `json:"availableEquipment,omitempty"`
}

// APIInfo represents the root endpoint response
type APIInfo struct {
	Message           string            `json:"message"`
	Version          string            `json:"version"`
	Endpoints        map[string]string `json:"endpoints"`
	AvailableStyles  []string          `json:"availableStyles"`
	AvailableEquipment []string        `json:"availableEquipment"`
}

// StylesResponse represents the styles endpoint response
type StylesResponse struct {
	AvailableStyles  []string          `json:"availableStyles"`
	AvailableEquipment []string        `json:"availableEquipment"`
	Descriptions     map[string]string `json:"descriptions"`
}

// HealthResponse represents the health check response
type HealthResponse struct {
	Status    string `json:"status"`
	Timestamp string `json:"timestamp"`
}

// Exercise database
var exercises = map[string]map[string]map[string][]Exercise{
	"functional": {
		"gym": {
			"warmup": {
				{Name: "Dynamic Arm Circles", Duration: "30 seconds", Sets: 1, Reps: "10 each direction", Equipment: "None"},
				{Name: "Leg Swings", Duration: "30 seconds", Sets: 1, Reps: "10 each leg", Equipment: "None"},
				{Name: "Hip Circles", Duration: "30 seconds", Sets: 1, Reps: "10 each direction", Equipment: "None"},
				{Name: "Bodyweight Squats", Duration: "1 minute", Sets: 1, Reps: "10-15", Equipment: "None"},
			},
			"main": {
				{Name: "Goblet Squats", Sets: 3, Reps: "12-15", Rest: "60s", Equipment: "Dumbbell/Kettlebell"},
				{Name: "Push-ups", Sets: 3, Reps: "8-12", Rest: "60s", Equipment: "Bodyweight"},
				{Name: "Single Arm Rows", Sets: 3, Reps: "10 each arm", Rest: "60s", Equipment: "Dumbbell"},
				{Name: "Plank", Sets: 3, Reps: "30-45 seconds", Rest: "45s", Equipment: "Bodyweight"},
				{Name: "Lunges", Sets: 3, Reps: "10 each leg", Rest: "60s", Equipment: "Bodyweight"},
				{Name: "Cable Wood Chops", Sets: 3, Reps: "10 each side", Rest: "60s", Equipment: "Cable Machine"},
				{Name: "Dead Bug", Sets: 3, Reps: "8 each side", Rest: "45s", Equipment: "Bodyweight"},
				{Name: "Farmer's Walk", Sets: 2, Reps: "30-45 seconds", Rest: "90s", Equipment: "Dumbbells"},
			},
			"cooldown": {
				{Name: "Child's Pose", Duration: "1 minute", Equipment: "None"},
				{Name: "Hip Flexor Stretch", Duration: "30 seconds each leg", Equipment: "None"},
				{Name: "Shoulder Cross-Body Stretch", Duration: "30 seconds each arm", Equipment: "None"},
				{Name: "Seated Spinal Twist", Duration: "30 seconds each side", Equipment: "None"},
			},
		},
		"garage": {
			"warmup": {
				{Name: "Dynamic Arm Circles", Duration: "30 seconds", Sets: 1, Reps: "10 each direction", Equipment: "None"},
				{Name: "Leg Swings", Duration: "30 seconds", Sets: 1, Reps: "10 each leg", Equipment: "None"},
				{Name: "Hip Circles", Duration: "30 seconds", Sets: 1, Reps: "10 each direction", Equipment: "None"},
				{Name: "Bodyweight Squats", Duration: "1 minute", Sets: 1, Reps: "10-15", Equipment: "None"},
			},
			"main": {
				{Name: "Goblet Squats", Sets: 3, Reps: "12-15", Rest: "60s", Equipment: "Dumbbell/Kettlebell"},
				{Name: "Push-ups", Sets: 3, Reps: "8-12", Rest: "60s", Equipment: "Bodyweight"},
				{Name: "Bent Over Rows", Sets: 3, Reps: "10-12", Rest: "60s", Equipment: "Dumbbells"},
				{Name: "Plank", Sets: 3, Reps: "30-45 seconds", Rest: "45s", Equipment: "Bodyweight"},
				{Name: "Reverse Lunges", Sets: 3, Reps: "10 each leg", Rest: "60s", Equipment: "Dumbbells optional"},
				{Name: "Dumbbell Swings", Sets: 3, Reps: "15-20", Rest: "60s", Equipment: "Dumbbell"},
				{Name: "Bear Crawl", Sets: 3, Reps: "30 seconds", Rest: "60s", Equipment: "Bodyweight"},
				{Name: "Farmer's Walk", Sets: 2, Reps: "30-45 seconds", Rest: "90s", Equipment: "Dumbbells"},
			},
			"cooldown": {
				{Name: "Child's Pose", Duration: "1 minute", Equipment: "None"},
				{Name: "Hip Flexor Stretch", Duration: "30 seconds each leg", Equipment: "None"},
				{Name: "Shoulder Cross-Body Stretch", Duration: "30 seconds each arm", Equipment: "None"},
				{Name: "Standing Forward Fold", Duration: "1 minute", Equipment: "None"},
			},
		},
		"calisthenics": {
			"warmup": {
				{Name: "Arm Circles", Duration: "30 seconds", Sets: 1, Reps: "10 each direction", Equipment: "None"},
				{Name: "Leg Swings", Duration: "30 seconds", Sets: 1, Reps: "10 each leg", Equipment: "None"},
				{Name: "Hip Circles", Duration: "30 seconds", Sets: 1, Reps: "10 each direction", Equipment: "None"},
				{Name: "Jumping Jacks", Duration: "1 minute", Sets: 1, Reps: "20-30", Equipment: "None"},
			},
			"main": {
				{Name: "Bodyweight Squats", Sets: 4, Reps: "15-20", Rest: "60s", Equipment: "None"},
				{Name: "Push-ups", Sets: 4, Reps: "8-15", Rest: "60s", Equipment: "None"},
				{Name: "Pike Push-ups", Sets: 3, Reps: "6-10", Rest: "60s", Equipment: "None"},
				{Name: "Plank", Sets: 3, Reps: "45-60 seconds", Rest: "45s", Equipment: "None"},
				{Name: "Reverse Lunges", Sets: 3, Reps: "12 each leg", Rest: "60s", Equipment: "None"},
				{Name: "Mountain Climbers", Sets: 3, Reps: "30 seconds", Rest: "45s", Equipment: "None"},
				{Name: "Burpees", Sets: 3, Reps: "6-10", Rest: "90s", Equipment: "None"},
				{Name: "Single Leg Glute Bridges", Sets: 3, Reps: "10 each leg", Rest: "45s", Equipment: "None"},
			},
			"cooldown": {
				{Name: "Child's Pose", Duration: "1 minute", Equipment: "None"},
				{Name: "Hip Flexor Stretch", Duration: "30 seconds each leg", Equipment: "None"},
				{Name: "Shoulder Cross-Body Stretch", Duration: "30 seconds each arm", Equipment: "None"},
				{Name: "Seated Spinal Twist", Duration: "30 seconds each side", Equipment: "None"},
			},
		},
	},
	"bodybuilding": {
		"gym": {
			"warmup": {
				{Name: "Light Cardio", Duration: "5 minutes", Sets: 1, Reps: "Treadmill/Bike", Equipment: "Cardio Machine"},
				{Name: "Arm Circles", Duration: "1 minute", Sets: 1, Reps: "10 each direction", Equipment: "None"},
				{Name: "Shoulder Dislocations", Duration: "1 minute", Sets: 1, Reps: "10-15", Equipment: "Resistance Band"},
				{Name: "Bodyweight Squats", Duration: "1 minute", Sets: 1, Reps: "15-20", Equipment: "None"},
			},
			"main": {
				{Name: "Barbell Bench Press", Sets: 4, Reps: "8-10", Rest: "90s", Equipment: "Barbell"},
				{Name: "Incline Dumbbell Press", Sets: 3, Reps: "10-12", Rest: "75s", Equipment: "Dumbbells"},
				{Name: "Dumbbell Flyes", Sets: 3, Reps: "12-15", Rest: "60s", Equipment: "Dumbbells"},
				{Name: "Barbell Rows", Sets: 4, Reps: "8-10", Rest: "90s", Equipment: "Barbell"},
				{Name: "Lat Pulldowns", Sets: 3, Reps: "10-12", Rest: "75s", Equipment: "Cable Machine"},
				{Name: "Cable Rows", Sets: 3, Reps: "12-15", Rest: "60s", Equipment: "Cable Machine"},
				{Name: "Overhead Press", Sets: 3, Reps: "8-10", Rest: "90s", Equipment: "Barbell/Dumbbells"},
				{Name: "Lateral Raises", Sets: 3, Reps: "12-15", Rest: "45s", Equipment: "Dumbbells"},
				{Name: "Rear Delt Flyes", Sets: 3, Reps: "15-20", Rest: "45s", Equipment: "Dumbbells"},
			},
			"cooldown": {
				{Name: "Chest Doorway Stretch", Duration: "1 minute", Equipment: "None"},
				{Name: "Lat Stretch", Duration: "30 seconds each arm", Equipment: "None"},
				{Name: "Shoulder Rolls", Duration: "1 minute", Equipment: "None"},
				{Name: "Deep Breathing", Duration: "2 minutes", Equipment: "None"},
			},
		},
		"garage": {
			"warmup": {
				{Name: "Jumping Jacks", Duration: "3 minutes", Sets: 1, Reps: "30 seconds on/30 off", Equipment: "None"},
				{Name: "Arm Circles", Duration: "1 minute", Sets: 1, Reps: "10 each direction", Equipment: "None"},
				{Name: "Band Pull-Aparts", Duration: "1 minute", Sets: 1, Reps: "15-20", Equipment: "Resistance Band"},
				{Name: "Bodyweight Squats", Duration: "1 minute", Sets: 1, Reps: "15-20", Equipment: "None"},
			},
			"main": {
				{Name: "Dumbbell Bench Press", Sets: 4, Reps: "10-12", Rest: "90s", Equipment: "Dumbbells + Bench"},
				{Name: "Incline Dumbbell Press", Sets: 3, Reps: "10-12", Rest: "75s", Equipment: "Dumbbells + Bench"},
				{Name: "Dumbbell Flyes", Sets: 3, Reps: "12-15", Rest: "60s", Equipment: "Dumbbells + Bench"},
				{Name: "Bent Over Rows", Sets: 4, Reps: "10-12", Rest: "90s", Equipment: "Dumbbells"},
				{Name: "Single Arm Rows", Sets: 3, Reps: "10-12 each", Rest: "75s", Equipment: "Dumbbell + Bench"},
				{Name: "Dumbbell Pullovers", Sets: 3, Reps: "12-15", Rest: "60s", Equipment: "Dumbbell + Bench"},
				{Name: "Dumbbell Shoulder Press", Sets: 3, Reps: "10-12", Rest: "90s", Equipment: "Dumbbells"},
				{Name: "Lateral Raises", Sets: 3, Reps: "12-15", Rest: "45s", Equipment: "Dumbbells"},
				{Name: "Rear Delt Flyes", Sets: 3, Reps: "15-20", Rest: "45s", Equipment: "Dumbbells"},
			},
			"cooldown": {
				{Name: "Chest Doorway Stretch", Duration: "1 minute", Equipment: "None"},
				{Name: "Overhead Reach", Duration: "30 seconds each arm", Equipment: "None"},
				{Name: "Shoulder Rolls", Duration: "1 minute", Equipment: "None"},
				{Name: "Deep Breathing", Duration: "2 minutes", Equipment: "None"},
			},
		},
		"calisthenics": {
			"warmup": {
				{Name: "Jumping Jacks", Duration: "3 minutes", Sets: 1, Reps: "30 seconds on/30 off", Equipment: "None"},
				{Name: "Arm Circles", Duration: "1 minute", Sets: 1, Reps: "10 each direction", Equipment: "None"},
				{Name: "Shoulder Shrugs", Duration: "1 minute", Sets: 1, Reps: "15-20", Equipment: "None"},
				{Name: "Bodyweight Squats", Duration: "1 minute", Sets: 1, Reps: "15-20", Equipment: "None"},
			},
			"main": {
				{Name: "Push-ups", Sets: 4, Reps: "8-15", Rest: "90s", Equipment: "None"},
				{Name: "Diamond Push-ups", Sets: 3, Reps: "5-10", Rest: "75s", Equipment: "None"},
				{Name: "Wide Grip Push-ups", Sets: 3, Reps: "8-12", Rest: "60s", Equipment: "None"},
				{Name: "Pike Push-ups", Sets: 4, Reps: "6-10", Rest: "90s", Equipment: "None"},
				{Name: "Pseudo Planche Push-ups", Sets: 3, Reps: "3-8", Rest: "75s", Equipment: "None"},
				{Name: "Archer Push-ups", Sets: 3, Reps: "5-8 each side", Rest: "60s", Equipment: "None"},
				{Name: "Handstand Hold", Sets: 3, Reps: "15-30 seconds", Rest: "90s", Equipment: "Wall"},
				{Name: "L-Sit", Sets: 3, Reps: "10-20 seconds", Rest: "45s", Equipment: "Parallel bars/Chairs"},
				{Name: "Planche Lean", Sets: 3, Reps: "15-30 seconds", Rest: "45s", Equipment: "None"},
			},
			"cooldown": {
				{Name: "Chest Stretch", Duration: "1 minute", Equipment: "None"},
				{Name: "Shoulder Cross-Body Stretch", Duration: "30 seconds each arm", Equipment: "None"},
				{Name: "Wrist Circles", Duration: "1 minute", Equipment: "None"},
				{Name: "Child's Pose", Duration: "2 minutes", Equipment: "None"},
			},
		},
	},
	"powerlifting": {
		"gym": {
			"warmup": {
				{Name: "General Warm-up", Duration: "5 minutes", Sets: 1, Reps: "Light movement", Equipment: "Cardio Machine"},
				{Name: "Band Pull-Aparts", Duration: "2 minutes", Sets: 2, Reps: "15-20", Equipment: "Resistance Band"},
				{Name: "Glute Bridges", Duration: "2 minutes", Sets: 2, Reps: "15", Equipment: "None"},
				{Name: "Empty Bar Practice", Duration: "3 minutes", Sets: 1, Reps: "Main lift rehearsal", Equipment: "Barbell"},
			},
			"main": {
				{Name: "Competition Squat", Sets: 5, Reps: "3-5", Rest: "3-4 minutes", Equipment: "Barbell + Rack"},
				{Name: "Pause Bench Press", Sets: 4, Reps: "3-5", Rest: "3-4 minutes", Equipment: "Barbell + Bench"},
				{Name: "Conventional Deadlift", Sets: 4, Reps: "2-4", Rest: "4-5 minutes", Equipment: "Barbell"},
				{Name: "Close Grip Bench Press", Sets: 3, Reps: "5-8", Rest: "2-3 minutes", Equipment: "Barbell + Bench"},
				{Name: "Barbell Rows", Sets: 3, Reps: "5-8", Rest: "2 minutes", Equipment: "Barbell"},
				{Name: "Bulgarian Split Squats", Sets: 3, Reps: "8-10 each leg", Rest: "90s", Equipment: "Dumbbells"},
				{Name: "Plank", Sets: 3, Reps: "45-60 seconds", Rest: "60s", Equipment: "None"},
			},
			"cooldown": {
				{Name: "Pigeon Pose", Duration: "1 minute each leg", Equipment: "None"},
				{Name: "Cat-Cow Stretch", Duration: "1 minute", Equipment: "None"},
				{Name: "Hip Flexor Stretch", Duration: "45 seconds each leg", Equipment: "None"},
				{Name: "Thoracic Spine Rotation", Duration: "1 minute", Equipment: "None"},
			},
		},
		"garage": {
			"warmup": {
				{Name: "Dynamic Movement", Duration: "5 minutes", Sets: 1, Reps: "Light activity", Equipment: "None"},
				{Name: "Band Pull-Aparts", Duration: "2 minutes", Sets: 2, Reps: "15-20", Equipment: "Resistance Band"},
				{Name: "Glute Bridges", Duration: "2 minutes", Sets: 2, Reps: "15", Equipment: "None"},
				{Name: "Goblet Squats", Duration: "3 minutes", Sets: 1, Reps: "Light weight practice", Equipment: "Dumbbell"},
			},
			"main": {
				{Name: "Goblet Squats", Sets: 5, Reps: "5-8", Rest: "3 minutes", Equipment: "Heavy Dumbbell"},
				{Name: "Dumbbell Bench Press", Sets: 4, Reps: "5-8", Rest: "3 minutes", Equipment: "Dumbbells + Bench"},
				{Name: "Single Leg RDL", Sets: 4, Reps: "6-8 each leg", Rest: "2-3 minutes", Equipment: "Dumbbells"},
				{Name: "Dumbbell Rows", Sets: 3, Reps: "6-10", Rest: "2 minutes", Equipment: "Dumbbells + Bench"},
				{Name: "Overhead Press", Sets: 3, Reps: "6-10", Rest: "2-3 minutes", Equipment: "Dumbbells"},
				{Name: "Farmer's Walk", Sets: 3, Reps: "40-60 seconds", Rest: "90s", Equipment: "Heavy Dumbbells"},
				{Name: "Plank", Sets: 3, Reps: "45-60 seconds", Rest: "60s", Equipment: "None"},
			},
			"cooldown": {
				{Name: "Hip Flexor Stretch", Duration: "1 minute each leg", Equipment: "None"},
				{Name: "Shoulder Stretch", Duration: "1 minute", Equipment: "None"},
				{Name: "Spinal Twist", Duration: "45 seconds each side", Equipment: "None"},
				{Name: "Deep Breathing", Duration: "2 minutes", Equipment: "None"},
			},
		},
		"calisthenics": {
			"warmup": {
				{Name: "Dynamic Movement", Duration: "5 minutes", Sets: 1, Reps: "Light activity", Equipment: "None"},
				{Name: "Arm Swings", Duration: "2 minutes", Sets: 1, Reps: "15 each direction", Equipment: "None"},
				{Name: "Glute Bridges", Duration: "2 minutes", Sets: 2, Reps: "15", Equipment: "None"},
				{Name: "Bodyweight Squats", Duration: "3 minutes", Sets: 1, Reps: "Movement practice", Equipment: "None"},
			},
			"main": {
				{Name: "Pistol Squats", Sets: 5, Reps: "3-6 each leg", Rest: "3 minutes", Equipment: "None"},
				{Name: "One Arm Push-ups", Sets: 4, Reps: "1-5 each arm", Rest: "3 minutes", Equipment: "None"},
				{Name: "Single Leg RDL", Sets: 4, Reps: "8-12 each leg", Rest: "2-3 minutes", Equipment: "None"},
				{Name: "Archer Push-ups", Sets: 3, Reps: "5-10 each side", Rest: "2 minutes", Equipment: "None"},
				{Name: "Handstand Push-ups", Sets: 3, Reps: "3-8", Rest: "2-3 minutes", Equipment: "Wall"},
				{Name: "Human Flag Hold", Sets: 3, Reps: "10-30 seconds", Rest: "90s", Equipment: "Pull-up Bar/Pole"},
				{Name: "L-Sit", Sets: 3, Reps: "15-45 seconds", Rest: "60s", Equipment: "Parallel Bars/Chairs"},
			},
			"cooldown": {
				{Name: "Deep Hip Stretch", Duration: "1 minute each leg", Equipment: "None"},
				{Name: "Shoulder Mobility", Duration: "1 minute", Equipment: "None"},
				{Name: "Spinal Twist", Duration: "45 seconds each side", Equipment: "None"},
				{Name: "Relaxation", Duration: "2 minutes", Equipment: "None"},
			},
		},
	},
}

// Helper functions
func getAvailableStyles() []string {
	styles := make([]string, 0, len(exercises))
	for style := range exercises {
		styles = append(styles, style)
	}
	return styles
}

func getAvailableEquipment() []string {
	equipmentSet := make(map[string]bool)
	for _, styleData := range exercises {
		for equipment := range styleData {
			equipmentSet[equipment] = true
		}
	}
	
	equipment := make([]string, 0, len(equipmentSet))
	for eq := range equipmentSet {
		equipment = append(equipment, eq)
	}
	return equipment
}

func calculateDuration(workout map[string][]Exercise) int {
	totalDuration := 0

	// Warmup duration
	for _, exercise := range workout["warmup"] {
		if exercise.Duration != "" {
			if minutes := parseDuration(exercise.Duration); minutes > 0 {
				totalDuration += minutes
			} else {
				totalDuration += 1 // Default 1 minute
			}
		} else {
			totalDuration += 1
		}
	}

	// Main workout duration (including rest)
	for _, exercise := range workout["main"] {
		sets := exercise.Sets
		if sets == 0 {
			sets = 3 // Default
		}
		
		restTime := 1.0 // Default 1 minute
		if exercise.Rest != "" {
			if parsed := parseRestTime(exercise.Rest); parsed > 0 {
				restTime = parsed
			}
		}
		
		workTime := 1.5 // Approximate time per set in minutes
		totalDuration += int((float64(sets) * workTime) + (float64(sets-1) * restTime))
	}

	// Cooldown duration
	for _, exercise := range workout["cooldown"] {
		if exercise.Duration != "" {
			if minutes := parseDuration(exercise.Duration); minutes > 0 {
				totalDuration += minutes
			} else {
				totalDuration += 1
			}
		} else {
			totalDuration += 1
		}
	}

	return totalDuration
}

func parseDuration(duration string) int {
	duration = strings.ToLower(duration)
	if strings.Contains(duration, "minute") {
		parts := strings.Fields(duration)
		if len(parts) > 0 {
			if minutes, err := strconv.Atoi(parts[0]); err == nil {
				return minutes
			}
		}
	}
	return 0
}

func parseRestTime(rest string) float64 {
	rest = strings.ToLower(rest)
	if strings.Contains(rest, "s") {
		rest = strings.Replace(rest, "s", "", -1)
		if seconds, err := strconv.Atoi(rest); err == nil {
			return float64(seconds) / 60.0 // Convert to minutes
		}
	}
	return 0
}

func generateWorkout(style, equipment string) (*Workout, error) {
	style = strings.ToLower(style)
	equipment = strings.ToLower(equipment)

	styleData, exists := exercises[style]
	if !exists {
		return nil, fmt.Errorf("invalid workout style")
	}

	workoutData, exists := styleData[equipment]
	if !exists {
		return nil, fmt.Errorf("invalid equipment type for %s", style)
	}

	duration := calculateDuration(workoutData)

	workout := &Workout{
		Style:             style,
		Equipment:         equipment,
		EstimatedDuration: fmt.Sprintf("%d minutes", duration),
		Warmup:           workoutData["warmup"],
		MainWorkout:      workoutData["main"],
		Cooldown:         workoutData["cooldown"],
		TotalExercises:   len(workoutData["main"]),
		Generated:        time.Now().UTC().Format(time.RFC3339),
	}

	return workout, nil
}

// Middleware for CORS
func corsMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Accept, Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization")
		
		if r.Method == "OPTIONS" {
			return
		}
		
		next.ServeHTTP(w, r)
	})
}

// Middleware for JSON content type
func jsonMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		next.ServeHTTP(w, r)
	})
}

// Handler functions
func rootHandler(w http.ResponseWriter, r *http.Request) {
	info := APIInfo{
		Message: "Workout Generator API",
		Version: "2.0.0",
		Endpoints: map[string]string{
			"/workout":                    "GET - Generate a workout",
			"/workout?style=functional":   "GET - Generate functional workout",
			"/workout?equipment=garage":   "GET - Generate garage workout",
			"/styles":                     "GET - Get available styles and equipment",
			"/health":                     "GET - Health check",
		},
		AvailableStyles:    getAvailableStyles(),
		AvailableEquipment: getAvailableEquipment(),
	}

	json.NewEncoder(w).Encode(info)
}

func workoutHandler(w http.ResponseWriter, r *http.Request) {
	style := r.URL.Query().Get("style")
	if style == "" {
		style = "functional"
	}

	equipment := r.URL.Query().Get("equipment")
	if equipment == "" {
		equipment = "gym"
	}

	workout, err := generateWorkout(style, equipment)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		errorResp := ErrorResponse{
			Error:              err.Error(),
			AvailableStyles:    getAvailableStyles(),
			AvailableEquipment: getAvailableEquipment(),
		}
		json.NewEncoder(w).Encode(errorResp)
		return
	}

	json.NewEncoder(w).Encode(workout)
}

func stylesHandler(w http.ResponseWriter, r *http.Request) {
	response := StylesResponse{
		AvailableStyles:    getAvailableStyles(),
		AvailableEquipment: getAvailableEquipment(),
		Descriptions: map[string]string{
			"functional":    "Full-body movements focusing on real-world strength and mobility",
			"bodybuilding":  "Muscle-building focused with isolation exercises and hypertrophy rep ranges",
			"powerlifting":  "Strength-focused with compound movements and lower rep ranges",
		},
	}

	json.NewEncoder(w).Encode(response)
}

func healthHandler(w http.ResponseWriter, r *http.Request) {
	health := HealthResponse{
		Status:    "healthy",
		Timestamp: time.Now().UTC().Format(time.RFC3339),
	}

	json.NewEncoder(w).Encode(health)
}

func notFoundHandler(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusNotFound)
	errorResp := ErrorResponse{
		Error: "Endpoint not found",
	}
	json.NewEncoder(w).Encode(errorResp)
}

func main() {
	// Seed random number generator
	rand.Seed(time.Now().UnixNano())

	// Routes
	http.HandleFunc("/", corsMiddleware(jsonMiddleware(rootHandler)))
	http.HandleFunc("/workout", corsMiddleware(jsonMiddleware(workoutHandler)))
	http.HandleFunc("/styles", corsMiddleware(jsonMiddleware(stylesHandler)))
	http.HandleFunc("/health", corsMiddleware(jsonMiddleware(healthHandler)))

	// Get port from environment or default to 8080
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("Workout API server starting on port %s", port)
	log.Printf("Visit http://localhost:%s for API documentation", port)

	// Start server
	if err := http.ListenAndServe(":"+port, nil); err != nil {
		log.Fatal("Server failed to start:", err)
	}
}