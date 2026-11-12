import React, { useMemo } from 'react';
import { Minus, Moon, Plus, Wind } from 'lucide-react';
import { SleepLogEntry } from '../../types/health';
import { ColorPalette } from '../../types/theme';
import { todayKey } from '../../lib/dates';
import { GOAL_RANGE, SleepPrefs, hoursMin, repayPerNight, sleepDebt, typicalBedtime, windDownAt } from '../../lib/sleepPlan';

const LEADS = [15, 30, 45, 60];
const clock = (hour: number, minute: number) => {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
};

/**
 * Your sleep goal, how far behind it you are this week (sleep debt), and a wind-down nudge: a notification a little before bed that opens
 * a few minutes of Breathe. Debt is a rough guide: only nights that were tracked count, and one short night is not something to repay.
 */
export const SleepPlanCard: React.FC<{ theme: ColorPalette; logs: SleepLogEntry[]; prefs: SleepPrefs; onChange: (p: SleepPrefs) => void }> = ({ theme, logs, prefs, onChange }) => {
  const debt = useMemo(() => sleepDebt(logs, prefs.goalMin, todayKey(), 7), [logs, prefs.goalMin]);
  const typical = useMemo(() => typicalBedtime(logs), [logs]);
  const at = windDownAt(prefs.windDown.bed, prefs.windDown.lead);
  const maxMin = Math.max(prefs.goalMin * 1.25, ...debt.nights.map((n) => n.minutes), 1);
  const set = (goalMin: number) => onChange({ ...prefs, goalMin: Math.max(GOAL_RANGE.min, Math.min(GOAL_RANGE.max, goalMin)) });
  const wd = (patch: Partial<SleepPrefs['windDown']>) => onChange({ ...prefs, windDown: { ...prefs.windDown, ...patch } });
  const per = repayPerNight(debt.debtMin);

  return (
    <section className="rounded-3xl border p-5 space-y-4" style={{ backgroundColor: theme.surface, borderColor: theme.surfaceBorder }} aria-label="Sleep goal, debt and wind-down">
      <div className="flex items-center gap-2">
        <Moon className="w-4 h-4" style={{ color: theme.primary }} aria-hidden="true" />
        <h3 className="gh-title" style={{ fontSize: '1.05rem' }}>Sleep goal and debt</h3>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs text-neutral-400">Goal each night</div>
          <div className="text-xl font-extrabold tabular-nums text-white">{hoursMin(prefs.goalMin)}</div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="round-btn !w-11 !h-11" aria-label="Sleep goal 15 minutes less" onClick={() => set(prefs.goalMin - GOAL_RANGE.step)}>
            <Minus className="w-4 h-4" aria-hidden="true" />
          </button>
          <button type="button" className="round-btn !w-11 !h-11" aria-label="Sleep goal 15 minutes more" onClick={() => set(prefs.goalMin + GOAL_RANGE.step)}>
            <Plus className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {debt.logged === 0 ? (
        <p className="text-xs leading-relaxed text-neutral-400">Track a few nights (the watch, Health Connect, or by hand) and your week's sleep debt shows here.</p>
      ) : (
        <div>
          <div className="flex items-baseline justify-between gap-3">
            <div className="text-sm font-semibold text-white">{debt.debtMin === 0 ? 'No sleep debt this week' : `${hoursMin(debt.debtMin)} short this week`}</div>
            <div className="text-xs text-neutral-400">
              {debt.logged} night{debt.logged === 1 ? '' : 's'} tracked · avg {hoursMin(debt.avgMin)}
            </div>
          </div>
          <div className="mt-3 flex h-16 items-end gap-1.5" role="img" aria-label={`Sleep each of the last ${debt.nights.length} tracked nights against your goal of ${hoursMin(prefs.goalMin)}`}>
            {debt.nights.map((n) => (
              <div key={n.date} className="relative flex h-full flex-1 items-end">
                <div className="w-full rounded-t-md" style={{ height: `${Math.max(4, (n.minutes / maxMin) * 100)}%`, backgroundColor: n.minutes >= prefs.goalMin ? '#81C995' : n.minutes >= prefs.goalMin - 30 ? '#FDD663' : '#F28B82' }} />
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs leading-relaxed text-neutral-400">
            {debt.debtMin === 0
              ? 'You are at or over your goal on the nights you tracked. Nicely done.'
              : debt.debtMin < 60
                ? 'A small gap. Nothing to fix; an earlier night when it suits you is plenty.'
                : `A gentle way to win some back: about ${per} extra minutes for each of the next three nights. A guide, not a rule.`}
          </p>
        </div>
      )}

      <div className="border-t pt-4" style={{ borderColor: theme.surfaceBorder }}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Wind className="w-4 h-4" style={{ color: theme.primary }} aria-hidden="true" />
            <h4 className="text-sm font-bold text-white">Wind-down</h4>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={prefs.windDown.on}
            aria-label="Wind-down nudge"
            onClick={() => wd({ on: !prefs.windDown.on })}
            className="w-10 h-6 rounded-full relative transition-colors shrink-0"
            style={{ backgroundColor: prefs.windDown.on ? theme.primary : '#1F2430' }}
          >
            <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all" style={{ left: prefs.windDown.on ? '1.15rem' : '0.125rem' }} />
          </button>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-neutral-400">
          A nudge before bed that opens a few minutes of slow breathing. It buzzes your watch too, if you wear one.
        </p>
        {prefs.windDown.on && (
          <div className="mt-3 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs text-neutral-400">
                Bedtime
                <input type="time" value={prefs.windDown.bed} onChange={(e) => e.target.value && wd({ bed: e.target.value })} className="mt-1 w-full min-h-11 rounded-xl border bg-black/40 px-3 text-sm text-white" style={{ borderColor: theme.surfaceBorder }} />
              </label>
              <div className="text-xs text-neutral-400">
                Nudge at
                <div className="mt-1 flex min-h-11 items-center text-sm font-bold text-white">{clock(at.hour, at.minute)}</div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Minutes before bed">
              {LEADS.map((m) => (
                <button key={m} type="button" aria-pressed={prefs.windDown.lead === m} onClick={() => wd({ lead: m })} className="min-h-11 rounded-full border px-4 text-xs font-bold" style={{ borderColor: prefs.windDown.lead === m ? theme.primary : theme.surfaceBorder, color: prefs.windDown.lead === m ? theme.primary : '#D4D4D8' }}>
                  {m} min before
                </button>
              ))}
            </div>
            {typical && typical !== prefs.windDown.bed && (
              <button type="button" className="min-h-11 text-xs font-bold underline" style={{ color: theme.primary }} onClick={() => wd({ bed: typical })}>
                Use the bedtime you usually keep ({clock(Number(typical.slice(0, 2)), Number(typical.slice(3)))})
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
};
