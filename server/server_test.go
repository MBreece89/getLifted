package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/<your-gh-username>/go-workout/internal/server"
)

func TestHealthz(t *testing.T) {
	s := server.New(nil)

	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	rr := httptest.NewRecorder()
	s.Mux().ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rr.Code)
	}
	var payload map[string]any
	if err := json.Unmarshal(rr.Body.Bytes(), &payload); err != nil {
		t.Fatalf("invalid json: %v", err)
	}
	if payload["status"] != "ok" {
		t.Fatalf("expected status=ok, got %v", payload["status"])
	}
}

func TestWorkoutByBody(t *testing.T) {
	s := server.New(nil)

	req := httptest.NewRequest(http.MethodGet, "/workout?body=legs", nil)
	rr := httptest.NewRecorder()
	s.Mux().ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rr.Code)
	}
	var result []map[string]any
	if err := json.Unmarshal(rr.Body.Bytes(), &result); err != nil {
		t.Fatalf("invalid json: %v", err)
	}
	if len(result) == 0 {
		t.Fatalf("expected workouts, got none")
	}
	if result[0]["body_part"] != "legs" {
		t.Errorf("expected legs, got %v", result[0]["body_part"])
	}
}

func TestWorkoutNotFound(t *testing.T) {
	s := server.New(nil)

	req := httptest.NewRequest(http.MethodGet, "/workout?body=arms", nil)
	rr := httptest.NewRecorder()
	s.Mux().ServeHTTP(rr, req)

	if rr.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", rr.Code)
	}
	var payload map[string]string
	if err := json.Unmarshal(rr.Body.Bytes(), &payload); err != nil {
		t.Fatalf("invalid json: %v", err)
	}
	if payload["error"] != "no workouts found" {
		t.Errorf("unexpected error message: %v", payload)
	}
}
