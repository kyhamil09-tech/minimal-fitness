import { Exercise, MuscleGroup } from '../types/tracking';

/**
 * The exercise library: about 870 exercises with the muscles they work and written steps, from free-exercise-db (public domain).
 * It lives in its own file that is only read when someone opens the library or an exercise's guide, so it costs nothing at start-up.
 */

export interface LibEntry {
  /** Name. */
  n: string;
  /** Level: beginner, intermediate or expert. */
  l: string;
  /** Equipment as the source calls it ("barbell", "body only", "e-z curl bar"...). */
  e: string;
  /** Category: strength, stretching, plyometrics, cardio... */
  c: string;
  /** Main muscles and helping muscles, by the source's names. */
  p: string[];
  s: string[];
  /** The steps. */
  i: string[];
}

let cache: LibEntry[] | null = null;

export const libraryLoaded = (): LibEntry[] | null => cache;

/** Reads the library (once). */
export const loadLibrary = async (): Promise<LibEntry[]> => {
  if (!cache) {
    const mod = await import('../data/exercisedb/library.json');
    cache = (mod.default ?? mod) as unknown as LibEntry[];
  }
  return cache;
};

const MUSCLE_TO_GROUP: Record<string, MuscleGroup> = {
  chest: 'Chest',
  lats: 'Back',
  'middle back': 'Back',
  'lower back': 'Back',
  traps: 'Back',
  shoulders: 'Shoulders',
  neck: 'Shoulders',
  biceps: 'Arms',
  triceps: 'Arms',
  forearms: 'Arms',
  quadriceps: 'Legs',
  hamstrings: 'Legs',
  calves: 'Legs',
  abductors: 'Legs',
  adductors: 'Legs',
  glutes: 'Glutes',
  abdominals: 'Core',
};

export const entryGroup = (e: LibEntry): MuscleGroup => {
  if (e.c === 'stretching') return 'Stretch';
  if (e.c === 'cardio') return 'Cardio';
  return MUSCLE_TO_GROUP[e.p[0] ?? ''] ?? 'Full Body';
};

const EQUIPMENT: Record<string, Exercise['equipment']> = {
  barbell: 'Barbell',
  dumbbell: 'Dumbbell',
  machine: 'Machine',
  cable: 'Cable',
  'body only': 'Bodyweight',
  kettlebells: 'Kettlebell',
  'e-z curl bar': 'EZ Bar',
  bands: 'Band',
  'medicine ball': 'Medicine Ball',
};

export const entryEquipment = (e: LibEntry): Exercise['equipment'] => EQUIPMENT[e.e] ?? 'Other';

export const norm = (s: string): string =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Words that do not tell two exercises apart. */
const FILLER = new Set(['barbell', 'dumbbell', 'dumbbells', 'machine', 'cable', 'smith', 'ez', 'bar', 'kettlebell', 'band', 'back', 'the', 'with', 'a', 'and', 'on', 'of', 'standing', 'seated', 'medium', 'grip']);

/** Words that make it a different exercise when only one of the two names has them. */
const MODIFIERS = ['plyo', 'kneeling', 'incline', 'decline', 'reverse', 'wide', 'close', 'narrow', 'single', 'one', 'alternating', 'assisted', 'weighted', 'jump', 'stability', 'sumo', 'romanian', 'front', 'overhead', 'hammer', 'pause', 'band', 'banded', 'lying'];

const tokens = (name: string): Set<string> => new Set(norm(name).split(' ').filter((w) => w && !FILLER.has(w)));

const similarity = (a: Set<string>, b: Set<string>): number => {
  if (a.size === 0 || b.size === 0) return 0;
  let both = 0;
  for (const w of a) if (b.has(w)) both++;
  return both / (a.size + b.size - both);
};

/** The app's names for common lifts that the library calls something else. */
const ALIASES: Record<string, string> = {
  'overhead press': 'Standing Military Press',
  'barbell row': 'Bent Over Barbell Row',
  'chest dip': 'Dips - Chest Version',
  'dumbbell fly': 'Dumbbell Flyes',
  'incline dumbbell fly': 'Incline Dumbbell Flyes',
  'decline dumbbell fly': 'Decline Dumbbell Flyes',
  'lat pulldown': 'Wide-Grip Lat Pulldown',
  'hip thrust': 'Barbell Hip Thrust',
  't bar row': 'T-Bar Row with Handle',
  'machine shoulder press': 'Machine Shoulder (Military) Press',
  'leg extension': 'Leg Extensions',
};

/** The library entry that describes an exercise of the app's own, by name and muscle, or undefined when none is close enough. */
export const findEntry = (lib: LibEntry[], ex: Pick<Exercise, 'name' | 'muscle'> & Partial<Pick<Exercise, 'equipment'>>): LibEntry | undefined => {
  const alias = ALIASES[norm(ex.name)];
  if (alias) {
    const hit = lib.find((e) => e.n === alias);
    if (hit) return hit;
  }
  const squash = (s: string) => norm(s).replace(/ /g, '');
  const exact = lib.find((e) => squash(e.n) === squash(ex.name) || squash(e.n) === squash(ex.name) + 's');
  if (exact) return exact;
  const want = tokens(ex.name);
  let best: LibEntry | undefined;
  let bestScore = 0;
  for (const e of lib) {
    const theirs = tokens(e.n);
    const score = similarity(want, theirs);
    // Nearly the same words, and one name holds all of the other's: anything looser would describe a different lift.
    if (score < 0.8) continue;
    if (MODIFIERS.some((m) => want.has(m) !== theirs.has(m))) continue;
    // The same kind of equipment, or the steps would describe a different lift (a barbell press is not a machine press).
    if (ex.equipment && entryEquipment(e) !== ex.equipment && !(ex.equipment === 'Smith Machine' && e.e === 'machine')) continue;
    const g = entryGroup(e);
    if (g !== ex.muscle && !(ex.muscle === 'Full Body')) continue;
    if (score > bestScore || (score === bestScore && best && e.n.length < best.n.length)) {
      best = e;
      bestScore = score;
    }
  }
  return best;
};

/** Library exercises that match a search and are not already in the app's own list (by name). */
export const searchLibrary = (lib: LibEntry[], query: string, have: Set<string>, limit = 80): LibEntry[] => {
  const q = norm(query);
  const out: LibEntry[] = [];
  for (const e of lib) {
    if (have.has(norm(e.n))) continue;
    if (q && !norm(e.n).includes(q) && !entryGroup(e).toLowerCase().includes(q) && !e.e.includes(q) && !e.p.some((m) => m.includes(q))) continue;
    out.push(e);
    if (out.length >= limit) break;
  }
  return out;
};

export const levelLabel = (l: string): string => (l === 'expert' ? 'Advanced' : l === 'intermediate' ? 'Intermediate' : 'Beginner');
