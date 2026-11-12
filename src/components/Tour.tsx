import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, BarChart3, Bell, Check, Dumbbell, Footprints, Home, Palette, Salad, ShieldCheck, Sparkles, Timer, Watch, Wind, X } from 'lucide-react';
import { TOUR, TourGo, TourStep } from '../lib/tour';

const ICONS: Record<TourStep['icon'], React.ElementType> = {
  sparkles: Sparkles,
  home: Home,
  run: Footprints,
  lift: Dumbbell,
  chart: BarChart3,
  eat: Salad,
  fasting: Timer,
  breathe: Wind,
  watch: Watch,
  palette: Palette,
  shield: ShieldCheck,
};

/**
 * The app tour: one stop at a time, each with a badge, a few plain lines and (where it helps) a button that takes you there. It shows
 * once after the first setup, and can be replayed from Settings. Skipping or finishing marks it as seen.
 */
export const Tour: React.FC<{
  onClose: () => void;
  onGo: (to: TourGo) => void;
  onAllowNotifications: () => Promise<void>;
}> = ({ onClose, onGo, onAllowNotifications }) => {
  const [i, setI] = useState(0);
  const [dir, setDir] = useState<1 | -1>(1);
  const [asked, setAsked] = useState(false);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const step = TOUR[i];
  const last = i === TOUR.length - 1;
  const Icon = ICONS[step.icon];

  const go = (n: number) => {
    if (n < 0 || n >= TOUR.length) return;
    setDir(n > i ? 1 : -1);
    setI(n);
  };

  // Each stop is announced by moving focus to its title.
  useEffect(() => {
    titleRef.current?.focus({ preventScroll: true });
  }, [i]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') go(i + 1);
      else if (e.key === 'ArrowLeft') go(i - 1);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i]);

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="tr-title" className="tr-root">
      <div className="tr-top">
        <span className="tr-count" aria-live="polite">
          {i + 1} of {TOUR.length}
        </span>
        <button type="button" className="tr-skip" onClick={onClose}>
          {last ? 'Close' : 'Skip tour'} <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div className="tr-body">
        <div key={step.id} className="tr-step" data-dir={dir} style={{ ['--tr-c' as string]: step.color }}>
          <div className="tr-badge" aria-hidden="true">
            <span className="tr-ring tr-ring-a" />
            <span className="tr-ring tr-ring-b" />
            <Icon className="tr-icon" />
          </div>
          <h2 id="tr-title" ref={titleRef} tabIndex={-1} className="tr-title">
            {step.title}
          </h2>
          <p className="tr-lead">{step.lead}</p>
          <ul className="tr-list">
            {step.bullets.map((b, n) => (
              <li key={b} style={{ animationDelay: `${0.12 + n * 0.09}s` }}>
                <Check className="tr-tick" aria-hidden="true" />
                <span>{b}</span>
              </li>
            ))}
          </ul>
          <div className="tr-actions">
            {step.asks === 'notifications' && (
              <button
                type="button"
                className="tr-secondary"
                disabled={asked}
                onClick={() => {
                  setAsked(true);
                  void onAllowNotifications();
                }}
              >
                <Bell className="h-4 w-4" aria-hidden="true" /> {asked ? 'Asked. Choose in the box that appeared' : 'Allow reminders now'}
              </button>
            )}
            {step.go && (
              <button type="button" className="tr-secondary" onClick={() => onGo(step.go!.to)}>
                {step.go.label} <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="tr-bottom">
        <div className="tr-dots" role="group" aria-label="Tour progress">
          {TOUR.map((s, n) => (
            <button key={s.id} type="button" className="tr-dot" data-on={n === i} data-done={n < i} onClick={() => go(n)} aria-label={`Go to ${s.title}`} aria-current={n === i ? 'step' : undefined} />
          ))}
        </div>
        <div className="tr-nav">
          <button type="button" className="tr-back" onClick={() => go(i - 1)} disabled={i === 0} aria-label="Previous stop">
            <ArrowLeft className="h-5 w-5" aria-hidden="true" />
          </button>
          <button type="button" className="tr-next" onClick={() => (last ? onClose() : go(i + 1))}>
            {last ? 'Start using the app' : 'Next'} {!last && <ArrowRight className="h-5 w-5" aria-hidden="true" />}
          </button>
        </div>
      </div>
    </div>
  );
};
