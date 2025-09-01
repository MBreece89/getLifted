package main

import (
	"log"
	"net/http"

	"github.com/MBreece89/getLifted/internal/server"
)

func main() {
	srv := server.New()
	log.Println("Workout service running on :8080")
	log.Fatal(http.ListenAndServe(":8080", srv.Mux()))

}
