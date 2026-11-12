import React, { useMemo } from 'react';
import { Coffee, Trash2, Wine } from 'lucide-react';
import { usePersistentState } from '../hooks/usePersistentState';
import { CAFFEINE_DAILY_MG, DRINK_PRESETS, DrinkEntry, MIN_NIGHTS, dayTotals, nightEffects } from '../lib/drinks';
import { SleepLogEntry } from '../types/health';
import { addDays, toDateKey, todayKey } from '../lib/dates';
import { LearnMore } from './ui/LearnMore';

const clock = (at: number) => new Date(at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
const hm = (min: number) => `${Math.floor(Math.abs(min) / 60)} h ${String(Math.abs(min) % 60).padStart(2, '0')} min`;

/**
 * A quick count of caffeine and alcohol: tap a drink to log one now. Shows today against a usual caffeine ceiling, and, once there are
 * enough nights, what your own sleep did after late caffeine or a drinking evening. Nothing is sent anywhere.
 */
export const DrinksLog: React.FC<{ primary: string; sleepLogs: SleepLogEntry[] }> = ({ primary, sleepLogs }) => {
  const [entries, setEntries] = usePersistentState<DrinkEntry[]>('drinks', []);
  const today = todayKey();
  const totals = dayTotals(entries, today);
  const effects = useMemo(() => nightEffects(entries, sleepLogs), [entries, sleepLogs]);
  const week = useMemo(
    () =>
      [6, 5, 4, 3, 2, 1, 0].map((n) => {
        const k = addDays(today, -n);
        const t = dayTotals(entries, k);
        return { k, mg: t.caffeineMg, drinks: t.alcoholDrinks };
      }),
    [entries, today]
  );
  const todays = entries.filter((e) => toDateKey(e.at) === today).sort((a, b) => b.at - a.at);
  const add = (p: (typeof DRINK_PRESETS)[number]) => setEntries([...entries, { id: `${Date.now()}-${p.label}`, at: Date.now(), kind: p.kind, label: p.label, amount: p.amount }]);
  const over = totals.caffeineMg > CAFFEINE_DAILY_MG;
  const maxMg = Math.max(CAFFEINE_DAILY_MG, ...week.map((d) => d.mg));

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Coffee className="h-4 w-4 text-amber-300" aria-hidden="true" />
        <span className="stat-label">Caffeine and alcohol</span>
        <LearnMore text="Tap a drink to log one now. Caffeine amounts are typical for one serving (a coffee is about 95 mg); real drinks vary. One alcoholic drink is a standard serving. The comparison uses only your own nights and appears once there are enough of them. It is a pattern, not a diagnosis." />
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Log a drink">
        {DRINK_PRESETS.map((p) => (
          <button key={p.label} type="button" onClick={() => add(p)} aria-label={`Log ${p.label} now`} className="sport-pill !py-2 !px-3.5 !text-xs">
            {p.kind === 'alcohol' ? <Wine className="mr-1 inline h-3 w-3" aria-hidden="true" /> : <Coffee className="mr-1 inline h-3 w-3" aria-hidden="true" />}
            {p.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-2xl p-3" style={{ backgroundColor: 'var(--card2)' }}>
          <div className="stat-label">Caffeine today</div>
          <div className="hero-num text-3xl" style={{ color: over ? '#F43F5E' : primary }}>
            {totals.caffeineMg}
            <span className="ml-1 text-xs text-neutral-400">mg</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full" style={{ backgroundColor: 'var(--hairline)' }} role="img" aria-label={`${totals.caffeineMg} of ${CAFFEINE_DAILY_MG} milligrams`}>
            <div className="h-full rounded-full" style={{ width: `${Math.min(100, (totals.caffeineMg / CAFFEINE_DAILY_MG) * 100)}%`, backgroundColor: over ? '#F43F5E' : primary }} />
          </div>
          <div className="mt-1 text-xs text-neutral-400">{over ? 'Over the usual 400 mg a day' : `of a usual ${CAFFEINE_DAILY_MG} mg`}</div>
        </div>
        <div className="rounded-2xl p-3" style={{ backgroundColor: 'var(--card2)' }}>
          <div className="stat-label">Alcohol today</div>
          <div className="hero-num text-3xl text-white">
            {totals.alcoholDrinks}
            <span className="ml-1 text-xs text-neutral-400">{totals.alcoholDrinks === 1 ? 'drink' : 'drinks'}</span>
          </div>
          <div className="mt-1 text-xs text-neutral-400">{totals.lateCaffeineMg > 0 ? `${totals.lateCaffeineMg} mg of caffeine after ${15}:00` : 'Just a count, no target'}</div>
        </div>
      </div>

      <div>
        <div className="stat-label mb-1.5">Last 7 days · caffeine</div>
        <div className="flex h-16 items-end gap-1.5" role="img" aria-label="Caffeine over the last seven days">
          {week.map((d) => (
            <div key={d.k} className="flex flex-1 flex-col items-center gap-1">
              <div className="w-full rounded-t-md" style={{ height: `${Math.max(3, (d.mg / maxMg) * 52)}px`, backgroundColor: d.mg > CAFFEINE_DAILY_MG ? '#F43F5E' : primary, opacity: d.mg ? 1 : 0.25 }} />
              <span className="text-[10px] text-neutral-400">{new Date(`${d.k}T12:00:00`).toLocaleDateString(undefined, { weekday: 'narrow' })}</span>
            </div>
          ))}
        </div>
      </div>

      {todays.length > 0 && (
        <ul className="space-y-1.5">
          {todays.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-2 rounded-xl px-3 py-1.5 text-xs" style={{ backgroundColor: 'var(--card2)' }}>
              <span className="text-neutral-200">
                {e.label} · {clock(e.at)}
                <span className="text-neutral-400"> · {e.kind === 'caffeine' ? `${e.amount} mg` : `${e.amount} drink`}</span>
              </span>
              <button type="button" aria-label={`Delete ${e.label} at ${clock(e.at)}`} onClick={() => setEntries(entries.filter((x) => x.id !== e.id))} className="inline-flex h-11 w-11 items-center justify-center text-neutral-400">
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {effects.length > 0 ? (
        <div className="space-y-2 border-t pt-3" style={{ borderColor: 'var(--hairline)' }}>
          <div className="stat-label">Your sleep</div>
          {effects.map((f) => (
            <p key={f.id} className="text-xs leading-relaxed text-neutral-300">
              {f.label}: <strong className="text-white">{hm(f.withMin)}</strong> against <strong className="text-white">{hm(f.withoutMin)}</strong> otherwise ({f.diffMin < 0 ? `${hm(f.diffMin)} less` : f.diffMin > 0 ? `${hm(f.diffMin)} more` : 'no difference'}, {f.nWith} and {f.nWithout} nights).
            </p>
          ))}
        </div>
      ) : (
        <p className="text-xs text-neutral-400">Log drinks and sleep for a few weeks and this shows how your sleep differs after late caffeine or a drinking evening (needs {MIN_NIGHTS} nights of each).</p>
      )}
    </div>
  );
};
