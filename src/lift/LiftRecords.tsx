import React, { useMemo, useState } from 'react';
import { Search, Trophy } from 'lucide-react';
import { WorkoutSession } from '../types/health';
import { UserProfile } from '../types/tracking';
import { personalRecords } from '../lib/calc';
import { recordEvents } from '../lib/liftStats';
import { formatWeight, kgToDisplay, weightUnit } from '../lib/units';
import { Header } from './ui';
import { EmptyState } from './visuals';

const dateText = (ms: number): string => (ms ? new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '');

/** Every personal record: the best lift of each exercise, and a timeline of each time a best was beaten. */
export const LiftRecords: React.FC<{ profile: UserProfile; workouts: WorkoutSession[]; onBack: () => void; onOpenExercise: (id: string) => void }> = ({ profile, workouts, onBack, onOpenExercise }) => {
  const units = profile.units;
  const [view, setView] = useState<'best' | 'timeline'>('best');
  const [query, setQuery] = useState('');
  const best = useMemo(() => Object.values(personalRecords(workouts)).sort((a, b) => b.achievedAt - a.achievedAt), [workouts]);
  const events = useMemo(() => recordEvents(workouts), [workouts]);
  const q = query.trim().toLowerCase();
  const bestShown = best.filter((r) => !q || r.name.toLowerCase().includes(q));
  const eventsShown = events.filter((e) => !q || e.name.toLowerCase().includes(q));
  const months: { label: string; items: typeof events }[] = [];
  for (const e of eventsShown) {
    const label = new Date(e.at).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    const last = months[months.length - 1];
    if (last && last.label === label) last.items.push(e);
    else months.push({ label, items: [e] });
  }
  return (
    <>
      <Header title="Personal records" sub={`${best.length} lift${best.length === 1 ? '' : 's'} · ${events.length} new best${events.length === 1 ? '' : 's'}`} onBack={onBack} />
      <div className="l-scroll">
        <div className="mt-3 flex gap-2" role="group" aria-label="Records views">
          <button type="button" className="l-chip flex-1" aria-pressed={view === 'best'} onClick={() => setView('best')}>
            Best lifts
          </button>
          <button type="button" className="l-chip flex-1" aria-pressed={view === 'timeline'} onClick={() => setView('timeline')}>
            Timeline
          </button>
        </div>
        <div className="relative mt-3">
          <Search className="l-dim pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" aria-hidden="true" />
          <input aria-label="Search records" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by exercise" className="h-11 w-full pl-9 pr-3 text-sm" />
        </div>

        {view === 'best' ? (
          bestShown.length === 0 ? (
            best.length === 0 ? <EmptyState icon={<Trophy className="h-7 w-7" />} title="No records yet" text="Records appear here once you have logged some weighted sets." /> : <p className="l-dim py-10 text-center text-sm">{`No record for “${query.trim()}”.`}</p>
          ) : (
            <ul className="l-card mt-3 divide-y" style={{ borderColor: 'var(--l-line)' }}>
              {bestShown.map((r, i) => (
                <li key={r.exerciseId}>
                  <button type="button" className="flex min-h-[60px] w-full items-center justify-between gap-3 px-4 py-2 text-left" style={{ background: 'transparent', border: 0, color: 'var(--l-text)', borderTop: i > 0 ? '1px solid var(--l-line)' : 0 }} onClick={() => onOpenExercise(r.exerciseId)}>
                    <span className="min-w-0">
                      <span className="block truncate text-[15px] font-semibold">{r.name}</span>
                      <span className="l-dim block text-xs">
                        {dateText(r.achievedAt)} · est. 1RM {Math.round(kgToDisplay(r.oneRepMax, units))} {weightUnit(units)}
                      </span>
                    </span>
                    <span className="shrink-0 text-sm font-bold tabular-nums">
                      {formatWeight(r.weightKg, units)} × {r.reps}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )
        ) : months.length === 0 ? (
          events.length === 0 ? <EmptyState icon={<Trophy className="h-7 w-7" />} title="No new bests yet" text="Each time you beat your best on a lift, it is listed here." /> : <p className="l-dim py-10 text-center text-sm">{`No record for “${query.trim()}”.`}</p>
        ) : (
          months.map((m) => (
            <section key={m.label} aria-label={m.label}>
              <h2 className="l-h2">{m.label}</h2>
              <ul className="space-y-2">
                {m.items.map((e, i) => (
                  <li key={`${e.at}-${e.exerciseId}-${i}`}>
                    <button type="button" className="l-card flex w-full items-center gap-3 p-3 text-left" style={{ color: 'var(--l-text)' }} onClick={() => onOpenExercise(e.exerciseId)}>
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ background: 'var(--l-fill)', color: 'var(--l-on-fill)' }} aria-hidden="true">
                        <Trophy className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-semibold">{e.name}</span>
                        <span className="l-dim block text-xs">
                          {dateText(e.at)} · {formatWeight(e.weightKg, units)} × {e.reps}
                        </span>
                      </span>
                      <span className="shrink-0 text-right text-xs tabular-nums">
                        <span className="block font-bold">{Math.round(kgToDisplay(e.e1rmKg, units))} {weightUnit(units)}</span>
                        <span className="l-dim block">+{Math.round(kgToDisplay(e.e1rmKg - e.previousKg, units) * 10) / 10}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
        <div className="h-8" />
      </div>
    </>
  );
};
