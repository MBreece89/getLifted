package server_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/MBreece89/getLifted/internal/server"
)

func TestQueryNormalization(t *testing.T) {
	s := server.New()

	req := httptest.NewRequest(http.MethodGet, "/workout?bodyPart=Full%20Body&style=CaRdIo", nil)
	rr := httptest.NewRecorder()
	s.Mux().ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rr.Code)
	}

	var workout server.Workout
	if err := json.Unmarshal(rr.Body.Bytes(), &workout); err != nil {
		t.Fatalf("invalid json: %v", err)
	}
	if workout.BodyPart != "full body" {
		t.Errorf("expected bodyPart=full body, got %q", workout.BodyPart)
	}
	if workout.Style != "cardio" {
		t.Errorf("expected style=cardio, got %q", workout.Style)
	}
}

func TestBodyAliasQueryParam(t *testing.T) {
	s := server.New()

	req := httptest.NewRequest(http.MethodGet, "/workout/plan?body=legs&style=strength", nil)
	rr := httptest.NewRecorder()
	s.Mux().ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rr.Code)
	}

	var plan []server.Workout
	if err := json.Unmarshal(rr.Body.Bytes(), &plan); err != nil {
		t.Fatalf("invalid json: %v", err)
	}
	if len(plan) == 0 {
		t.Fatal("expected at least one workout in the plan")
	}
}

func TestInvalidStyleReturnsBadRequest(t *testing.T) {
	s := server.New()

	req := httptest.NewRequest(http.MethodGet, "/workout?bodyPart=legs&style=badstyle", nil)
	rr := httptest.NewRecorder()
	s.Mux().ServeHTTP(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rr.Code)
	}

	var errResp map[string]any
	if err := json.Unmarshal(rr.Body.Bytes(), &errResp); err != nil {
		t.Fatalf("invalid json: %v", err)
	}
	if errResp["error"] != "invalid style" {
		t.Errorf("expected invalid style error, got %v", errResp["error"])
	}
}
