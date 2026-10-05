import { WorkoutPlan } from '../types/tracking';

export const BUILT_IN_PLANS: WorkoutPlan[] = [
  {
    id: 'plan-fullbody-3',
    name: 'Full Body Foundations',
    description: 'Three full-body strength days a week with walking in between. Add weight when all sets feel easy.',
    weeks: 8,
    level: 'Beginner',
    days: [
      { day: 0, title: 'Full Body A', kind: 'strength', exerciseIds: ['squat', 'bench-press', 'barbell-row', 'plank'] },
      { day: 1, title: 'Easy Walk', kind: 'cardio', cardioType: 'Walking', targetMinutes: 30 },
      { day: 2, title: 'Full Body B', kind: 'strength', exerciseIds: ['rdl', 'ohp', 'lat-pulldown', 'hanging-leg-raise'] },
      { day: 3, title: 'Rest', kind: 'rest' },
      { day: 4, title: 'Full Body C', kind: 'strength', exerciseIds: ['leg-press', 'incline-db-press', 'seated-row', 'cable-crunch'] },
      { day: 5, title: 'Easy Walk', kind: 'cardio', cardioType: 'Walking', targetMinutes: 40 },
      { day: 6, title: 'Rest', kind: 'rest' },
    ],
  },
  {
    id: 'plan-ppl-6',
    name: 'Push / Pull / Legs',
    description: 'Classic six-day split for building muscle. Sunday is a full rest day.',
    weeks: 12,
    level: 'Intermediate',
    days: [
      { day: 0, title: 'Push', kind: 'strength', exerciseIds: ['bench-press', 'ohp', 'incline-db-press', 'lateral-raise', 'tricep-pushdown'] },
      { day: 1, title: 'Pull', kind: 'strength', exerciseIds: ['deadlift', 'pull-up', 'barbell-row', 'face-pull', 'barbell-curl'] },
      { day: 2, title: 'Legs', kind: 'strength', exerciseIds: ['squat', 'rdl', 'leg-press', 'leg-curl', 'calf-raise'] },
      { day: 3, title: 'Push', kind: 'strength', exerciseIds: ['db-shoulder-press', 'chest-press-machine', 'dip', 'lateral-raise', 'skull-crusher'] },
      { day: 4, title: 'Pull', kind: 'strength', exerciseIds: ['lat-pulldown', 'seated-row', 'db-row', 'rear-delt-fly', 'hammer-curl'] },
      { day: 5, title: 'Legs', kind: 'strength', exerciseIds: ['front-squat', 'hip-thrust', 'lunge', 'leg-extension', 'calf-raise'] },
      { day: 6, title: 'Rest', kind: 'rest' },
    ],
  },
  {
    id: 'plan-run-base',
    name: 'Run Base Builder',
    description: 'Build an aerobic base with easy runs, one interval session and two strength days.',
    weeks: 6,
    level: 'Beginner',
    days: [
      { day: 0, title: 'Easy Run', kind: 'cardio', cardioType: 'Running', targetMinutes: 25 },
      { day: 1, title: 'Strength', kind: 'strength', exerciseIds: ['goblet-squat', 'push-up', 'db-row', 'glute-bridge', 'plank'] },
      { day: 2, title: 'Intervals', kind: 'cardio', cardioType: 'HIIT', targetMinutes: 20 },
      { day: 3, title: 'Mobility', kind: 'mobility', cardioType: 'Mobility', targetMinutes: 15 },
      { day: 4, title: 'Easy Run', kind: 'cardio', cardioType: 'Running', targetMinutes: 30 },
      { day: 5, title: 'Long Easy Run', kind: 'cardio', cardioType: 'Running', targetMinutes: 40 },
      { day: 6, title: 'Rest', kind: 'rest' },
    ],
  },
];

export const getPlan = (id: string, custom: WorkoutPlan[] = []) =>
  [...BUILT_IN_PLANS, ...custom].find((p) => p.id === id);
