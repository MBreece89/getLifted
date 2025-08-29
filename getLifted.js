const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Exercise databases for different styles
const exercises = {
  functional: {
    warmup: [
      { name: "Dynamic Arm Circles", duration: "30 seconds", sets: 1, reps: "10 each direction" },
      { name: "Leg Swings", duration: "30 seconds", sets: 1, reps: "10 each leg" },
      { name: "Hip Circles", duration: "30 seconds", sets: 1, reps: "10 each direction" },
      { name: "Bodyweight Squats", duration: "1 minute", sets: 1, reps: "10-15" }
    ],
    main: [
      { name: "Goblet Squats", sets: 3, reps: "12-15", rest: "60s", equipment: "Dumbbell/Kettlebell" },
      { name: "Push-ups", sets: 3, reps: "8-12", rest: "60s", equipment: "Bodyweight" },
      { name: "Single Arm Rows", sets: 3, reps: "10 each arm", rest: "60s", equipment: "Dumbbell" },
      { name: "Plank", sets: 3, reps: "30-45 seconds", rest: "45s", equipment: "Bodyweight" },
      { name: "Lunges", sets: 3, reps: "10 each leg", rest: "60s", equipment: "Bodyweight" },
      { name: "Mountain Climbers", sets: 3, reps: "30 seconds", rest: "45s", equipment: "Bodyweight" },
      { name: "Dead Bug", sets: 3, reps: "8 each side", rest: "45s", equipment: "Bodyweight" },
      { name: "Farmer's Walk", sets: 2, reps: "30-45 seconds", rest: "90s", equipment: "Dumbbells" }
    ],
    cooldown: [
      { name: "Child's Pose", duration: "1 minute" },
      { name: "Hip Flexor Stretch", duration: "30 seconds each leg" },
      { name: "Shoulder Cross-Body Stretch", duration: "30 seconds each arm" },
      { name: "Seated Spinal Twist", duration: "30 seconds each side" }
    ]
  },
  
  bodybuilding: {
    warmup: [
      { name: "Light Cardio", duration: "5 minutes", sets: 1, reps: "Treadmill/Bike" },
      { name: "Arm Circles", duration: "1 minute", sets: 1, reps: "10 each direction" },
      { name: "Shoulder Dislocations", duration: "1 minute", sets: 1, reps: "10-15" },
      { name: "Bodyweight Squats", duration: "1 minute", sets: 1, reps: "15-20" }
    ],
    main: [
      { name: "Barbell Bench Press", sets: 4, reps: "8-10", rest: "90s", equipment: "Barbell" },
      { name: "Incline Dumbbell Press", sets: 3, reps: "10-12", rest: "75s", equipment: "Dumbbells" },
      { name: "Dumbbell Flyes", sets: 3, reps: "12-15", rest: "60s", equipment: "Dumbbells" },
      { name: "Barbell Rows", sets: 4, reps: "8-10", rest: "90s", equipment: "Barbell" },
      { name: "Lat Pulldowns", sets: 3, reps: "10-12", rest: "75s", equipment: "Cable Machine" },
      { name: "Cable Rows", sets: 3, reps: "12-15", rest: "60s", equipment: "Cable Machine" },
      { name: "Overhead Press", sets: 3, reps: "8-10", rest: "90s", equipment: "Barbell/Dumbbells" },
      { name: "Lateral Raises", sets: 3, reps: "12-15", rest: "45s", equipment: "Dumbbells" },
      { name: "Rear Delt Flyes", sets: 3, reps: "15-20", rest: "45s", equipment: "Dumbbells" }
    ],
    cooldown: [
      { name: "Chest Doorway Stretch", duration: "1 minute" },
      { name: "Lat Stretch", duration: "30 seconds each arm" },
      { name: "Shoulder Rolls", duration: "1 minute" },
      { name: "Deep Breathing", duration: "2 minutes" }
    ]
  },
  
  powerlifting: {
    warmup: [
      { name: "General Warm-up", duration: "5 minutes", sets: 1, reps: "Light movement" },
      { name: "Band Pull-Aparts", duration: "2 minutes", sets: 2, reps: "15-20" },
      { name: "Glute Bridges", duration: "2 minutes", sets: 2, reps: "15" },
      { name: "Empty Bar Practice", duration: "3 minutes", sets: 1, reps: "Main lift rehearsal" }
    ],
    main: [
      { name: "Competition Squat", sets: 5, reps: "3-5", rest: "3-4 minutes", equipment: "Barbell" },
      { name: "Pause Bench Press", sets: 4, reps: "3-5", rest: "3-4 minutes", equipment: "Barbell" },
      { name: "Conventional Deadlift", sets: 4, reps: "2-4", rest: "4-5 minutes", equipment: "Barbell" },
      { name: "Close Grip Bench Press", sets: 3, reps: "5-8", rest: "2-3 minutes", equipment: "Barbell" },
      { name: "Barbell Rows", sets: 3, reps: "5-8", rest: "2 minutes", equipment: "Barbell" },
      { name: "Bulgarian Split Squats", sets: 3, reps: "8-10 each leg", rest: "90s", equipment: "Dumbbells" },
      { name: "Plank", sets: 3, reps: "45-60 seconds", rest: "60s", equipment: "Bodyweight" }
    ],
    cooldown: [
      { name: "Pigeon Pose", duration: "1 minute each leg" },
      { name: "Cat-Cow Stretch", duration: "1 minute" },
      { name: "Hip Flexor Stretch", duration: "45 seconds each leg" },
      { name: "Thoracic Spine Rotation", duration: "1 minute" }
    ]
  }
};

// Helper function to shuffle and select exercises
function selectExercises(exerciseArray, count) {
  const shuffled = [...exerciseArray].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

// Generate workout based on style
function generateWorkout(style = 'functional') {
  const workoutStyle = style.toLowerCase();
  
  if (!exercises[workoutStyle]) {
    throw new Error('Invalid workout style. Available styles: functional, bodybuilding, powerlifting');
  }
  
  const selectedExercises = exercises[workoutStyle];
  
  // Calculate approximate duration
  let totalDuration = 0;
  
  // Warmup duration
  totalDuration += selectedExercises.warmup.reduce((sum, exercise) => {
    const duration = exercise.duration || '1 minute';
    const minutes = parseInt(duration) || 1;
    return sum + minutes;
  }, 0);
  
  // Main workout duration (including rest)
  selectedExercises.main.forEach(exercise => {
    const sets = exercise.sets || 3;
    const restTime = exercise.rest ? parseInt(exercise.rest) / 60 : 1; // Convert to minutes
    const workTime = 1.5; // Approximate time per set in minutes
    totalDuration += (sets * workTime) + ((sets - 1) * restTime);
  });
  
  // Cooldown duration
  totalDuration += selectedExercises.cooldown.reduce((sum, exercise) => {
    const duration = exercise.duration || '1 minute';
    const minutes = parseInt(duration) || 1;
    return sum + minutes;
  }, 0);
  
  return {
    style: workoutStyle,
    estimatedDuration: `${Math.round(totalDuration)} minutes`,
    warmup: selectedExercises.warmup,
    mainWorkout: selectedExercises.main,
    cooldown: selectedExercises.cooldown,
    totalExercises: selectedExercises.main.length,
    generated: new Date().toISOString()
  };
}

// Routes
app.get('/', (req, res) => {
  res.json({
    message: 'Workout Generator API',
    version: '1.0.0',
    endpoints: {
      '/workout': 'GET - Generate a workout',
      '/workout?style=functional': 'GET - Generate functional workout',
      '/workout?style=bodybuilding': 'GET - Generate bodybuilding workout',
      '/workout?style=powerlifting': 'GET - Generate powerlifting workout'
    },
    availableStyles: ['functional', 'bodybuilding', 'powerlifting']
  });
});

app.get('/workout', (req, res) => {
  try {
    const style = req.query.style || 'functional';
    const workout = generateWorkout(style);
    res.json(workout);
  } catch (error) {
    res.status(400).json({
      error: error.message,
      availableStyles: ['functional', 'bodybuilding', 'powerlifting']
    });
  }
});

// Get available workout styles
app.get('/styles', (req, res) => {
  res.json({
    availableStyles: Object.keys(exercises),
    descriptions: {
      functional: 'Full-body movements focusing on real-world strength and mobility',
      bodybuilding: 'Muscle-building focused with isolation exercises and hypertrophy rep ranges',
      powerlifting: 'Strength-focused with compound movements and lower rep ranges'
    }
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

app.listen(PORT, () => {
  console.log(`Workout API server running on port ${PORT}`);
  console.log(`Visit http://localhost:${PORT} for API documentation`);
});

module.exports = app;