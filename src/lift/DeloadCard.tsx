import React, { useMemo } from 'react';
import { BatteryCharging } from 'lucide-react';
import { WorkoutSession } from '../types/health';
import { usePersistentState } from '../hooks/usePersistentState';
import { DEFAULT_DELOAD, DeloadState, deloadActive, deloadAdvice, showDeloadSuggestion, snoozeDeload, startDeload } from '../lib/deload';

/**
 * An easy-week suggestion on the Workout tab, when the signs say the body could use one (see lib/deload). Starting a deload week makes
 * new workouts about 10% lighter with half the sets for seven days. It only ever suggests: "Not now" hides it for a week.
 */
export const DeloadCard: React.FC<{ workouts: WorkoutSession[] }> = ({ workouts }) => {
  const [state, setState] = usePersistentState<DeloadState>('lift_deload', DEFAULT_DELOAD);
  const now = Date.now();
  const advice = useMemo(() => deloadAdvice(workouts, now), [workouts, Math.floor(now / 3_600_000)]);

  if (deloadActive(state, now)) {
    const ends = new Date(state.until).toLocaleDateString(undefined, { weekday: 'long' });
    return (
      <section className="l-card mt-4 flex items-center justify-between gap-3" aria-label="Deload week">
        <div className="flex items-center gap-3">
          <BatteryCharging className="h-5 w-5 shrink-0" aria-hidden="true" />
          <div>
            <div className="text-sm font-bold">Deload week is on</div>
            <div className="l-dim text-xs">About 10% lighter, half the sets, until {ends}.</div>
          </div>
        </div>
        <button type="button" className="l-chip" onClick={() => setState({ ...DEFAULT_DELOAD })}>
          End early
        </button>
      </section>
    );
  }
  if (!showDeloadSuggestion(advice, state, now)) return null;
  return (
    <section className="l-card mt-4" aria-label="Easy week suggestion">
      <div className="flex items-center gap-2">
        <BatteryCharging className="h-5 w-5" aria-hidden="true" />
        <h2 className="text-sm font-bold">Time for an easy week?</h2>
      </div>
      <ul className="l-dim mt-2 list-disc space-y-1 pl-5 text-xs">
        {advice.reasons.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
      <p className="l-dim mt-2 text-xs">A deload week keeps the same exercises with about 10% less weight and half the sets, then you come back stronger. Only a suggestion.</p>
      <div className="mt-3 flex gap-2">
        <button type="button" className="l-btn flex-1" onClick={() => setState(startDeload(Date.now()))}>
          Start a deload week
        </button>
        <button type="button" className="l-btn l-btn-quiet" onClick={() => setState(snoozeDeload(Date.now()))}>
          Not now
        </button>
      </div>
    </section>
  );
};
