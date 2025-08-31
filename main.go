package main

import (
	"log"
	"net/http"

	"workout-service/internal/server"
)

func main() {
	srv := server.New(nil)

	log.Println("Workout service running on :8080")
	if err := http.ListenAndServe(":8080", srv.Mux()); err != nil {
		log.Fatal(err)
	}
}
