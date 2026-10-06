import React, { useEffect, useRef, useState } from 'react';
import { Home, Activity, HeartPulse, BarChart3, User, Star } from 'lucide-react';
import { TabId } from '../types/health';
import { ColorPalette } from '../types/theme';
import { DayProgress, dayProgressText } from '../lib/dayProgress';

interface BottomNavBarProps {
  currentTab: TabId;
  onSelectTab: (tab: TabId) => void;
  theme: ColorPalette;
  /** Today's three quests, drawn as a ring around the Home icon. */
  progress?: DayProgress;
}

const RING_R = 15;
const RING = 2 * Math.PI * RING_R;
const SPARKS = [0, 60, 120, 180, 240, 300];

/** True while a text box has focus, which is when the on-screen keyboard is up and the bar would only be in the way. */
const useTyping = (): boolean => {
  const [typing, setTyping] = useState(false);
  useEffect(() => {
    const textLike = (el: EventTarget | null) => {
      if (!(el instanceof HTMLElement)) return false;
      if (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable) return true;
      if (el.tagName !== 'INPUT') return false;
      const type = (el as HTMLInputElement).type;
      return !['checkbox', 'radio', 'range', 'button', 'submit', 'color', 'file'].includes(type);
    };
    const on = (e: FocusEvent) => textLike(e.target) && setTyping(true);
    const off = () => setTyping(false);
    document.addEventListener('focusin', on);
    document.addEventListener('focusout', off);
    return () => {
      document.removeEventListener('focusin', on);
      document.removeEventListener('focusout', off);
    };
  }, []);
  return typing;
};

/**
 * A floating pill with a slow sheen across the glass. It stays put on every screen and only steps aside while you type. The
 * selected tab gets a highlight that slides across with a little overshoot, a popping icon and a burst of sparks. The Home icon
 * wears a ring that fills as you finish today's goals, and bursts when all three are done.
 */
export const BottomNavBar: React.FC<BottomNavBarProps> = ({ currentTab, onSelectTab, theme, progress }) => {
  const typing = useTyping();
  const tabs: { id: TabId; label: string; icon: React.ElementType }[] = [
    { id: 'today', label: 'Home', icon: Home },
    { id: 'exercise', label: 'Run', icon: Activity },
    { id: 'nutrition', label: 'Health', icon: HeartPulse },
    { id: 'progress', label: 'Progress', icon: BarChart3 },
    { id: 'settings', label: 'You', icon: User },
  ];
  const activeIndex = tabs.findIndex(
    (tab) =>
      currentTab === tab.id ||
      (tab.id === 'nutrition' && (currentTab === 'fasting' || currentTab === 'sleep' || currentTab === 'healthlog')) ||
      (tab.id === 'progress' && currentTab === 'health')
  );

  // The pop and the burst run when a tab is chosen, not when the app first draws.
  const [popKey, setPopKey] = useState(0);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setPopKey((k) => k + 1);
  }, [activeIndex]);

  // Finishing the last of today's goals while the app is open sets off a celebration on the Home icon.
  const done = progress?.done ?? 0;
  const prevDone = useRef(done);
  const [celebrate, setCelebrate] = useState(0);
  useEffect(() => {
    if (prevDone.current < 3 && done === 3) setCelebrate((c) => c + 1);
    prevDone.current = done;
  }, [done]);

  if (typing) return null;

  return (
    <nav aria-label="Main" className="relative shrink-0 z-0 w-full px-4 pt-1" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), var(--sys-gesture-bottom, 0px), 12px)' }}>
      <div className="pill-nav relative mx-auto grid w-full max-w-md grid-cols-5 items-stretch rounded-full p-1.5">
        {/* The highlight behind the chosen tab */}
        {activeIndex >= 0 && (
          <span aria-hidden="true" className="pill-thumb" style={{ transform: `translateX(${activeIndex * 100}%)` }} />
        )}
        {tabs.map((tab, i) => {
          const Icon = tab.icon;
          const isActive = i === activeIndex;
          const isHome = tab.id === 'today';
          const ring = isHome && progress ? progress : null;
          return (
            <button
              key={tab.id}
              onClick={() => onSelectTab(tab.id)}
              aria-label={tab.label}
              aria-current={isActive ? 'page' : undefined}
              title={ring ? dayProgressText(ring) : tab.label}
              className="relative z-[1] flex min-h-[54px] flex-col items-center justify-center gap-0.5 rounded-full"
              style={{ color: isActive ? theme.primary : '#8a8a8a' }}
            >
              <span className="relative flex h-[34px] w-[34px] items-center justify-center">
                {ring && (
                  <svg className="absolute inset-0 -rotate-90" viewBox="0 0 34 34" aria-hidden="true">
                    <circle cx="17" cy="17" r={RING_R} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="2.5" />
                    <circle
                      cx="17"
                      cy="17"
                      r={RING_R}
                      fill="none"
                      stroke={ring.done === 3 ? theme.secondary : theme.primary}
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeDasharray={RING}
                      strokeDashoffset={RING * (1 - ring.fraction)}
                      style={{ transition: 'stroke-dashoffset 0.7s cubic-bezier(0.34, 1.2, 0.64, 1), stroke 0.3s' }}
                    />
                  </svg>
                )}
                <span key={isActive ? `on-${popKey}` : 'off'} className={isActive ? 'nav-pop' : undefined}>
                  <Icon className="h-[21px] w-[21px]" strokeWidth={isActive ? 2.6 : 1.9} />
                </span>
                {isActive && popKey > 0 && (
                  <span key={`burst-${popKey}`} aria-hidden="true" className="nav-burst" style={{ ['--burst' as string]: theme.primary }}>
                    {SPARKS.map((a) => (
                      <i key={a} style={{ ['--a' as string]: `${a}deg` }} />
                    ))}
                  </span>
                )}
                {isHome && ring && ring.done === 3 && (
                  <Star
                    aria-hidden="true"
                    className="absolute -right-1 -top-1 h-3.5 w-3.5"
                    style={{ color: theme.secondary, fill: theme.secondary }}
                  />
                )}
                {isHome && celebrate > 0 && (
                  <span key={`party-${celebrate}`} aria-hidden="true" className="nav-burst nav-burst-big" style={{ ['--burst' as string]: theme.secondary }}>
                    {SPARKS.map((a) => (
                      <i key={a} style={{ ['--a' as string]: `${a}deg` }} />
                    ))}
                  </span>
                )}
              </span>
              <span className="text-[9px] font-extrabold uppercase leading-none" style={{ letterSpacing: '0.1em' }}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
