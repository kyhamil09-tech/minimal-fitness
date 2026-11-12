import { BreathSession } from '../lib/breathing';

/**
 * What the Breathe side says about each technique and each guided journey: the categories, how to do it, who it is for, the notes of
 * care, and the multi-day programs. The timing of each breath lives in lib/breathing.ts; this is the words and the grouping.
 */

export type Category = 'calm' | 'sleep' | 'focus' | 'energy' | 'recovery';

export const CATEGORIES: { id: Category; label: string; hue: string; line: string }[] = [
  { id: 'calm', label: 'Calm', hue: '#5EEAD4', line: 'Settle down and let tension go' },
  { id: 'sleep', label: 'Sleep', hue: '#A78BFA', line: 'Slow down for the night' },
  { id: 'focus', label: 'Focus', hue: '#7DD3FC', line: 'A steady, clear head' },
  { id: 'energy', label: 'Energy', hue: '#FBBF24', line: 'Wake up gently' },
  { id: 'recovery', label: 'Recovery', hue: '#86EFAC', line: 'Come down after effort' },
];

export const categoryHue = (c: Category): string => CATEGORIES.find((x) => x.id === c)?.hue ?? '#5EEAD4';

export interface TechniqueInfo {
  id: string;
  categories: Category[];
  /** Easy, or a little practice needed (holds and long exhales). */
  level: 'Easy' | 'Some practice';
  /** The minutes it opens on. */
  minutes: number;
  /** What it is, in a short paragraph. */
  about: string;
  /** How to do it, step by step. */
  how: string[];
  bestFor: string[];
  /** A note of care, when the technique has a hold or a fast rhythm. */
  caution?: string;
}

const HOLD_NOTE = 'Skip the holds, or keep them short, if you are pregnant, have a heart or lung condition, or feel dizzy. Just breathe in and out.';
const FAST_NOTE = 'A quicker rhythm. Stop and breathe normally if you feel light-headed, tingly or short of breath. Not for use while driving, in water or before bed.';

export const TECHNIQUE_INFO: TechniqueInfo[] = [
  {
    id: 'calm',
    categories: ['calm'],
    level: 'Easy',
    minutes: 3,
    about: 'Equal, unhurried breaths in and out, about six a minute. The simplest way to slow down, with nothing to hold or count beyond five.',
    how: ['Sit or lie down and let your shoulders drop.', 'Breathe in through your nose as the circle grows.', 'Breathe out, just as slowly, as it shrinks.', 'Let your belly rise and fall rather than your chest.'],
    bestFor: ['A busy mind', 'Everyday tension', 'Your first session'],
  },
  {
    id: 'resonance',
    categories: ['calm', 'focus', 'recovery'],
    level: 'Easy',
    minutes: 5,
    about: 'Breathing at about five and a half breaths a minute is the pace most studied for steadying heart rhythm. Smooth and even, with no pause between breaths.',
    how: ['Sit comfortably with your back supported.', 'Breathe in through the nose for the whole of the growing circle.', 'Breathe out gently through the nose or lips for the whole of the shrinking circle.', 'Keep it smooth: no gasping at the top or the bottom.'],
    bestFor: ['Settling heart rate', 'A longer calm session', 'After a hard day'],
  },
  {
    id: 'sigh',
    categories: ['calm'],
    level: 'Easy',
    minutes: 2,
    about: 'Two quick breaths in through the nose, the second a short top-up, then one long sigh out. Often called the physiological sigh: a fast way to release tension.',
    how: ['Breathe in through your nose.', 'When the circle is nearly full, sip in a little more.', 'Let it all out in a long, slow sigh through your mouth.', 'Repeat and let your shoulders fall each time.'],
    bestFor: ['A sudden wave of stress', 'Before a difficult conversation', 'When you need to calm down quickly'],
  },
  {
    id: 'longout',
    categories: ['calm', 'sleep', 'recovery'],
    level: 'Easy',
    minutes: 3,
    about: 'Breathing out for longer than you breathe in. The slow exhale is the part that tells your body it can relax.',
    how: ['Breathe in through your nose for four.', 'Breathe out slowly for six, through your nose or softly through your lips.', 'Do not push the air out: let it go.', 'If six feels long, shorten it and keep the out longer than the in.'],
    bestFor: ['Anywhere, any time', 'Winding down', 'Cooling off after exercise'],
  },
  {
    id: 'reset',
    categories: ['calm'],
    level: 'Easy',
    minutes: 2,
    about: 'A short pause at the top of the breath and a long, slow breath out. A quick way to come back to yourself when things get tense.',
    how: ['Breathe in through your nose.', 'Pause for a moment at the top.', 'Breathe out slowly, longer than the in.', 'Feel your jaw and shoulders soften on each out-breath.'],
    bestFor: ['Tense moments', 'Between tasks', 'Before a meeting'],
    caution: HOLD_NOTE,
  },
  {
    id: 'hum',
    categories: ['calm', 'sleep'],
    level: 'Easy',
    minutes: 4,
    about: 'Breathe in through the nose, then hum softly on the way out. The vibration and the sound give the breath something to follow, which helps a busy mind settle.',
    how: ['Close your lips gently and breathe in through your nose.', 'On the out-breath, hum at a comfortable pitch, like a low "mmm".', 'Feel the buzz in your lips, face and chest.', 'Keep the hum quiet: the point is the slow, steady out-breath.'],
    bestFor: ['A racing mind', 'Evenings', 'When silence feels hard'],
  },
  {
    id: 'relax',
    categories: ['sleep'],
    level: 'Some practice',
    minutes: 4,
    about: 'A long breath out with a pause in the middle. Best in the evening, when you want to slow down for sleep. It is stronger than it looks, so start with a few rounds.',
    how: ['Rest the tip of your tongue behind your upper front teeth.', 'Breathe in quietly through your nose for four.', 'Hold for seven.', 'Breathe out through your mouth, with a soft whoosh, for eight.'],
    bestFor: ['Falling asleep', 'Waking in the night', 'Evening wind-down'],
    caution: HOLD_NOTE,
  },
  {
    id: 'drift',
    categories: ['sleep'],
    level: 'Easy',
    minutes: 5,
    about: 'A gentle version for bed: a short pause and a slow, long breath out. Lie down, close your eyes and let the screen be the last thing you look at.',
    how: ['Lie on your back or side, hands resting.', 'Breathe in through your nose for four.', 'Pause briefly, then let the breath out slowly for eight.', 'Let your body feel heavier on each out-breath.'],
    bestFor: ['In bed', 'Night wakings', 'A restless evening'],
    caution: HOLD_NOTE,
  },
  {
    id: 'box',
    categories: ['focus', 'calm'],
    level: 'Some practice',
    minutes: 4,
    about: 'Four equal sides: in, hold, out, hold. A steadying rhythm used before something stressful, or to sharpen focus.',
    how: ['Sit tall with your feet on the floor.', 'Breathe in for four.', 'Hold for four.', 'Breathe out for four, then hold empty for four.'],
    bestFor: ['Before a big moment', 'Focus', 'Steadying nerves'],
    caution: HOLD_NOTE,
  },
  {
    id: 'triangle',
    categories: ['focus'],
    level: 'Easy',
    minutes: 3,
    about: 'Three equal sides: in, hold, out. Simpler than box breathing, with no empty pause at the bottom, so it feels more natural.',
    how: ['Sit comfortably.', 'Breathe in for four.', 'Hold gently for four.', 'Breathe out for four, then go straight into the next breath.'],
    bestFor: ['Starting work', 'A scattered mind', 'A first step into holds'],
    caution: HOLD_NOTE,
  },
  {
    id: 'focus',
    categories: ['focus'],
    level: 'Easy',
    minutes: 4,
    about: 'A steady in, a brief hold and a longer out. Calm but alert, so you stay sharp rather than sleepy.',
    how: ['Sit upright and relax your face.', 'Breathe in for four.', 'Hold for two.', 'Breathe out for six and let your eyes soften.'],
    bestFor: ['Work and study', 'Reading', 'The first minutes of the day'],
    caution: HOLD_NOTE,
  },
  {
    id: 'lift',
    categories: ['energy'],
    level: 'Easy',
    minutes: 2,
    about: 'A lively, even rhythm, a little quicker than the calming techniques. A gentle alternative to a second coffee.',
    how: ['Sit or stand tall.', 'Breathe in through your nose for three, filling your chest.', 'Breathe out through your nose for three.', 'Keep it light and stop if you feel dizzy.'],
    bestFor: ['Waking up', 'The afternoon slump', 'Before a workout'],
    caution: FAST_NOTE,
  },
  {
    id: 'pursed',
    categories: ['recovery'],
    level: 'Easy',
    minutes: 3,
    about: 'In through the nose, out slowly through pursed lips, as if cooling a hot drink. A good way to bring your breathing down after a hard effort.',
    how: ['Stand with your hands on your hips or sit with your hands on your knees.', 'Breathe in through your nose for two.', 'Purse your lips and breathe out slowly for four.', 'Do not force it: let the air leave on its own.'],
    bestFor: ['After a run or ride', 'Climbing stairs', 'Catching your breath'],
  },
];

export const infoFor = (id: string): TechniqueInfo | undefined => TECHNIQUE_INFO.find((t) => t.id === id);

export const inCategory = (c: Category): TechniqueInfo[] => TECHNIQUE_INFO.filter((t) => t.categories.includes(c));

/** The color for a technique: its first category's. */
export const hueFor = (id: string): string => categoryHue(infoFor(id)?.categories[0] ?? 'calm');

// ---------------------------------------------------------------------------------------------
// How do you feel? A tap on Today picks a few techniques that suit it.
// ---------------------------------------------------------------------------------------------

export interface Mood {
  id: string;
  label: string;
  line: string;
  /** The techniques that suit it, best first. */
  techniques: string[];
  minutes: number;
}

export const MOODS: Mood[] = [
  { id: 'stressed', label: 'Stressed', line: 'Come down with a long breath out.', techniques: ['sigh', 'reset', 'longout'], minutes: 3 },
  { id: 'anxious', label: 'Anxious', line: 'Slow and steady, nothing to hold.', techniques: ['longout', 'resonance', 'hum'], minutes: 5 },
  { id: 'sleep', label: "Can't sleep", line: 'Slow right down for bed.', techniques: ['drift', 'relax', 'hum'], minutes: 5 },
  { id: 'focus', label: 'Need focus', line: 'Calm but alert.', techniques: ['focus', 'box', 'triangle'], minutes: 4 },
  { id: 'tired', label: 'Low energy', line: 'A gentle lift.', techniques: ['lift', 'triangle', 'focus'], minutes: 2 },
  { id: 'workout', label: 'After exercise', line: 'Bring your breathing back down.', techniques: ['pursed', 'longout', 'resonance'], minutes: 3 },
];

// ---------------------------------------------------------------------------------------------
// Journeys: a few days, one short session each, with a line to read first.
// ---------------------------------------------------------------------------------------------

export interface JourneyDay {
  technique: string;
  minutes: number;
  /** A short thing to read before the session. */
  lesson: string;
}

export interface Journey {
  id: string;
  title: string;
  line: string;
  hue: string;
  days: JourneyDay[];
}

export const JOURNEYS: Journey[] = [
  {
    id: 'calm7',
    title: '7 days to feel calmer',
    line: 'One short session a day, from the easiest to a longer, deeper rhythm.',
    hue: '#5EEAD4',
    days: [
      { technique: 'calm', minutes: 3, lesson: 'Start simple. Slow, even breaths tell your body it is safe to relax. Just notice how the breath feels.' },
      { technique: 'longout', minutes: 3, lesson: 'The out-breath is the calming part. Making it longer than the in-breath is the easiest way to slow down.' },
      { technique: 'sigh', minutes: 2, lesson: 'Today is the quick release: two breaths in and one long sigh. Keep it in your pocket for tense moments.' },
      { technique: 'resonance', minutes: 5, lesson: 'About five and a half breaths a minute. Smooth, with no pause. Let it feel like rocking.' },
      { technique: 'box', minutes: 4, lesson: 'Four equal sides. A bit of structure for a busy head. Hold gently, never strain.' },
      { technique: 'calm', minutes: 5, lesson: 'Back to the easy rhythm, but longer. Notice how much easier it feels than on day one.' },
      { technique: 'resonance', minutes: 6, lesson: 'Your longest session. Settle in and let the breath do the work. Well done for coming back every day.' },
    ],
  },
  {
    id: 'sleep7',
    title: 'Sleep wind-down, 7 nights',
    line: 'Evening sessions that slow you down for bed, building to a longer one.',
    hue: '#A78BFA',
    days: [
      { technique: 'relax', minutes: 4, lesson: 'Do this in bed or just before. A long breath out, with a pause, helps the body let go of the day.' },
      { technique: 'drift', minutes: 5, lesson: 'A gentler version made for lying down. Let each out-breath make you feel heavier.' },
      { technique: 'longout', minutes: 5, lesson: 'No holds tonight, just a long, easy exhale. If you wake in the night, this is the one to use.' },
      { technique: 'hum', minutes: 5, lesson: 'Hum softly on the way out. The sound gives a busy mind something to follow.' },
      { technique: 'relax', minutes: 5, lesson: 'Back to the 4-7-8 rhythm. It should feel easier than on night one.' },
      { technique: 'drift', minutes: 7, lesson: 'A longer one tonight. If you fall asleep before it ends, that is the whole point.' },
      { technique: 'hum', minutes: 7, lesson: 'Last night. Pick the one that felt best and keep it for good.' },
    ],
  },
  {
    id: 'focus5',
    title: 'Focus week, 5 days',
    line: 'Short, steady rhythms to start the day alert and clear.',
    hue: '#7DD3FC',
    days: [
      { technique: 'box', minutes: 3, lesson: 'Four sides of four. Try it before you open your first email.' },
      { technique: 'triangle', minutes: 3, lesson: 'Three sides, no empty pause. Notice how your attention settles on the counting.' },
      { technique: 'focus', minutes: 4, lesson: 'In four, hold two, out six. Calm but awake. Good before something that needs thinking.' },
      { technique: 'box', minutes: 5, lesson: 'Back to the box, a little longer. When your mind drifts, just rejoin the count.' },
      { technique: 'focus', minutes: 5, lesson: 'Pick your favorite and make it part of the morning.' },
    ],
  },
  {
    id: 'recover3',
    title: 'Post-run recovery, 3 days',
    line: 'Bring your breathing and heart rate down after hard efforts.',
    hue: '#86EFAC',
    days: [
      { technique: 'pursed', minutes: 3, lesson: 'Do this straight after you stop moving. Out through pursed lips, as if cooling a hot drink.' },
      { technique: 'longout', minutes: 4, lesson: 'Once your breathing has eased, lengthen the out-breath and let your heart rate settle.' },
      { technique: 'resonance', minutes: 5, lesson: 'A smooth, steady pace to finish. Good on the evening of a hard session.' },
    ],
  },
];

export const journeyById = (id: string): Journey | undefined => JOURNEYS.find((j) => j.id === id);

/** A journey's progress, kept on the phone: the day numbers (from 1) that are done. */
export type JourneyProgress = Record<string, { startedAt: number; done: number[] }>;

/** The next day to do (first one not done), or null when all are done. */
export const nextJourneyDay = (j: Journey, p: JourneyProgress[string] | undefined): number | null => {
  const done = new Set(p?.done ?? []);
  for (let d = 1; d <= j.days.length; d++) if (!done.has(d)) return d;
  return null;
};

/** Marks a day done; days can be done in order only, so a later day cannot be ticked early. */
export const completeJourneyDay = (all: JourneyProgress, j: Journey, day: number, now: number): JourneyProgress => {
  const cur = all[j.id];
  const next = nextJourneyDay(j, cur);
  if (next !== day) return all;
  return { ...all, [j.id]: { startedAt: cur?.startedAt ?? now, done: [...(cur?.done ?? []), day] } };
};

/** The session in the log (if any) that counted for a journey day, so history can say "Day 3 of 7". */
export const journeyLabel = (s: BreathSession): string | null => {
  if (!s.journey) return null;
  const j = journeyById(s.journey.id);
  return j ? `${j.title} · day ${s.journey.day}` : null;
};

/** A time-of-day greeting for the top of Today. */
export const greeting = (hour: number): string => (hour < 5 ? 'Still up?' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening');

/** The suggestion for the moment: sleep techniques late at night, energy in the morning, a calm one otherwise. */
export const suggestedNow = (hour: number): { technique: string; minutes: number; why: string } => {
  if (hour >= 21 || hour < 5) return { technique: 'drift', minutes: 5, why: 'Late in the day: slow down for sleep.' };
  if (hour < 10) return { technique: 'focus', minutes: 3, why: 'A calm, alert start to the day.' };
  if (hour < 17) return { technique: 'resonance', minutes: 3, why: 'A reset for the middle of the day.' };
  return { technique: 'longout', minutes: 4, why: 'Let the day go with a long exhale.' };
};
