import React, { useMemo, useState } from 'react';
import { Dumbbell } from 'lucide-react';
import { WorkoutSession } from '../types/health';
import { UnitSystem } from '../types/tracking';
import { ColorPalette } from '../types/theme';
import { LineChart } from './ui/charts';
import { MUSCLE_GROUPS } from '../data/exercises';
import { e1rmChangePct, e1rmSeries, liftHistory, suggestNext, trainedLifts, volumeBand, weeklySets } from '../lib/strengthProgress';
import { shortMonthDay, todayKey, toDateKey } from '../lib/dates';
import { formatWeight, kgToDisplay } from '../lib/units';

const BAND_COLOR = { low: '#FFB066', good: '#5fd68a', high: '#ff6b6b' } as const;
const BAND_TEXT = { low: 'light', good: 'in the usual range', high: 'a lot' } as const;

interface Props {
  theme: ColorPalette;
  workouts: WorkoutSession[];
  units: UnitSystem;
}

/** Strength progress: estimated one-rep max per lift over time, what to lift next, and hard sets per muscle group each week. */
export const LiftingCard: React.FC<Props> = ({ theme, workouts, units }) => {
  const lifts = useMemo(() => trainedLifts(workouts), [workouts]);
  const [picked, setPicked] = useState<string>('');
  const id = lifts.some((l) => l.exerciseId === picked) ? picked : lifts[0]?.exerciseId ?? '';
  const history = useMemo(() => (id ? liftHistory(workouts, id) : []), [workouts, id]);
  const series = e1rmSeries(history);
  const change = e1rmChangePct(history);
  const next = id ? suggestNext(history, id, units) : null;
  const weeks = useMemo(() => weeklySets(workouts, todayKey(), 6), [workouts]);
  const thisWeek = weeks[weeks.length - 1];
  const shown = MUSCLE_GROUPS.filter((m) => weeks.some((w) => w.sets[m] > 0));

  if (lifts.length === 0) {
    return (
      <section className="rounded-3xl border p-4 space-y-2" style={{ backgroundColor: theme.surface, borderColor: theme.surfaceBorder }}>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[#7E889B] flex items-center gap-1.5"><Dumbbell className="w-3.5 h-3.5" /> Lifting</h3>
        <p className="text-xs text-neutral-400">Log a strength workout with weights and this fills in: estimated one-rep max over time, what to lift next, and sets per muscle each week.</p>
      </section>
    );
  }

  return (
    <section className="rounded-3xl border p-4 space-y-3" style={{ backgroundColor: theme.surface, borderColor: theme.surfaceBorder }}>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-[#7E889B] flex items-center gap-1.5"><Dumbbell className="w-3.5 h-3.5" /> Lifting</h3>
      <select
        aria-label="Lift"
        value={id}
        onChange={(e) => setPicked(e.target.value)}
        className="w-full rounded-xl bg-black/50 border border-[#1A1E26] text-xs text-white px-3 py-2"
      >
        {lifts.map((l) => (
          <option key={l.exerciseId} value={l.exerciseId}>{l.name} ({l.sessions})</option>
        ))}
      </select>

      <div className="flex items-end justify-between">
        <div>
          <div className="text-[10px] text-neutral-500">Estimated one-rep max</div>
          <div className="text-2xl font-bold font-mono text-white">{series.length ? formatWeight(series[series.length - 1].e1rm, units, 0) : '-'}</div>
        </div>
        {change !== null && (
          <div className="text-xs font-mono" style={{ color: change >= 0 ? '#5fd68a' : '#FFB066' }}>
            {change >= 0 ? '+' : ''}{change}% over the last {Math.min(6, series.length)} sessions
          </div>
        )}
      </div>
      {series.length >= 2 ? (
        <LineChart
          points={series.map((p) => ({ label: shortMonthDay(toDateKey(p.at)), value: kgToDisplay(p.e1rm, units, 1) }))}
          color={theme.primary}
          unit={units === 'imperial' ? ' lb' : ' kg'}
          ariaLabel={`Estimated one-rep max over time`}
        />
      ) : (
        <p className="text-[11px] text-neutral-500">Two sessions of this lift draw the chart.</p>
      )}
      {next && <p className="text-[11px] text-neutral-300 rounded-xl border border-[#1A1E26] bg-black/40 px-3 py-2">Next time: {next.reason}</p>}

      <div className="pt-1">
        <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1.5">Sets this week by muscle</div>
        <ul className="space-y-1.5">
          {shown.length === 0 && <li className="text-[11px] text-neutral-500">No sets in the last 6 weeks.</li>}
          {shown.map((m) => {
            const n = thisWeek.sets[m];
            const band = volumeBand(n);
            return (
              <li key={m} className="flex items-center gap-2 text-[11px]">
                <span className="w-20 text-neutral-300">{m}</span>
                <div className="flex-1 h-2 rounded-full bg-black/60 overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${Math.min(100, (n / 24) * 100)}%`, backgroundColor: n === 0 ? 'transparent' : BAND_COLOR[band] }} />
                </div>
                <span className="w-24 text-right font-mono text-neutral-400">{n} sets{n > 0 ? ` · ${BAND_TEXT[band]}` : ''}</span>
              </li>
            );
          })}
        </ul>
        <p className="text-[10px] text-neutral-500 mt-2">About 10 to 20 hard sets a week per muscle is where most lifters make progress. It is a guide, not a rule.</p>
      </div>
    </section>
  );
};
