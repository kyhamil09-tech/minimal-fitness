import React, { useMemo, useState } from 'react';
import { Check, Compass } from 'lucide-react';
import { ColorPalette } from '../types/theme';
import { SleepLogEntry, WorkoutSession } from '../types/health';
import { ActivePlan, FoodEntry, Goals } from '../types/tracking';
import { Ring } from './ui/charts';
import { getPlan } from '../data/plans';
import { PillarStatus, buildCoachReport } from '../lib/weeklyCoach';
import { trainingLoadStatus } from '../lib/trainingLoad';
import { addDays, shortMonthDay, startOfWeek, toDateKey, todayKey } from '../lib/dates';

interface WeeklyCoachCardProps {
  theme: ColorPalette;
  workouts: WorkoutSession[];
  sleepLogs: SleepLogEntry[];
  food: FoodEntry[];
  stepsLog: Record<string, number>;
  goals: Goals;
  activePlan: ActivePlan | null;
}

const DOT: Record<PillarStatus, string> = { good: '#81C995', ok: '#FDD663', low: '#F28B82', none: '#525A6B' };
const STATUS_WORD: Record<PillarStatus, string> = { good: 'Good', ok: 'Fair', low: 'Needs work', none: 'No data' };

/** A review of last week (or this week so far): a score, how each area went, what went well and what to do next week. */
export const WeeklyCoachCard: React.FC<WeeklyCoachCardProps> = ({ theme, workouts, sleepLogs, food, stepsLog, goals, activePlan }) => {
  const [which, setWhich] = useState<'last' | 'this'>('last');
  const today = todayKey();
  const report = useMemo(() => {
    const thisWeek = toDateKey(startOfWeek(new Date()));
    const weekStart = which === 'this' ? thisWeek : addDays(thisWeek, -7);
    const end = which === 'this' ? today : addDays(weekStart, 6);
    return buildCoachReport({
      weekStart,
      today,
      workouts,
      sleepLogs,
      food,
      steps: stepsLog,
      goals,
      plan: activePlan ? { plan: activePlan.plan ?? getPlan(activePlan.planId), startedAt: activePlan.startedAt } : null,
      loadRatio: trainingLoadStatus(workouts, end).ratio,
    });
  }, [which, today, workouts, sleepLogs, food, stepsLog, goals, activePlan]);

  const scoreColor = report.score === null ? '#525A6B' : report.score >= 70 ? '#81C995' : report.score >= 55 ? '#FDD663' : '#F28B82';

  return (
    <section className="rounded-3xl border p-5 space-y-4" style={{ backgroundColor: theme.surface, borderColor: theme.surfaceBorder }} aria-label="Weekly coach">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Compass className="h-4 w-4" style={{ color: theme.primary }} />
          <h2 className="gh-title" style={{ fontSize: '1.05rem' }}>
            Weekly coach
          </h2>
        </div>
        <div className="flex gap-1 rounded-xl border border-[#1A1E26] bg-black/60 p-1" role="group" aria-label="Which week to review">
          {(['last', 'this'] as const).map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => setWhich(w)}
              aria-pressed={which === w}
              className={`rounded-lg px-3 py-1 text-xs font-semibold ${which === w ? 'border border-neutral-700 bg-neutral-900' : 'text-neutral-400'}`}
              style={{ color: which === w ? theme.primary : undefined }}
            >
              {w === 'last' ? 'Last week' : 'This week'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-4">
        <Ring value={(report.score ?? 0) / 100} size={76} stroke={8} color={scoreColor} ariaLabel={report.score === null ? 'No score yet' : `Week score ${report.score} out of 100`}>
          <span className="text-lg font-bold tabular-nums text-white">{report.score ?? '–'}</span>
        </Ring>
        <div>
          <div className="text-base font-bold text-white">{report.label}</div>
          <div className="text-xs text-[#9AA3B2]">
            {shortMonthDay(report.from)} – {shortMonthDay(report.to)}
            {report.days < 7 ? ` · ${report.days} day${report.days === 1 ? '' : 's'} so far` : ''}
          </div>
          {report.score === null && <div className="mt-1 text-xs text-neutral-400">Log workouts, sleep or food and a review appears here.</div>}
        </div>
      </div>

      {report.score !== null && (
        <ul className="divide-y divide-[#1A1E26] rounded-2xl border border-[#1A1E26] bg-black/30">
          {report.pillars.map((p) => (
            <li key={p.id} className="flex items-start gap-3 px-3 py-2.5">
              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: DOT[p.status] }} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs font-semibold text-white">{p.label}</span>
                  <span className="text-xs font-semibold" style={{ color: DOT[p.status] }}>
                    {STATUS_WORD[p.status]}
                  </span>
                </div>
                <div className="text-xs text-[#9AA3B2]">{p.detail}</div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {report.wins.length > 0 && (
        <div>
          <h4 className="text-sm font-bold text-neutral-200">Went well</h4>
          <ul className="mt-1.5 space-y-1.5">
            {report.wins.map((w) => (
              <li key={w} className="flex items-start gap-2 text-xs leading-snug text-neutral-200">
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: '#81C995' }} />
                {w}
              </li>
            ))}
          </ul>
        </div>
      )}

      {report.focus.length > 0 && (
        <div>
          <h4 className="text-sm font-bold text-neutral-200">{which === 'last' ? 'Focus for this week' : 'Focus for the rest of the week'}</h4>
          <ol className="mt-1.5 space-y-2">
            {report.focus.map((f, i) => (
              <li key={f} className="flex items-start gap-2.5 text-xs leading-snug text-neutral-100">
                <span className="mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-xs font-bold text-black" style={{ background: theme.primary }}>
                  {i + 1}
                </span>
                {f}
              </li>
            ))}
          </ol>
        </div>
      )}

      <p className="text-xs leading-relaxed text-neutral-400">Worked out on this phone from what you logged; days with nothing logged are left out. General guidance, not medical advice.</p>
    </section>
  );
};
