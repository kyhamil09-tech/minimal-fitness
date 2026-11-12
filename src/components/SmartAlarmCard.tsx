import React, { useEffect } from 'react';
import { AlarmClock } from 'lucide-react';
import { ColorPalette } from '../types/theme';
import { Glance, isAndroidApp } from '../lib/native';
import { usePersistentState } from '../hooks/usePersistentState';

interface AlarmSetting {
  enabled: boolean;
  /** Latest wake time, HH:MM. */
  wake: string;
  windowMin: number;
}

const DEFAULT: AlarmSetting = { enabled: false, wake: '07:00', windowMin: 30 };

const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return (Number.isFinite(h) ? h : 7) * 60 + (Number.isFinite(m) ? m : 0);
};

/** A wrist alarm that wakes you at a light-sleep moment inside a window before your wake time. The watch does the listening. */
export const SmartAlarmCard: React.FC<{ theme: ColorPalette }> = ({ theme }) => {
  const [a, setA] = usePersistentState<AlarmSetting>('smart_alarm', DEFAULT);

  // Tell the watch whenever the setting changes (and once at start, in case the watch missed it).
  useEffect(() => {
    if (!isAndroidApp()) return;
    void Glance.sendAlarm({ enabled: a.enabled, wakeMin: minutes(a.wake), windowMin: a.windowMin }).catch(() => undefined);
  }, [a.enabled, a.wake, a.windowMin]);

  const start = (() => {
    const t = (minutes(a.wake) - a.windowMin + 1440) % 1440;
    return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
  })();

  return (
    <section className="rounded-3xl border p-5 space-y-3" style={{ backgroundColor: theme.surface, borderColor: theme.surfaceBorder }}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <AlarmClock className="w-4 h-4" style={{ color: theme.primary }} />
          <h3 className="gh-title" style={{ fontSize: '1.05rem' }}>Smart alarm (watch)</h3>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={a.enabled}
          aria-label="Smart alarm"
          onClick={() => setA({ ...a, enabled: !a.enabled })}
          className="w-10 h-6 rounded-full relative transition-colors shrink-0"
          style={{ backgroundColor: a.enabled ? theme.primary : '#1F2430' }}
        >
          <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all" style={{ left: a.enabled ? '1.15rem' : '0.125rem' }} />
        </button>
      </div>
      <p className="text-xs text-neutral-400 leading-relaxed">
        Wear your watch to bed. From {start} the watch listens to your wrist movement and heart rate and buzzes at the first sign of light sleep. If it sees none, it buzzes at your wake time. It only listens inside that window, and nothing is recorded or sent.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-xs text-neutral-400">
          Wake no later than
          <input type="time" value={a.wake} onChange={(e) => setA({ ...a, wake: e.target.value })} aria-label="Latest wake time" className="mt-1 w-full px-3 py-2 text-sm" />
        </label>
        <label className="text-xs text-neutral-400">
          Window
          <select value={a.windowMin} onChange={(e) => setA({ ...a, windowMin: Number(e.target.value) })} aria-label="Window length" className="mt-1 w-full px-3 py-2 text-sm">
            {[15, 20, 30, 45].map((m) => (
              <option key={m} value={m}>
                {m} minutes
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="text-xs text-neutral-400 leading-relaxed">
        It is a gentle wake-up, not a guaranteed one: keep your normal phone alarm as a backup the first few nights. The watch needs its battery above about 20% and the Minimal Fitness watch app installed.
      </p>
    </section>
  );
};
