import { MetricConfig, QuickWorkoutTemplate } from '../types/health';

/** Cards the user can show or hide on the Today screen. Static options, not user data. */
export const METRIC_CONFIGS: MetricConfig[] = [
  {
    id: 'steps',
    label: 'Daily Steps',
    category: 'Activity',
    description: 'Steps you enter, shown against your daily goal',
    defaultVisible: true,
  },
  {
    id: 'sleep',
    label: 'Sleep Summary',
    category: 'Recovery',
    description: 'Duration and stage breakdown of your latest logged sleep',
    defaultVisible: true,
  },
  {
    id: 'live_hr',
    label: 'Live Heart Rate',
    category: 'Cardio',
    description: 'Live heart rate streamed from your watch or a Bluetooth sensor',
    defaultVisible: true,
  },
  {
    id: 'active_calories',
    label: 'Active Burn (kcal)',
    category: 'Activity',
    description: 'Calories burned across your logged workouts',
    defaultVisible: false,
  },
  {
    id: 'movement_distance',
    label: 'Cardio Distance',
    category: 'Activity',
    description: 'GPS distance across your logged workouts',
    defaultVisible: false,
  },
];

/** One-tap workout templates (suggestions, not history). */
export const QUICK_WORKOUT_SUGGESTIONS: QuickWorkoutTemplate[] = [
  {
    id: 'qw-core',
    title: '10-Min Core Reset',
    category: 'Core',
    durationMinutes: 10,
    estimatedCalories: 45,
    estimatedCardioLoad: 18,
    rpe: 5,
    description: 'Plank rotations, deadbugs, and hollow holds to activate postural stability.',
  },
  {
    id: 'qw-walk',
    title: '15-Min Post-Meal Walk',
    category: 'Walking',
    durationMinutes: 15,
    estimatedCalories: 68,
    estimatedCardioLoad: 15,
    rpe: 3,
    description: 'Gentle zone 1 pacing after a meal.',
  },
  {
    id: 'qw-mobility',
    title: 'Quick Mobility Drill',
    category: 'Mobility',
    durationMinutes: 12,
    estimatedCalories: 30,
    estimatedCardioLoad: 10,
    rpe: 3,
    description: 'Hip openers, thoracic rotation, and ankle mobility flow.',
  },
  {
    id: 'qw-hiit',
    title: '8-Min Tabata Ignition',
    category: 'HIIT',
    durationMinutes: 8,
    estimatedCalories: 85,
    estimatedCardioLoad: 35,
    rpe: 8,
    description: '20s maximum burst, 10s rest micro-intervals.',
  },
];
