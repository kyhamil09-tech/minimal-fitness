import React, { useMemo } from 'react';
import { Trophy } from 'lucide-react';
import { WorkoutSession } from '../types/health';
import { ColorPalette } from '../types/theme';
import { UnitSystem } from '../types/tracking';
import { personalBests, formatDuration } from '../lib/workoutStats';
import { shortMonthDay, toDateKey } from '../lib/dates';
import { distanceUnit, kmToDisplay } from '../lib/units';

interface RecordsCardProps {
  workouts: WorkoutSession[];
  units: UnitSystem;
  theme: ColorPalette;
  onOpen: (w: WorkoutSession) => void;
}

/** Your fastest 1 km, mile, 5 km, 10 km and half marathon, found automatically from recorded runs. */
export const RecordsCard: React.FC<RecordsCardProps> = ({ workouts, units, theme, onOpen }) => {
  const pbs = useMemo(() => personalBests(workouts), [workouts]);
  const longest = useMemo(
    () =>
      workouts
        .filter((w) => w.type === 'Running' && (w.distanceKm ?? 0) > 0)
        .reduce<WorkoutSession | null>((best, w) => (!best || (w.distanceKm ?? 0) > (best.distanceKm ?? 0) ? w : best), null),
    [workouts]
  );
  if (pbs.length === 0 && !longest) return null;

  const tile = (key: string, label: string, value: string, sub: string, w?: WorkoutSession) => (
    <button
      key={key}
      onClick={() => w && onOpen(w)}
      disabled={!w}
      className="rounded-2xl glass-inset p-3 text-left"
    >
      <div className="text-xs text-neutral-400">{label}</div>
      <div className="text-lg font-semibold tabular-nums text-white leading-tight mt-0.5">{value}</div>
      <div className="text-xs text-neutral-400 mt-0.5">{sub}</div>
    </button>
  );

  return (
    <section
      className="rounded-[28px] border p-5"
      style={{ backgroundColor: theme.surface, borderColor: theme.surfaceBorder }}
      aria-label="Running records"
    >
      <div className="flex items-center gap-2 mb-3">
        <Trophy className="w-4 h-4 text-amber-300" />
        <h3 className="text-sm font-semibold text-white">Running records</h3>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {pbs.map((p) => {
          const w = workouts.find((x) => x.id === p.workoutId);
          return tile(p.target.id, p.target.label, formatDuration(p.seconds), p.at ? shortMonthDay(toDateKey(p.at)) : '', w);
        })}
        {longest &&
          tile(
            'longest',
            'Longest run',
            `${kmToDisplay(longest.distanceKm ?? 0, units)} ${distanceUnit(units)}`,
            longest.startedAt ? shortMonthDay(toDateKey(longest.startedAt)) : '',
            longest
          )}
      </div>
    </section>
  );
};