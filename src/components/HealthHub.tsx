import React from 'react';
import { Droplets, HeartPulse, Moon, Timer, Wind } from 'lucide-react';
import { ColorPalette } from '../types/theme';
import { FastingSession, SleepLogEntry } from '../types/health';
import { FoodEntry, Goals, HealthLogEntry } from '../types/tracking';
import { todayKey } from '../lib/dates';
import { useT } from '../lib/i18n';
import { BreathSession, breathStats } from '../lib/breathing';

export type HealthSection = 'nutrition' | 'fasting' | 'sleep' | 'healthlog' | 'breathe';

interface HealthHubProps {
  theme: ColorPalette;
  current: HealthSection;
  onChange: (s: HealthSection) => void;
  food: FoodEntry[];
  goals: Goals;
  fasts: FastingSession[];
  sleepLogs: SleepLogEntry[];
  healthLog: HealthLogEntry[];
  breathLog?: BreathSession[];
}

const hm = (mins: number) => `${Math.floor(mins / 60)}h ${Math.round(mins % 60)}m`;

/**
 * The four parts of Health as big cards that each say how it is going right now. The one you are looking at is lit; tap another to
 * switch. It replaces a row of small tabs with something you can read at a glance.
 */
export const HealthHub: React.FC<HealthHubProps> = ({ theme, current, onChange, food, goals, fasts, sleepLogs, healthLog, breathLog = [] }) => {
  const t = useT();
  const today = todayKey();
  const eaten = Math.round(food.filter((f) => f.date === today).reduce((s, f) => s + f.calories, 0));
  const activeFast = fasts.find((f) => !f.isCompleted && !f.endTimestamp);
  const fastMins = activeFast ? Math.max(0, (Date.now() - activeFast.startTimestamp) / 60000) : 0;
  const lastSleep = sleepLogs[0];
  const weekAgo = Date.now() - 7 * 24 * 3600 * 1000;
  const recentLog = healthLog.filter((h) => h.at >= weekAgo).length;

  const breath = breathStats(breathLog, Date.now());

  const cards: { id: HealthSection; label: string; status: string; icon: React.ReactNode; color: string }[] = [
    { id: 'nutrition', label: t('hub.food'), status: t('hub.food.status', { eaten: eaten.toLocaleString(), goal: goals.dailyCalories.toLocaleString() }), icon: <Droplets className="h-5 w-5" />, color: '#7dd3fc' },
    { id: 'fasting', label: t('hub.fasting'), status: activeFast ? t('hub.fasting.on', { time: hm(fastMins) }) : t('hub.fasting.off'), icon: <Timer className="h-5 w-5" />, color: '#FCAD70' },
    { id: 'sleep', label: t('hub.sleep'), status: lastSleep ? t('hub.sleep.last', { time: hm(lastSleep.durationMinutes) }) : t('hub.sleep.none'), icon: <Moon className="h-5 w-5" />, color: '#C58AF9' },
    { id: 'healthlog', label: t('hub.healthlog'), status: recentLog > 0 ? t('hub.healthlog.week', { n: recentLog }) : t('hub.healthlog.none'), icon: <HeartPulse className="h-5 w-5" />, color: '#F28B82' },
    { id: 'breathe', label: t('hub.breathe'), status: breath.weekMinutes > 0 ? t('hub.breathe.week', { n: breath.weekMinutes }) : t('hub.breathe.none'), icon: <Wind className="h-5 w-5" />, color: '#81C995' },
  ];

  return (
    <div className="grid grid-cols-2 gap-3" role="tablist" aria-label={t('hub.sections')}>
      {cards.map((c, i) => {
        const on = c.id === current;
        return (
          <button
            key={c.id}
            role="tab"
            aria-selected={on}
            onClick={() => onChange(c.id)}
            className={`min-h-[88px] rounded-[24px] border p-3.5 text-left transition-colors ${i === cards.length - 1 && cards.length % 2 === 1 ? 'col-span-2' : ''}`}
            style={{
              backgroundColor: on ? `${c.color}1f` : theme.surface,
              borderColor: on ? c.color : theme.surfaceBorder,
              boxShadow: on ? `inset 0 0 0 1px ${c.color}` : undefined,
            }}
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full" style={{ background: `${c.color}26`, color: c.color }}>
              {c.icon}
            </span>
            <span className="mt-2 block text-sm font-bold text-white">{c.label}</span>
            <span className="block truncate text-xs text-[#B8C0CF]">{c.status}</span>
          </button>
        );
      })}
    </div>
  );
};
