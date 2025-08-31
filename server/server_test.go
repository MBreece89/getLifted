package server_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"workout-service/internal/server"
)

func TestWorkoutPlan(t *testing.T) {
	s := server.New(nil)

	req := httptest.NewRequest(http.MethodGet, "/workout/plan?body=legs", nil)
	rr := httptest.NewRecorder()
	s.Mux().ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rr.Code)
	}

	var plan map[string]any
	if err := json.Unmarshal(rr.Body.Bytes(), &plan); err != nil {
		t.Fatalf("invalid json: %v", err)
	}
	if plan["body_part"] != "legs" {
		t.Errorf("expected body_part=legs, got %v", plan["body_part"])
	}
	exercises, ok := plan["exercises"].([]any)
	if !ok || len(exercises) == 0 {
		t.Errorf("expected exercises array, got %v", plan["exercises"])
	}
}
