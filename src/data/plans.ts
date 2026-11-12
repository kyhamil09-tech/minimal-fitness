import { PlanDay, WorkoutPlan } from '../types/tracking';

type Day = PlanDay['day'];

const rest = (day: Day, title = 'Rest'): PlanDay => ({ day, title, kind: 'rest' });
const walk = (day: Day, title: string, targetMinutes: number): PlanDay => ({ day, title, kind: 'cardio', cardioType: 'Walking', targetMinutes });
const run = (day: Day, title: string, targetMinutes: number): PlanDay => ({ day, title, kind: 'cardio', cardioType: 'Running', targetMinutes });
const ride = (day: Day, title: string, targetMinutes: number): PlanDay => ({ day, title, kind: 'cardio', cardioType: 'Cycling', targetMinutes });
const hiit = (day: Day, title: string, targetMinutes: number): PlanDay => ({ day, title, kind: 'cardio', cardioType: 'HIIT', targetMinutes });
const mobility = (day: Day, title: string, targetMinutes: number): PlanDay => ({ day, title, kind: 'mobility', cardioType: 'Mobility', targetMinutes });
const lift = (day: Day, title: string, exerciseIds: string[]): PlanDay => ({ day, title, kind: 'strength', exerciseIds });

/** Seven walking days in a row from a list of minutes, Monday first. The last two are the long walk and an easy stroll. */
const walkingWeek = (minutes: number[], names: string[]): PlanDay[] => minutes.map((m, i) => walk(i as Day, names[i], m));

const WALK_NAMES = ['Easy walk', 'Brisk walk', 'Steady walk', 'Brisk walk', 'Easy walk', 'Long walk', 'Recovery stroll'];

/** What a plan is mostly about, for the filter chips. */
export type PlanFocus = 'walk' | 'run' | 'strength' | 'cycle' | 'mobility';

export const FOCUS_LABELS: Record<PlanFocus, string> = { walk: 'Walking', run: 'Running', strength: 'Strength', cycle: 'Cycling', mobility: 'Mobility' };

/** How many of a plan's first-week days are of one kind. */
const countOf = (p: Pick<WorkoutPlan, 'days'>, focus: PlanFocus): number =>
  p.days.filter((d) =>
    focus === 'strength' ? d.kind === 'strength' : focus === 'mobility' ? d.kind === 'mobility' : focus === 'walk' ? d.cardioType === 'Walking' && d.kind === 'cardio' : focus === 'cycle' ? d.cardioType === 'Cycling' : d.kind === 'cardio' && (d.cardioType === 'Running' || d.cardioType === 'HIIT')
  ).length;

/** Whether a plan belongs under a filter chip. A plan can fit several: daily walks plus two lifting days is both Walking and Strength. */
export const planHasFocus = (p: Pick<WorkoutPlan, 'days'>, focus: PlanFocus): boolean => countOf(p, focus) >= (focus === 'walk' ? 4 : 2);

// ---- Walk-to-run: the run/walk sessions of the first weeks, as a list of [title, minutes] for each of three runs a week ----
const WALK_TO_RUN: [string, number][][] = [
  [['Run 1 min, walk 1½ min × 8', 20], ['Run 1 min, walk 1½ min × 8', 20], ['Run 1 min, walk 1½ min × 8', 20]],
  [['Run 1½ min, walk 2 min × 6', 21], ['Run 1½ min, walk 2 min × 6', 21], ['Run 2 min, walk 2 min × 5', 20]],
  [['Run 2 min, walk 1½ min × 6', 21], ['Run 3 min, walk 1½ min × 5', 23], ['Run 3 min, walk 1 min × 5', 20]],
  [['Run 3 min, walk 1½ min × 5', 23], ['Run 5 min, walk 2 min × 3', 21], ['Run 5 min, walk 1 min × 4', 24]],
  [['Run 5 min, walk 2 min × 3', 21], ['Run 8 min, walk 2 min × 2', 20], ['Run 10 min, walk 2 min, run 10 min', 22]],
  [['Run 8 min, walk 1 min × 3', 27], ['Run 10 min, walk 1 min × 2', 22], ['Run 15 min, walk 1 min, run 5 min', 21]],
  [['Run 12 min, walk 1 min, run 12 min', 25], ['Run 15 min, walk 1 min, run 10 min', 26], ['Run 20 min steady', 20]],
  [['Run 20 min steady', 20], ['Run 22 min steady', 22], ['Run 25 min steady', 25]],
  [['Run 25 min steady', 25], ['Run 28 min steady', 28], ['Run 30 min steady: your 5K', 30]],
];

const walkToRunWeek = (w: number): PlanDay[] => {
  const [a, b, c] = WALK_TO_RUN[w];
  return [run(0, a[0], a[1]), rest(1), run(2, b[0], b[1]), rest(3), run(4, c[0], c[1]), walk(5, 'Easy walk', 30), rest(6)];
};

export const BUILT_IN_PLANS: WorkoutPlan[] = [
  {
    id: 'plan-walk-month',
    name: 'Month of Walks',
    description: 'A walk every day for four weeks (28 days). Each week is a little longer: easy and brisk days, a long walk at the weekend and a short stroll to finish the week.',
    weeks: 4,
    level: 'Beginner',
    days: walkingWeek([20, 20, 25, 20, 25, 35, 15], WALK_NAMES),
    weekly: [
      walkingWeek([20, 20, 25, 20, 25, 35, 15], WALK_NAMES),
      walkingWeek([25, 25, 30, 25, 30, 45, 20], WALK_NAMES),
      walkingWeek([30, 30, 35, 30, 35, 55, 25], WALK_NAMES),
      walkingWeek([35, 35, 40, 35, 40, 60, 30], ['Easy walk', 'Brisk walk', 'Steady walk', 'Brisk walk', 'Easy walk', 'Finale: long walk', 'Victory stroll']),
    ],
  },
  {
    id: 'plan-walk-strength',
    name: 'Daily Walks + 2 Strength Days',
    description: 'Walk every day and lift on Monday and Thursday with light weights or just your body. Four weeks to build a daily habit and a little strength.',
    weeks: 4,
    level: 'Beginner',
    days: [
      lift(0, 'Strength A', ['goblet-squat', 'push-up', 'db-row', 'glute-bridge', 'plank']),
      walk(1, 'Brisk walk', 25),
      walk(2, 'Easy walk', 25),
      lift(3, 'Strength B', ['reverse-lunge', 'db-shoulder-press', 'db-rdl', 'dead-bug', 'side-plank']),
      walk(4, 'Brisk walk', 25),
      walk(5, 'Long walk', 40),
      walk(6, 'Easy stroll', 20),
    ],
    weekly: [
      [lift(0, 'Strength A', ['goblet-squat', 'push-up', 'db-row', 'glute-bridge', 'plank']), walk(1, 'Brisk walk', 25), walk(2, 'Easy walk', 25), lift(3, 'Strength B', ['reverse-lunge', 'db-shoulder-press', 'db-rdl', 'dead-bug', 'side-plank']), walk(4, 'Brisk walk', 25), walk(5, 'Long walk', 40), walk(6, 'Easy stroll', 20)],
      [lift(0, 'Strength A', ['goblet-squat', 'push-up', 'db-row', 'glute-bridge', 'plank']), walk(1, 'Brisk walk', 30), walk(2, 'Easy walk', 30), lift(3, 'Strength B', ['reverse-lunge', 'db-shoulder-press', 'db-rdl', 'dead-bug', 'side-plank']), walk(4, 'Brisk walk', 30), walk(5, 'Long walk', 50), walk(6, 'Easy stroll', 20)],
      [lift(0, 'Strength A', ['goblet-squat', 'push-up', 'db-row', 'glute-bridge', 'plank']), walk(1, 'Brisk walk', 35), walk(2, 'Easy walk', 30), lift(3, 'Strength B', ['reverse-lunge', 'db-shoulder-press', 'db-rdl', 'dead-bug', 'side-plank']), walk(4, 'Brisk walk', 35), walk(5, 'Long walk', 60), walk(6, 'Easy stroll', 25)],
      [lift(0, 'Strength A', ['goblet-squat', 'push-up', 'db-row', 'glute-bridge', 'plank']), walk(1, 'Brisk walk', 40), walk(2, 'Easy walk', 30), lift(3, 'Strength B', ['reverse-lunge', 'db-shoulder-press', 'db-rdl', 'dead-bug', 'side-plank']), walk(4, 'Brisk walk', 40), walk(5, 'Long walk', 70), walk(6, 'Easy stroll', 25)],
    ],
  },
  {
    id: 'plan-walk-to-run',
    name: 'Walk-to-Run 5K',
    description: 'Never run before? Nine weeks of run and walk intervals, three runs a week, ending with 30 minutes of running.',
    weeks: 9,
    level: 'Beginner',
    days: walkToRunWeek(0),
    weekly: WALK_TO_RUN.map((_, w) => walkToRunWeek(w)),
  },
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
    id: 'plan-home-bodyweight',
    name: 'Bodyweight at Home',
    description: 'No equipment. Three bodyweight sessions a week with easy walks between, for 8 weeks. Add reps each week, then make the moves harder.',
    weeks: 8,
    level: 'Beginner',
    days: [
      lift(0, 'Push and legs', ['push-up', 'bodyweight-squat', 'incline-push-up', 'glute-bridge', 'plank']),
      walk(1, 'Easy walk', 25),
      lift(2, 'Pull and core', ['superman', 'inverted-row', 'reverse-lunge', 'dead-bug', 'bird-dog']),
      walk(3, 'Easy walk', 25),
      lift(4, 'Full body', ['split-squat', 'knee-push-up', 'single-leg-bridge', 'bicycle-crunch', 'side-plank']),
      walk(5, 'Long walk', 40),
      rest(6),
    ],
  },
  {
    id: 'plan-db-fullbody',
    name: 'Dumbbell Full Body',
    description: 'Three full-body days with one pair of dumbbells. Six weeks; add a rep or a little weight each session.',
    weeks: 6,
    level: 'Beginner',
    days: [
      lift(0, 'Full body A', ['db-goblet-squat', 'db-bench-press', 'db-row', 'db-rdl', 'plank']),
      rest(1),
      lift(2, 'Full body B', ['reverse-lunge', 'db-shoulder-press', 'db-bent-row', 'db-hip-thrust', 'dead-bug']),
      walk(3, 'Easy walk', 30),
      lift(4, 'Full body C', ['bulgarian-split-squat', 'incline-db-press', 'chest-supported-row', 'hammer-curl', 'overhead-tricep-ext']),
      walk(5, 'Long walk', 40),
      rest(6),
    ],
  },
  {
    id: 'plan-starter-barbell',
    name: 'Starter Barbell Strength',
    description: 'The classic three-day barbell start: squat, press and a pull every session, adding weight a little each time. Eight weeks.',
    weeks: 8,
    level: 'Beginner',
    days: [
      lift(0, 'Strength A', ['squat', 'bench-press', 'barbell-row']),
      rest(1),
      lift(2, 'Strength B', ['squat', 'ohp', 'deadlift']),
      rest(3),
      lift(4, 'Strength A', ['squat', 'bench-press', 'barbell-row']),
      walk(5, 'Easy walk', 30),
      rest(6),
    ],
  },
  {
    id: 'plan-upper-lower',
    name: 'Upper / Lower Split',
    description: 'Four days a week: two upper-body and two lower-body sessions. A good next step once full-body training gets easy. Ten weeks.',
    weeks: 10,
    level: 'Intermediate',
    days: [
      lift(0, 'Upper A', ['bench-press', 'barbell-row', 'ohp', 'lat-pulldown', 'barbell-curl', 'tricep-pushdown']),
      lift(1, 'Lower A', ['squat', 'rdl', 'leg-press', 'leg-curl', 'calf-raise']),
      rest(2),
      lift(3, 'Upper B', ['incline-db-press', 'seated-row', 'db-shoulder-press', 'pull-up', 'hammer-curl', 'skull-crusher']),
      lift(4, 'Lower B', ['front-squat', 'hip-thrust', 'lunge', 'leg-extension', 'seated-calf-raise']),
      walk(5, 'Easy walk', 40),
      rest(6),
    ],
  },
  {
    id: 'plan-glutes-legs',
    name: 'Glutes and Legs Focus',
    description: 'Four days a week with the emphasis on glutes, quads and hamstrings, plus one upper-body day. Eight weeks.',
    weeks: 8,
    level: 'Intermediate',
    days: [
      lift(0, 'Glutes and hamstrings', ['hip-thrust', 'rdl', 'bulgarian-split-squat', 'leg-curl', 'cable-kickback']),
      lift(1, 'Upper body', ['db-bench-press', 'lat-pulldown', 'db-shoulder-press', 'seated-row', 'lateral-raise']),
      rest(2),
      lift(3, 'Quads and glutes', ['squat', 'step-up', 'leg-press', 'glute-bridge', 'calf-raise']),
      lift(4, 'Glutes and core', ['sumo-deadlift', 'db-hip-thrust', 'reverse-lunge', 'hip-abduction-machine', 'plank']),
      walk(5, 'Easy walk', 40),
      rest(6),
    ],
  },
  {
    id: 'plan-calisthenics',
    name: 'Calisthenics Foundations',
    description: 'Pull-ups, dips, push-ups and leg work with your bodyweight. Three days a week for eight weeks, progressing from assisted to full moves.',
    weeks: 8,
    level: 'Intermediate',
    days: [
      lift(0, 'Pull and core', ['assisted-pull-up', 'inverted-row', 'chin-up', 'hanging-knee-raise', 'hollow-hold']),
      rest(1),
      lift(2, 'Push and legs', ['push-up', 'bench-dip', 'pike-push-up', 'bodyweight-squat', 'single-leg-bridge']),
      walk(3, 'Easy walk', 30),
      lift(4, 'Full body', ['pull-up', 'dip', 'split-squat', 'plank-shoulder-tap', 'lying-leg-raise']),
      walk(5, 'Long walk', 40),
      rest(6),
    ],
  },
  {
    id: 'plan-kettlebell',
    name: 'Kettlebell Conditioning',
    description: 'Swings, squats and presses with one kettlebell. Three short, hard sessions a week for six weeks.',
    weeks: 6,
    level: 'Intermediate',
    days: [
      lift(0, 'Swing and squat', ['kb-swing', 'goblet-squat', 'kb-press', 'suitcase-carry', 'plank']),
      rest(1),
      lift(2, 'Press and pull', ['kb-press', 'db-row', 'kb-swing', 'push-up', 'russian-twist']),
      walk(3, 'Easy walk', 30),
      lift(4, 'Full body', ['kb-snatch', 'goblet-squat', 'kb-swing', 'reverse-lunge', 'hollow-hold']),
      rest(5),
      rest(6),
    ],
  },
  {
    id: 'plan-hiit-core',
    name: 'Short HIIT and Core',
    description: 'Short, sweaty sessions that fit a busy week: two intervals days, a core day and walks. Four weeks.',
    weeks: 4,
    level: 'Beginner',
    days: [
      hiit(0, 'Intervals', 20),
      walk(1, 'Easy walk', 25),
      lift(2, 'Core and legs', ['plank', 'mountain-climber', 'bodyweight-squat', 'bicycle-crunch', 'glute-bridge']),
      rest(3),
      hiit(4, 'Intervals', 20),
      walk(5, 'Long walk', 35),
      rest(6),
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
    id: 'plan-cycle-base',
    name: 'Cycling Base',
    description: 'Three rides a week that grow gently, with a longer ride at the weekend and a short mobility session. Six weeks, indoors or out.',
    weeks: 6,
    level: 'Beginner',
    days: [rest(0), ride(1, 'Easy ride', 40), rest(2), ride(3, 'Steady ride', 40), mobility(4, 'Mobility', 15), ride(5, 'Long ride', 60), rest(6)],
    weekly: [
      [rest(0), ride(1, 'Easy ride', 40), rest(2), ride(3, 'Steady ride', 40), mobility(4, 'Mobility', 15), ride(5, 'Long ride', 60), rest(6)],
      [rest(0), ride(1, 'Easy ride', 45), rest(2), ride(3, 'Steady ride', 45), mobility(4, 'Mobility', 15), ride(5, 'Long ride', 70), rest(6)],
      [rest(0), ride(1, 'Easy ride', 45), rest(2), ride(3, 'Steady ride', 50), mobility(4, 'Mobility', 15), ride(5, 'Long ride', 80), rest(6)],
      [rest(0), ride(1, 'Easy ride', 40), rest(2), ride(3, 'Easy ride', 40), mobility(4, 'Mobility', 15), ride(5, 'Recovery ride', 50), rest(6)],
      [rest(0), ride(1, 'Easy ride', 50), rest(2), ride(3, 'Steady ride', 50), mobility(4, 'Mobility', 15), ride(5, 'Long ride', 90), rest(6)],
      [rest(0), ride(1, 'Easy ride', 50), rest(2), ride(3, 'Steady ride', 55), mobility(4, 'Mobility', 15), ride(5, 'Long ride', 100), rest(6)],
    ],
  },
  {
    id: 'plan-mobility-14',
    name: 'Two Weeks of Mobility',
    description: 'A short stretching and mobility session every day for two weeks. Good for stiff hips and backs, or between hard training blocks.',
    weeks: 2,
    level: 'Beginner',
    days: [10, 10, 15, 10, 15, 20, 10].map((m, i) => mobility(i as Day, ['Hips and back', 'Shoulders and neck', 'Full body flow', 'Legs and calves', 'Full body flow', 'Long stretch', 'Easy reset'][i], m)),
    weekly: [
      [10, 10, 15, 10, 15, 20, 10].map((m, i) => mobility(i as Day, ['Hips and back', 'Shoulders and neck', 'Full body flow', 'Legs and calves', 'Full body flow', 'Long stretch', 'Easy reset'][i], m)),
      [15, 15, 15, 15, 20, 25, 10].map((m, i) => mobility(i as Day, ['Hips and back', 'Shoulders and neck', 'Full body flow', 'Legs and calves', 'Full body flow', 'Long stretch', 'Easy reset'][i], m)),
    ],
  },
];

export const getPlan = (id: string, custom: WorkoutPlan[] = []) =>
  [...BUILT_IN_PLANS, ...custom].find((p) => p.id === id);
