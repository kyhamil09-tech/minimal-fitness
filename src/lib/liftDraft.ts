/**
 * The workout in progress, written to storage after every change so that a crash, a killed app or a dead battery loses nothing:
 * reopening the app puts the same exercises, sets, ticks, timer and rest countdown back on screen.
 */

export const DRAFT_KEY = 'kyfit_lift_draft';

/** A draft older than this is treated as abandoned. */
export const DRAFT_MAX_AGE_MS = 18 * 3600_000;

export interface DraftRow {
  reps: string;
  weight: string;
  done: boolean;
  kind?: string;
  rpe?: string;
  sec?: string;
}

export interface DraftExercise {
  exerciseId: string;
  name: string;
  rows: DraftRow[];
  group?: string;
  note?: string;
}

export interface LiftDraft {
  v: 1;
  savedAt: number;
  startedAt: number;
  items: DraftExercise[];
  cursor: number;
  title: string;
  notes: string;
  /** When the rest countdown ends (0 when none). */
  restEnds: number;
  restTotal: number;
  /** When the workout was paused (0 when it is running), and how much of the rest was left at that moment. */
  pausedAt?: number;
  restRemainMs?: number;
}

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const isRow = (r: unknown): r is DraftRow => !!r && typeof r === 'object' && typeof (r as DraftRow).reps === 'string' && typeof (r as DraftRow).weight === 'string' && typeof (r as DraftRow).done === 'boolean';

const isExercise = (e: unknown): e is DraftExercise =>
  !!e && typeof e === 'object' && typeof (e as DraftExercise).exerciseId === 'string' && typeof (e as DraftExercise).name === 'string' && Array.isArray((e as DraftExercise).rows) && (e as DraftExercise).rows.every(isRow);

/** Whether a draft is worth keeping: something was entered or ticked. */
export const draftHasContent = (d: Pick<LiftDraft, 'items' | 'notes'>): boolean =>
  d.items.length > 0 || d.notes.trim().length > 0;

export const saveDraft = (store: Store, d: Omit<LiftDraft, 'v' | 'savedAt'>, now: number = Date.now()): void => {
  try {
    if (!draftHasContent(d)) {
      store.removeItem(DRAFT_KEY);
      return;
    }
    store.setItem(DRAFT_KEY, JSON.stringify({ v: 1, savedAt: now, ...d }));
  } catch {
    // storage full or blocked: the workout carries on, it just cannot be restored
  }
};

export const loadDraft = (store: Store, now: number = Date.now()): LiftDraft | null => {
  try {
    const raw = store.getItem(DRAFT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (!d || d.v !== 1 || !Array.isArray(d.items) || !d.items.every(isExercise)) return null;
    if (typeof d.startedAt !== 'number' || typeof d.savedAt !== 'number') return null;
    if (now - d.savedAt > DRAFT_MAX_AGE_MS || d.startedAt > now + 60_000) return null;
    const draft: LiftDraft = {
      v: 1,
      savedAt: d.savedAt,
      startedAt: d.startedAt,
      items: d.items,
      cursor: Math.max(0, Math.min(d.items.length - 1, Math.round(Number(d.cursor) || 0))),
      title: typeof d.title === 'string' ? d.title : '',
      notes: typeof d.notes === 'string' ? d.notes : '',
      restEnds: Number(d.restEnds) > now ? Number(d.restEnds) : 0,
      restTotal: Math.max(0, Number(d.restTotal) || 0),
      pausedAt: Number(d.pausedAt) > 0 && Number(d.pausedAt) <= now ? Number(d.pausedAt) : 0,
      restRemainMs: Math.max(0, Number(d.restRemainMs) || 0),
    };
    return draftHasContent(draft) ? draft : null;
  } catch {
    return null;
  }
};

export const clearDraft = (store: Store): void => {
  try {
    store.removeItem(DRAFT_KEY);
  } catch {
    // nothing to do
  }
};
