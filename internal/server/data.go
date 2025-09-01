package server

var workouts = []Workout{
	// --- Chest ---
	{Name: "Push-Ups", BodyPart: "chest", Style: "strength", Sets: 3, Reps: 12},
	{Name: "Bench Press", BodyPart: "chest", Style: "strength", Sets: 4, Reps: 8},
	{Name: "Chest Fly", BodyPart: "chest", Style: "strength", Sets: 3, Reps: 10},
	{Name: "Incline Dumbbell Press", BodyPart: "chest", Style: "strength", Sets: 3, Reps: 12},
	{Name: "Decline Bench Press", BodyPart: "chest", Style: "strength", Sets: 4, Reps: 8},
	{Name: "Cable Crossover", BodyPart: "chest", Style: "strength", Sets: 3, Reps: 12},

	// --- Legs ---
	{Name: "Squats", BodyPart: "legs", Style: "strength", Sets: 3, Reps: 10},
	{Name: "Lunges", BodyPart: "legs", Style: "strength", Sets: 3, Reps: 12},
	{Name: "Leg Press", BodyPart: "legs", Style: "strength", Sets: 4, Reps: 8},
	{Name: "Calf Raises", BodyPart: "legs", Style: "strength", Sets: 3, Reps: 15},
	{Name: "Jump Squats", BodyPart: "legs", Style: "cardio", Sets: 3, Reps: 12},
	{Name: "Step-Ups", BodyPart: "legs", Style: "strength", Sets: 3, Reps: 12},
	{Name: "Bulgarian Split Squats", BodyPart: "legs", Style: "strength", Sets: 3, Reps: 10},
	{Name: "Wall Sit", BodyPart: "legs", Style: "strength", Duration: "60s"},

	// --- Back ---
	{Name: "Pull-Ups", BodyPart: "back", Style: "strength", Sets: 3, Reps: 8},
	{Name: "Deadlifts", BodyPart: "back", Style: "strength", Sets: 4, Reps: 6},
	{Name: "Bent-Over Rows", BodyPart: "back", Style: "strength", Sets: 3, Reps: 10},
	{Name: "Lat Pulldown", BodyPart: "back", Style: "strength", Sets: 3, Reps: 12},
	{Name: "Superman Hold", BodyPart: "back", Style: "strength", Duration: "30s"},
	{Name: "Reverse Fly", BodyPart: "back", Style: "strength", Sets: 3, Reps: 12},

	// --- Arms ---
	{Name: "Bicep Curls", BodyPart: "arms", Style: "strength", Sets: 3, Reps: 12},
	{Name: "Tricep Dips", BodyPart: "arms", Style: "strength", Sets: 3, Reps: 10},
	{Name: "Hammer Curls", BodyPart: "arms", Style: "strength", Sets: 3, Reps: 12},
	{Name: "Overhead Tricep Extension", BodyPart: "arms", Style: "strength", Sets: 3, Reps: 12},
	{Name: "Concentration Curls", BodyPart: "arms", Style: "strength", Sets: 3, Reps: 10},
	{Name: "Close-Grip Push-Ups", BodyPart: "arms", Style: "strength", Sets: 3, Reps: 12},

	// --- Shoulders ---
	{Name: "Overhead Press", BodyPart: "shoulders", Style: "strength", Sets: 3, Reps: 10},
	{Name: "Lateral Raises", BodyPart: "shoulders", Style: "strength", Sets: 3, Reps: 12},
	{Name: "Arnold Press", BodyPart: "shoulders", Style: "strength", Sets: 3, Reps: 10},
	{Name: "Front Raises", BodyPart: "shoulders", Style: "strength", Sets: 3, Reps: 12},
	{Name: "Shrugs", BodyPart: "shoulders", Style: "strength", Sets: 3, Reps: 15},

	// --- Core ---
	{Name: "Plank", BodyPart: "core", Style: "strength", Duration: "60s"},
	{Name: "Crunches", BodyPart: "core", Style: "strength", Sets: 3, Reps: 20},
	{Name: "Russian Twists", BodyPart: "core", Style: "strength", Sets: 3, Reps: 15},
	{Name: "Bicycle Kicks", BodyPart: "core", Style: "strength", Sets: 3, Reps: 20},
	{Name: "Leg Raises", BodyPart: "core", Style: "strength", Sets: 3, Reps: 15},
	{Name: "Mountain Climbers (core focus)", BodyPart: "core", Style: "cardio", Sets: 3, Reps: 20},

	// --- Cardio ---
	{Name: "Burpees", BodyPart: "full body", Style: "cardio", Sets: 3, Reps: 15},
	{Name: "Jump Rope", BodyPart: "full body", Style: "cardio", Duration: "2 min"},
	{Name: "Mountain Climbers", BodyPart: "full body", Style: "cardio", Sets: 3, Reps: 20},
	{Name: "High Knees", BodyPart: "full body", Style: "cardio", Duration: "60s"},
	{Name: "Sprints", BodyPart: "full body", Style: "cardio", Duration: "30s"},
	{Name: "Bear Crawls", BodyPart: "full body", Style: "cardio", Duration: "45s"},

	// --- Flexibility ---
	{Name: "Hamstring Stretch", BodyPart: "legs", Style: "flexibility", Duration: "30s"},
	{Name: "Quad Stretch", BodyPart: "legs", Style: "flexibility", Duration: "30s"},
	{Name: "Child’s Pose", BodyPart: "back", Style: "flexibility", Duration: "45s"},
	{Name: "Cat-Cow Stretch", BodyPart: "back", Style: "flexibility", Duration: "45s"},
	{Name: "Shoulder Stretch", BodyPart: "shoulders", Style: "flexibility", Duration: "30s"},
	{Name: "Cobra Pose", BodyPart: "core", Style: "flexibility", Duration: "30s"},
	{Name: "Seated Forward Fold", BodyPart: "legs", Style: "flexibility", Duration: "45s"},

	// --- Balance ---
	{Name: "Single-Leg Stand", BodyPart: "legs", Style: "balance", Duration: "30s"},
	{Name: "Warrior III Pose", BodyPart: "legs", Style: "balance", Duration: "30s"},
	{Name: "Tree Pose", BodyPart: "legs", Style: "balance", Duration: "45s"},
	{Name: "Single-Leg Deadlift", BodyPart: "legs", Style: "balance", Sets: 3, Reps: 8},
	{Name: "Lunge with Rotation", BodyPart: "legs", Style: "balance", Sets: 3, Reps: 10},
}
