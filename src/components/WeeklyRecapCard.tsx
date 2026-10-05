import React, { useMemo, useState } from 'react';
import { CalendarDays, Share2, TrendingDown, TrendingUp } from 'lucide-react';
import { ColorPalette } from '../types/theme';
import { SleepLogEntry, WorkoutSession } from '../types/health';
import { Goals, UnitSystem } from '../types/tracking';
import { StoryData, buildWeeklyStory } from '../lib/storyCards';
import { StoryShareModal } from './StoryShareModal';
import { addDays, shortMonthDay, startOfWeek, toDateKey, todayKey } from '../lib/dates';
import { changePct, weeklyRecap } from '../lib/weeklyRecap';
import { distanceUnit, kmToDisplay } from '../lib/units';

interface Props {
  theme: ColorPalette;
  workouts: WorkoutSession[];
  sleepLogs: SleepLogEntry[];
  units: UnitSystem;
  goals: Goals;
}

const hm = (min: number) => `${Math.floor(min / 60)}h ${String(Math.round(min % 60)).padStart(2, '0')}m`;

interface Row {
  label: string;
  now: number;
  before: number;
  text: string;
  beforeText: string;
  /** Training load is shown neutral: more is not simply better. */
  neutral?: boolean;
}

/** This week (so far) or last week against the week before: distance, time, workouts, training load and sleep. */
export const WeeklyRecapCard: React.FC<Props> = ({ theme, workouts, sleepLogs, units, goals }) => {
  const [which, setWhich] = useState<'this' | 'last'>('this');
  const [story, setStory] = useState<StoryData | null>(null);
  const today = todayKey();
  const recap = useMemo(() => {
    const thisWeek = toDateKey(startOfWeek(new Date()));
    return weeklyRecap(workouts, sleepLogs, which === 'this' ? thisWeek : addDays(thisWeek, -7), today);
  }, [workouts, sleepLogs, which, today]);
  const { current: c, previous: p } = recap;

  const rows: Row[] = [
    { label: 'Distance', now: c.distanceKm, before: p.distanceKm, text: `${kmToDisplay(c.distanceKm, units, 1)} ${distanceUnit(units)}`, beforeText: `${kmToDisplay(p.distanceKm, units, 1)} ${distanceUnit(units)}` },
    { label: 'Active time', now: c.minutes, before: p.minutes, text: hm(c.minutes), beforeText: hm(p.minutes) },
    { label: 'Workouts', now: c.workouts, before: p.workouts, text: String(c.workouts), beforeText: String(p.workouts) },
    { label: 'Training load', now: c.load, before: p.load, text: String(Math.round(c.load)), beforeText: String(Math.round(p.load)), neutral: true },
    { label: 'Sleep per night', now: c.sleepAvgMin, before: p.sleepAvgMin, text: c.sleepNights ? hm(c.sleepAvgMin) : '–', beforeText: p.sleepNights ? hm(p.sleepAvgMin) : '–' },
  ];

  const range = `${shortMonthDay(recap.from)} – ${shortMonthDay(recap.to)}`;
  return (
    <section className="rounded-3xl border p-5 space-y-3" style={{ backgroundColor: theme.surface, borderColor: theme.surfaceBorder }}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CalendarDays className="w-4 h-4" style={{ color: theme.primary }} />
          <h3 className="gh-title" style={{ fontSize: '1.05rem' }}>Weekly recap</h3>
        </div>
        <div className="flex gap-1 p-1 bg-black/60 rounded-xl border border-[#1A1E26]" role="group" aria-label="Which week">
          {(['this', 'last'] as const).map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => setWhich(w)}
              aria-pressed={which === w}
              className={`px-3 py-1 rounded-lg text-[11px] font-semibold ${which === w ? 'bg-neutral-900 border border-neutral-700' : 'text-neutral-400'}`}
              style={{ color: which === w ? theme.primary : undefined }}
            >
              {w === 'this' ? 'This week' : 'Last week'}
            </button>
          ))}
        </div>
      </div>
      <p className="text-[11px] text-neutral-500">
        {range}
        {recap.days < 7 ? ` · ${recap.days} day${recap.days === 1 ? '' : 's'} so far, compared with the same days last week` : ' · compared with the week before'}
      </p>
      <p className="text-sm font-semibold text-white leading-snug">{recap.headline}</p>

      <div className="space-y-2">
        {rows.map((r) => {
          const pct = changePct(r.now, r.before);
          const up = pct !== undefined && pct > 0;
          const flat = pct === undefined || Math.abs(pct) < 3;
          const color = flat || r.neutral ? '#9CA3AF' : up ? '#6EE7B7' : '#FBBF24';
          const max = Math.max(r.now, r.before, 0.0001);
          return (
            <div key={r.label} className="rounded-2xl glass-inset p-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-neutral-400">{r.label}</span>
                <span className="flex items-center gap-1 text-[11px] font-bold tabular-nums" style={{ color }}>
                  {!flat && (up ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />)}
                  {pct === undefined ? (r.now > 0 ? 'new' : '–') : flat ? 'about the same' : `${up ? '+' : ''}${pct}%`}
                </span>
              </div>
              <div className="flex items-end justify-between mt-1">
                <span className="text-xl font-semibold text-white tabular-nums">{r.text}</span>
                <span className="text-[11px] text-neutral-500 tabular-nums">before: {r.beforeText}</span>
              </div>
              <div className="mt-2 space-y-1">
                <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${(r.now / max) * 100}%`, backgroundColor: theme.primary }} />
                </div>
                <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <div className="h-full rounded-full bg-white/35" style={{ width: `${(r.before / max) * 100}%` }} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {recap.longest && (
        <p className="text-[11px] text-neutral-500">
          Longest: {recap.longest.type.toLowerCase()}, {recap.longest.minutes} min
          {recap.longest.km ? `, ${kmToDisplay(recap.longest.km, units, 1)} ${distanceUnit(units)}` : ''}.
        </p>
      )}
      <button
        type="button"
        onClick={() => {
          const active = new Set(workouts.filter((w) => w.startedAt).map((w) => toDateKey(w.startedAt as number)));
          setStory(buildWeeklyStory(recap, goals, units, active, today));
        }}
        className="w-full py-2.5 rounded-2xl text-xs font-extrabold flex items-center justify-center gap-1.5"
        style={{ backgroundColor: 'var(--accent)', color: 'var(--on-accent)' }}
      >
        <Share2 className="w-3.5 h-3.5" /> Share as a story
      </button>
      {story && <StoryShareModal data={story} name="week" onClose={() => setStory(null)} />}
    </section>
  );
};
