import { getExercise } from './exercises';

export interface StrengthTemplate {
  id: string;
  name: string;
  blurb: string;
  exerciseIds: string[];
}

/** Ready-made strength sessions: tap Start to log one, or Save to keep a copy under My routines. */
export const STRENGTH_TEMPLATES: StrengthTemplate[] = [
  { id: 'full-a', name: 'Full body A', blurb: 'Three times a week, alternating with B. Squat, press, row.', exerciseIds: ['squat', 'bench-press', 'barbell-row', 'plank'] },
  { id: 'full-b', name: 'Full body B', blurb: 'The other half of the full body split. Hinge, press, pull.', exerciseIds: ['deadlift', 'ohp', 'lat-pulldown', 'hanging-leg-raise'] },
  { id: 'push', name: 'Push day', blurb: 'Chest, shoulders and triceps.', exerciseIds: ['bench-press', 'ohp', 'incline-db-press', 'lateral-raise', 'tricep-pushdown'] },
  { id: 'pull', name: 'Pull day', blurb: 'Back and biceps.', exerciseIds: ['deadlift', 'pull-up', 'seated-row', 'face-pull', 'barbell-curl'] },
  { id: 'legs', name: 'Leg day', blurb: 'Quads, hamstrings, glutes and calves.', exerciseIds: ['squat', 'rdl', 'leg-press', 'leg-curl', 'calf-raise'] },
  { id: 'upper', name: 'Upper body', blurb: 'For an upper and lower split.', exerciseIds: ['bench-press', 'barbell-row', 'ohp', 'lat-pulldown', 'db-curl', 'tricep-pushdown'] },
  { id: 'lower', name: 'Lower body', blurb: 'For an upper and lower split.', exerciseIds: ['squat', 'rdl', 'lunge', 'hip-thrust', 'calf-raise'] },
  { id: 'home', name: 'At home, no equipment', blurb: 'Bodyweight only.', exerciseIds: ['push-up', 'goblet-squat', 'glute-bridge', 'plank', 'burpee'] },
  { id: 'kettlebell', name: 'Kettlebell and dumbbell', blurb: 'One kettlebell and a pair of dumbbells.', exerciseIds: ['kb-swing', 'goblet-squat', 'db-row', 'db-shoulder-press', 'farmer-carry'] },
].map((t) => ({ ...t, exerciseIds: t.exerciseIds.filter((id) => !!getExercise(id)) }));
