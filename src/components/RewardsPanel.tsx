import React, { useMemo } from 'react';
import { Award as AwardIcon, Flame, Share2, Timer } from 'lucide-react';
import { FastingSession, WorkoutSession } from '../types/health';
import { Goals } from '../types/tracking';
import { ColorPalette } from '../types/theme';
import { Award, AwardGroup, computeRewards, nextAward } from '../lib/rewards';
import { todayKey } from '../lib/dates';
import { fastingStats } from '../lib/fasting';

interface Props {
  theme: ColorPalette;
  workouts: WorkoutSession[];
  fasts: FastingSession[];
  goals: Pick<Goals, 'weeklyWorkouts'>;
  onShare: (a: Award) => void;
}

const GROUPS: { id: AwardGroup; title: string; icon: React.ElementType }[] = [
  { id: 'workout', title: 'Workout streaks', icon: Flame },
  { id: 'weekly', title: 'Weekly goal', icon: AwardIcon },
  { id: 'fasting', title: 'Fasting', icon: Timer },
];

/** Streak awards for workouts, weekly goals and fasting: the earned badges, and the next one to aim for in each group. */
export const RewardsPanel: React.FC<Props> = ({ theme, workouts, fasts, goals, onShare }) => {
  const awards = useMemo(() => computeRewards({ workouts, fasts, goals, today: todayKey() }), [workouts, fasts, goals]);
  const fs = useMemo(() => fastingStats(fasts, todayKey()), [fasts]);

  return (
    <>
      {GROUPS.map((g) => {
        const list = awards.filter((a) => a.group === g.id);
        const earned = list.filter((a) => a.unlocked);
        const next = nextAward(awards, g.id);
        const Icon = g.icon;
        return (
          <section key={g.id} className="rounded-3xl border p-4 space-y-3" style={{ backgroundColor: theme.surface, borderColor: theme.surfaceBorder }}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-neutral-200 flex items-center gap-1.5">
                <Icon className="w-3.5 h-3.5" style={{ color: theme.primary }} /> {g.title}
              </h3>
              <span className="text-xs font-mono text-neutral-400">
                {earned.length}/{list.length}
              </span>
            </div>

            {g.id === 'fasting' && (
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-2xl bg-black/40 border border-[#1A1E26] p-2.5">
                  <div className="text-lg font-bold font-mono text-white">{fs.streakDays}</div>
                  <div className="text-xs text-neutral-400">day streak</div>
                </div>
                <div className="rounded-2xl bg-black/40 border border-[#1A1E26] p-2.5">
                  <div className="text-lg font-bold font-mono text-white">{fs.goalMet}</div>
                  <div className="text-xs text-neutral-400">goals met</div>
                </div>
                <div className="rounded-2xl bg-black/40 border border-[#1A1E26] p-2.5">
                  <div className="text-lg font-bold font-mono text-white">{fs.longestHours}</div>
                  <div className="text-xs text-neutral-400">longest (h)</div>
                </div>
              </div>
            )}

            {next && (
              <div className="rounded-2xl border p-3" style={{ borderColor: theme.primary }}>
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-xs font-extrabold uppercase tracking-wider" style={{ color: theme.primary }}>
                      Next up
                    </div>
                    <div className="text-sm font-bold text-white truncate">{next.title}</div>
                    <div className="text-xs text-[#9AA3B2]">{next.description}</div>
                  </div>
                  <span className="text-xs font-mono text-neutral-300 shrink-0">{next.progressLabel}</span>
                </div>
                <div className="h-1.5 rounded-full bg-black/60 overflow-hidden mt-2">
                  <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(4, next.progress * 100)}%`, backgroundColor: theme.primary }} />
                </div>
              </div>
            )}

            <ul className="grid grid-cols-2 gap-2">
              {list.map((a) => (
                <li
                  key={a.id}
                  className="rounded-2xl border p-2.5"
                  style={{
                    borderColor: a.unlocked ? theme.primary : '#1A1E26',
                    background: a.unlocked ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : 'rgba(0,0,0,0.35)',
                    opacity: a.unlocked ? 1 : 0.6,
                  }}
                >
                  <div className="flex items-center gap-1.5 text-xs font-bold text-white">
                    <Icon className="w-3.5 h-3.5 shrink-0" style={{ color: a.unlocked ? theme.primary : '#64748b' }} />
                    <span className="truncate">{a.title}</span>
                  </div>
                  <div className="text-xs text-[#9AA3B2] mt-0.5 leading-snug">{a.description}</div>
                  {a.unlocked ? (
                    <button onClick={() => onShare(a)} className="mt-1.5 text-xs font-bold flex items-center gap-1" style={{ color: 'var(--accent)' }}>
                      <Share2 className="w-3 h-3" /> Share
                    </button>
                  ) : (
                    <div className="text-xs font-mono text-neutral-400 mt-1.5">{a.progressLabel}</div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </>
  );
};
