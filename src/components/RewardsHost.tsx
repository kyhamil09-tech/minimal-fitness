import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Award as AwardIcon, Flame, Share2, Timer, X } from 'lucide-react';
import { FastingSession, WorkoutSession } from '../types/health';
import { Goals } from '../types/tracking';
import { Award, Encouragement, afterFast, computeRewards, newAwards } from '../lib/rewards';
import { announce, onEncouragement, readSeenAwards, writeSeenAwards } from '../lib/rewardsBus';
import { completedFasts } from '../lib/fasting';
import { haptic } from '../lib/haptics';
import { todayKey } from '../lib/dates';
import { StoryData, buildMilestoneStory } from '../lib/storyCards';
import { StoryShareModal } from './StoryShareModal';

interface Props {
  workouts: WorkoutSession[];
  fasts: FastingSession[];
  goals: Pick<Goals, 'weeklyWorkouts'>;
  /** Off until onboarding is done, so a brand new install is not greeted by badges. */
  enabled: boolean;
}

const CONFETTI = ['#FF5500', '#FF5A1F', '#7DD3FC', '#F9A8D4', '#FDE68A', '#86EFAC'];

/** Falling pieces behind the badge. Pure CSS; Reduce motion hides it (see .confetti in index.css). */
const Confetti: React.FC<{ count: number }> = ({ count }) => (
  <div className="confetti" aria-hidden="true">
    {Array.from({ length: count }, (_, i) => (
      <span
        key={i}
        style={{
          left: `${(i * 37) % 100}%`,
          background: CONFETTI[i % CONFETTI.length],
          animationDelay: `${(i % 9) * 0.12}s`,
          animationDuration: `${2.2 + (i % 5) * 0.35}s`,
          transform: `rotate(${(i * 53) % 360}deg)`,
        }}
      />
    ))}
  </div>
);

/**
 * The positive-reinforcement layer. It shows a small toast after a workout or fast (a warm line about something true), and a full
 * celebration the first time an award is earned. Awards already earned when the feature first runs are marked as seen without a
 * fanfare, so nobody gets a pile of badges at once.
 */
export const RewardsHost: React.FC<Props> = ({ workouts, fasts, goals, enabled }) => {
  const [toast, setToast] = useState<Encouragement | null>(null);
  const [party, setParty] = useState<{ main: Award; more: Award[] } | null>(null);
  const [story, setStory] = useState<StoryData | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const awards = useMemo(() => computeRewards({ workouts, fasts, goals, today: todayKey() }), [workouts, fasts, goals]);

  const show = (e: Encouragement) => {
    setToast(e);
    haptic[e.big ? 'celebrate' : 'success']();
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToast(null), e.big ? 6500 : 4200);
  };

  useEffect(() => onEncouragement(show), []);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  // A finished fast: a message, once per newly completed fast (the count at start-up is not "new").
  const doneCount = completedFasts(fasts).length;
  const lastDone = useRef<number | null>(null);
  useEffect(() => {
    if (!enabled) return;
    if (lastDone.current !== null && doneCount > lastDone.current) announce(afterFast(fasts, todayKey()));
    lastDone.current = doneCount;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doneCount, enabled]);

  // New awards.
  useEffect(() => {
    if (!enabled) return;
    const seen = readSeenAwards();
    const unlocked = awards.filter((a) => a.unlocked).map((a) => a.id);
    if (seen === null) {
      writeSeenAwards(unlocked);
      return;
    }
    const fresh = newAwards(awards, seen);
    if (fresh.length === 0) return;
    writeSeenAwards([...new Set([...seen, ...unlocked])]);
    // Wait a beat so the award does not land on top of the workout summary that earned it.
    const t = window.setTimeout(() => {
      setParty({ main: fresh[0], more: fresh.slice(1) });
      haptic.celebrate();
    }, 1400);
    return () => window.clearTimeout(t);
  }, [awards, enabled]);

  const Icon = party?.main.group === 'fasting' ? Timer : party?.main.group === 'weekly' ? AwardIcon : Flame;

  return (
    <>
      {toast && (
        <div className="fixed inset-x-0 top-0 z-[90] flex justify-center px-4 pointer-events-none" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
          <div
            role="status"
            className="pop-in pointer-events-auto max-w-sm w-full rounded-2xl border p-3.5 flex items-start gap-3 shadow-2xl"
            style={{ background: 'var(--card)', borderColor: 'var(--accent)', boxShadow: '0 8px 30px color-mix(in srgb, var(--accent) 30%, transparent)' }}
          >
            <span className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}>
              <Flame className="w-4.5 h-4.5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-extrabold text-white">{toast.title}</div>
              <div className="text-xs text-neutral-300 mt-0.5">{toast.body}</div>
            </div>
            <button onClick={() => setToast(null)} aria-label="Dismiss" className="text-neutral-400 shrink-0">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {party && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center p-6" style={{ background: 'rgba(0,0,0,0.72)' }} role="dialog" aria-modal="true" aria-label="Award unlocked">
          <Confetti count={party.main.tier >= 4 ? 46 : 28} />
          <div className="pop-in relative w-full max-w-xs rounded-[28px] border p-6 text-center" style={{ background: 'var(--card)', borderColor: 'var(--accent)' }}>
            <div className="text-xs font-extrabold tracking-[0.18em] uppercase" style={{ color: 'var(--accent)' }}>
              Award unlocked
            </div>
            <div
              className="mx-auto mt-4 w-24 h-24 rounded-full flex items-center justify-center"
              style={{ background: 'var(--accent)', color: 'var(--on-accent)', boxShadow: '0 0 40px color-mix(in srgb, var(--accent) 55%, transparent)' }}
            >
              <Icon className="w-11 h-11" strokeWidth={2.4} />
            </div>
            <div className="text-xl font-extrabold text-white mt-4">{party.main.title}</div>
            <div className="text-sm text-neutral-300 mt-1">{party.main.description}</div>
            {party.more.length > 0 && (
              <div className="text-xs text-neutral-400 mt-3">
                Also earned: {party.more.slice(0, 3).map((a) => a.title).join(', ')}
                {party.more.length > 3 ? ` and ${party.more.length - 3} more` : ''}
              </div>
            )}
            <div className="mt-5 grid gap-2">
              <button
                onClick={() => {
                  setStory(buildMilestoneStory(party.main));
                }}
                className="py-3 rounded-full text-sm font-extrabold flex items-center justify-center gap-1.5"
                style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
              >
                <Share2 className="w-4 h-4" /> Share this badge
              </button>
              <button onClick={() => setParty(null)} className="py-2.5 text-sm font-semibold text-neutral-300">
                Keep going
              </button>
            </div>
          </div>
        </div>
      )}
      {story && <StoryShareModal data={story} name="milestone" onClose={() => setStory(null)} />}
    </>
  );
};
