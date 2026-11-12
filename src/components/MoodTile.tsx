import React, { useMemo } from 'react';
import { SmilePlus } from 'lucide-react';
import { usePersistentState } from '../hooks/usePersistentState';
import { ENERGY_LABELS, MIN_ENTRIES, MOOD_LABELS, MoodEntry, moodFactors, setCheckIn } from '../lib/mood';
import { FastingSession, SleepLogEntry, WorkoutSession } from '../types/health';
import { ColorPalette } from '../types/theme';
import { todayKey } from '../lib/dates';
import { LearnMore } from './ui/LearnMore';

const Row: React.FC<{ title: string; labels: readonly string[]; value?: number; onPick: (n: number) => void; primary: string }> = ({ title, labels, value, onPick, primary }) => (
  <div>
    <div className="mb-1.5 flex items-center justify-between">
      <span className="stat-label">{title}</span>
      <span className="text-xs font-bold" style={{ color: primary }}>
        {value ? labels[value - 1] : ''}
      </span>
    </div>
    <div className="grid grid-cols-5 gap-1.5" role="group" aria-label={title}>
      {labels.map((l, i) => (
        <button key={l} type="button" onClick={() => onPick(i + 1)} aria-pressed={value === i + 1} aria-label={`${title}: ${l}`} className="sport-pill !px-0 !py-2.5 !text-xs !justify-center text-center">
          {i + 1}
        </button>
      ))}
    </div>
  </div>
);

/**
 * A one-tap daily check-in on Home: how you feel and how much energy you have, 1 to 5. After enough days it shows what goes with your
 * better days (sleep, training, fasting) from your own numbers. Everything stays on the phone.
 */
export const MoodTile: React.FC<{ theme: ColorPalette; sleepLogs: SleepLogEntry[]; workouts: WorkoutSession[]; fasts: FastingSession[] }> = ({ theme, sleepLogs, workouts, fasts }) => {
  const [entries, setEntries] = usePersistentState<MoodEntry[]>('mood_log', []);
  const today = todayKey();
  const mine = entries.find((e) => e.date === today);
  const factors = useMemo(() => moodFactors(entries, sleepLogs, workouts, fasts).slice(0, 2), [entries, sleepLogs, workouts, fasts]);
  const pick = (part: 'mood' | 'energy') => (n: number) => setEntries(setCheckIn(entries, today, part, n, Date.now()));
  const sentence = (f: (typeof factors)[number]) => `${f.metric === 'mood' ? 'Mood' : 'Energy'} runs ${Math.abs(f.diff)} ${f.diff > 0 ? 'higher' : 'lower'} ${f.label} (${f.withMean} against ${f.withoutMean} out of 5, ${f.nWith} and ${f.nWithout} days).`;

  return (
    <section className="rounded-2xl border p-4 space-y-3 glass-tile" style={{ backgroundColor: theme.surface, borderColor: theme.surfaceBorder }}>
      <div className="flex items-center gap-2">
        <SmilePlus className="h-4 w-4" style={{ color: theme.primary }} aria-hidden="true" />
        <span className="stat-label">How are you today?</span>
        <LearnMore text={`Two taps a day. After ${MIN_ENTRIES} check-ins the app looks for what goes with your better days, such as sleep, training or fasting. It only compares your own numbers, on this phone, and shows a pattern, not a cause.`} />
      </div>
      <Row title="Mood" labels={MOOD_LABELS} value={mine?.mood} onPick={pick('mood')} primary={theme.primary} />
      <Row title="Energy" labels={ENERGY_LABELS} value={mine?.energy} onPick={pick('energy')} primary={theme.primary} />
      {factors.length > 0 ? (
        <div className="space-y-1 border-t pt-2" style={{ borderColor: 'var(--hairline)' }}>
          {factors.map((f) => (
            <p key={`${f.id}-${f.metric}`} className="text-xs leading-relaxed text-neutral-300">
              {sentence(f)}
            </p>
          ))}
        </div>
      ) : entries.length > 0 && entries.length < MIN_ENTRIES ? (
        <p className="text-xs text-neutral-400">
          {entries.length} of {MIN_ENTRIES} check-ins before patterns appear.
        </p>
      ) : null}
    </section>
  );
};
