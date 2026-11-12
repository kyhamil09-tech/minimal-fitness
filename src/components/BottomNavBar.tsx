import React, { useEffect, useRef, useState } from 'react';
import { Home, Activity, HeartPulse, BarChart3, User, Star } from 'lucide-react';
import { TabId } from '../types/health';
import { ColorPalette } from '../types/theme';
import { DayProgress, dayProgressText } from '../lib/dayProgress';
import { useT } from '../lib/i18n';

interface BottomNavBarProps {
  currentTab: TabId;
  onSelectTab: (tab: TabId) => void;
  theme: ColorPalette;
  /** Today's three quests, drawn as a ring around the Home icon. */
  progress?: DayProgress;
}

const RING_R = 15;
const RING = 2 * Math.PI * RING_R;

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
 * A flat bar docked to the bottom: five tabs with an icon and a short label, the chosen one in the accent color with a bar on top.
 * It stays put on every screen and only steps aside while you type. The Home icon wears a ring that fills as you finish today's
 * goals, and a star when all three are done.
 */
export const BottomNavBar: React.FC<BottomNavBarProps> = ({ currentTab, onSelectTab, theme, progress }) => {
  const typing = useTyping();
  const t = useT();
  const tabs: { id: TabId; label: string; icon: React.ElementType }[] = [
    { id: 'today', label: t('nav.home'), icon: Home },
    { id: 'exercise', label: t('nav.run'), icon: Activity },
    { id: 'nutrition', label: t('nav.health'), icon: HeartPulse },
    { id: 'progress', label: t('nav.progress'), icon: BarChart3 },
    { id: 'settings', label: t('nav.you'), icon: User },
  ];
  const activeIndex = tabs.findIndex(
    (tab) =>
      currentTab === tab.id ||
      (tab.id === 'nutrition' && (currentTab === 'fasting' || currentTab === 'sleep' || currentTab === 'healthlog' || currentTab === 'breathe')) ||
      (tab.id === 'progress' && currentTab === 'health')
  );
  const prevDone = useRef(progress?.done ?? 0);
  useEffect(() => {
    prevDone.current = progress?.done ?? 0;
  }, [progress?.done]);

  if (typing) return null;

  return (
    <div className="nav-dock">
      <nav aria-label="Main" className="flat-nav pill-nav-wrap grid w-full grid-cols-5">
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
              className="relative flex min-h-[58px] flex-col items-center justify-center gap-0.5"
              style={{ color: isActive ? theme.primary : '#A1A1AA' }}
            >
              <span className="relative flex h-[30px] w-[30px] items-center justify-center">
                {ring && (
                  <svg className="absolute inset-0 -rotate-90" viewBox="0 0 34 34" aria-hidden="true">
                    <circle cx="17" cy="17" r={RING_R} fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth="2.5" />
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
                      style={{ transition: 'stroke-dashoffset 0.7s cubic-bezier(0.22, 1, 0.36, 1), stroke 0.3s' }}
                    />
                  </svg>
                )}
                <Icon className="h-[21px] w-[21px]" strokeWidth={isActive ? 2.4 : 1.9} />
                {isHome && ring && ring.done === 3 && <Star aria-hidden="true" className="absolute -right-1 -top-1 h-3.5 w-3.5" style={{ color: theme.secondary, fill: theme.secondary }} />}
              </span>
              <span className="max-w-full px-0.5 text-[11px] font-extrabold uppercase leading-none" style={{ letterSpacing: '0.06em' }}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
};
