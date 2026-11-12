import { WorkoutSession } from '../types/health';
import { UnitSystem } from '../types/tracking';
import { estimateOneRepMax, personalRecords } from '../lib/calc';
import { formatWeight } from '../lib/units';
import { hasWork, isTimedSet, isWorkingSet } from '../lib/sets';
import { workoutTotals } from '../lib/lifting';

/**
 * The picture of a finished lifting workout that you can send to a friend: the name, the day, time, volume and sets, then each exercise
 * with its best set, and a trophy on any that were records. Black and white with one blue accent, like the Lift side itself.
 */

export interface LiftCardLine {
  name: string;
  /** Finished sets in this exercise. */
  sets: number;
  /** The best set, ready to show ("80 kg × 8" or "1:00"). */
  best: string;
  pr: boolean;
}

export interface LiftCardData {
  title: string;
  /** "Monday 12 October 2026". */
  date: string;
  stats: { label: string; value: string }[];
  lines: LiftCardLine[];
  /** Exercises that did not fit on the card. */
  more: number;
}

export const MAX_LINES = 7;

const clock = (s: number): string => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h} h ${m} min` : `${Math.max(1, m)} min`;
};

/** The numbers for a workout's card. `others` are your other workouts, to tell which sets were records. */
export const buildLiftCard = (w: WorkoutSession, others: WorkoutSession[], units: UnitSystem): LiftCardData => {
  const t = workoutTotals(w);
  const before = personalRecords(others);
  const lines: LiftCardLine[] = [];
  for (const ex of w.exercises ?? []) {
    const done = ex.sets.filter(hasWork);
    if (!done.length) continue;
    let best = '';
    let bestE = -1;
    for (const s of done) {
      if (isTimedSet(s)) {
        const sec = s.seconds ?? 0;
        if (sec > bestE) {
          bestE = sec;
          best = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
        }
        continue;
      }
      if (!isWorkingSet(s) || s.reps <= 0) continue;
      const e = s.weightKg > 0 ? estimateOneRepMax(s.weightKg, s.reps, s.rpe) : s.reps;
      if (e > bestE) {
        bestE = e;
        best = s.weightKg > 0 ? `${formatWeight(s.weightKg, units)} × ${s.reps}` : `${s.reps} reps`;
      }
    }
    const old = before[ex.exerciseId];
    const topE = done.filter((s) => isWorkingSet(s) && s.weightKg > 0 && s.reps > 0).reduce((m, s) => Math.max(m, estimateOneRepMax(s.weightKg, s.reps, s.rpe)), 0);
    lines.push({ name: ex.name, sets: done.length, best: best || '–', pr: !!old && topE > old.oneRepMax + 0.01 });
  }
  const when = w.startedAt ?? Date.parse(w.timestamp);
  return {
    title: w.title || w.planDayTitle || 'Workout',
    date: Number.isFinite(when) ? new Date(when).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '',
    stats: [
      { label: 'Time', value: clock(w.durationSec ?? w.durationMinutes * 60) },
      { label: 'Volume', value: formatWeight(t.volumeKg, units, 0) },
      { label: 'Sets', value: String(t.sets) },
    ],
    lines: lines.slice(0, MAX_LINES),
    more: Math.max(0, lines.length - MAX_LINES),
  };
};

const W = 1080;
const H = 1350;
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

/** Cuts text with an ellipsis so it fits the width. */
const fit = (ctx: CanvasRenderingContext2D, text: string, max: number): string => {
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1);
  return `${t}…`;
};

/** Draws the card onto a canvas (1080 by 1350). */
export const drawLiftCard = (canvas: HTMLCanvasElement, d: LiftCardData) => {
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const PAD = 84;
  ctx.fillStyle = '#121214';
  ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = 'alphabetic';

  ctx.fillStyle = '#8e8e93';
  ctx.font = `600 34px ${FONT}`;
  ctx.fillText('MINIMAL FITNESS', PAD, 118);

  ctx.fillStyle = '#ffffff';
  ctx.font = `800 88px ${FONT}`;
  ctx.fillText(fit(ctx, d.title, W - PAD * 2), PAD, 232);
  ctx.fillStyle = '#8e8e93';
  ctx.font = `500 38px ${FONT}`;
  ctx.fillText(d.date, PAD, 292);

  // Three big numbers, each shrunk until it fits its own column.
  const cols = [0, 0.34, 0.7];
  const inner = W - PAD * 2;
  d.stats.forEach((st, i) => {
    const x = PAD + inner * (cols[i] ?? i / d.stats.length);
    const next = i + 1 < d.stats.length ? PAD + inner * (cols[i + 1] ?? (i + 1) / d.stats.length) : W - PAD;
    const room = next - x - 70;
    let px = 78;
    ctx.font = `800 ${px}px ${FONT}`;
    while (px > 40 && ctx.measureText(st.value).width > room) {
      px -= 4;
      ctx.font = `800 ${px}px ${FONT}`;
    }
    if (i > 0) {
      ctx.fillStyle = '#3a3a41';
      ctx.fillRect(x - 36, 372, 3, 130);
    }
    ctx.fillStyle = '#ffffff';
    ctx.fillText(st.value, x, 438);
    ctx.fillStyle = '#8e8e93';
    ctx.font = `500 34px ${FONT}`;
    ctx.fillText(st.label, x, 488);
  });

  ctx.fillStyle = '#3a3a41';
  ctx.fillRect(PAD, 548, W - PAD * 2, 3);

  // The exercises.
  const top = 640;
  const step = 86;
  d.lines.forEach((l, i) => {
    const y = top + i * step;
    ctx.fillStyle = '#ffb300';
    ctx.font = `700 40px ${FONT}`;
    ctx.fillText(`${l.sets} ×`, PAD, y);
    ctx.fillStyle = '#ffffff';
    ctx.font = `600 40px ${FONT}`;
    const right = W - PAD;
    ctx.textAlign = 'right';
    ctx.fillStyle = l.pr ? '#ffb300' : '#d1d1d6';
    ctx.font = `600 38px ${FONT}`;
    const bestText = l.pr ? `${l.best}  ★` : l.best;
    ctx.fillText(bestText, right, y);
    const bestW = ctx.measureText(bestText).width;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffffff';
    ctx.font = `600 40px ${FONT}`;
    ctx.fillText(fit(ctx, l.name, right - PAD - 100 - bestW - 30), PAD + 100, y);
  });
  if (d.more > 0) {
    ctx.fillStyle = '#8e8e93';
    ctx.font = `500 36px ${FONT}`;
    ctx.fillText(`+ ${d.more} more exercise${d.more === 1 ? '' : 's'}`, PAD, top + d.lines.length * step);
  }

  ctx.fillStyle = '#ffb300';
  ctx.fillRect(PAD, H - 150, 120, 8);
  ctx.fillStyle = '#8e8e93';
  ctx.font = `500 32px ${FONT}`;
  ctx.fillText('Logged on my phone, nothing uploaded', PAD, H - 90);
};

/** The card as a PNG data URL. */
export const renderLiftCard = async (d: LiftCardData): Promise<string> => {
  const canvas = document.createElement('canvas');
  drawLiftCard(canvas, d);
  return canvas.toDataURL('image/png');
};
