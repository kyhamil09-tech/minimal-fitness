import { PlanDay } from '../types/tracking';
import { Readiness } from './readiness';

export type PlanAction = 'keep' | 'ease' | 'swap-easy' | 'rest';

export interface PlanAdvice {
  action: PlanAction;
  title: string;
  message: string;
  /** The day as adjusted, for the cases where it still happens (a shorter version). */
  adjusted?: { targetMinutes?: number; targetKm?: number };
}

/** A day that asks a lot: intervals, HIIT, or a long session. */
export const isHardDay = (d: Pick<PlanDay, 'kind' | 'intervalId' | 'cardioType' | 'targetMinutes' | 'targetKm'>): boolean => {
  if (d.kind === 'rest' || d.kind === 'mobility') return false;
  if (d.intervalId || d.cardioType === 'HIIT') return true;
  return (d.targetMinutes ?? 0) >= 60 || (d.targetKm ?? 0) >= 12;
};

const scale = (v: number | undefined, f: number) => (v === undefined ? undefined : Math.round(v * f * 10) / 10);

/**
 * Suggests how to do today's planned session given how recovered you are. A hard day on a low-readiness morning is shortened or
 * swapped for an easy one; a very low score suggests rest. It only suggests: the plan itself is never changed.
 */
export const adaptPlanDay = (day: PlanDay, readiness: Pick<Readiness, 'score' | 'label'> | null): PlanAdvice => {
  if (!readiness || day.kind === 'rest') return { action: 'keep', title: '', message: '' };
  const s = readiness.score;
  const hard = isHardDay(day);
  if (s < 30) {
    return { action: 'rest', title: 'Rest today', message: `Readiness is ${s} (${readiness.label.toLowerCase()}). Several recovery signs are low, so skipping today's session, or an easy walk, will do more for you.` };
  }
  if (s < 50) {
    if (hard) {
      return {
        action: 'swap-easy',
        title: 'Make it an easy day',
        message: `Readiness is ${s}. A hard session now costs more than it gives. Do about half the time at an easy effort, and keep "${day.title}" for a better day.`,
        adjusted: { targetMinutes: scale(day.targetMinutes, 0.5), targetKm: scale(day.targetKm, 0.5) },
      };
    }
    return { action: 'ease', title: 'Go gently', message: `Readiness is ${s}. Do it, but cut it by a quarter and keep the effort easy.`, adjusted: { targetMinutes: scale(day.targetMinutes, 0.75), targetKm: scale(day.targetKm, 0.75) } };
  }
  if (s < 70 && hard) {
    return { action: 'ease', title: 'Trim today a little', message: `Readiness is ${s}. You are partly recovered: do the session, but shorten it by about 20% and stop if it feels heavy.`, adjusted: { targetMinutes: scale(day.targetMinutes, 0.8), targetKm: scale(day.targetKm, 0.8) } };
  }
  return { action: 'keep', title: 'Go as planned', message: s >= 85 ? `Readiness is ${s}: you are primed for today's plan.` : `Readiness is ${s}: recovered enough to do today's plan.` };
};
