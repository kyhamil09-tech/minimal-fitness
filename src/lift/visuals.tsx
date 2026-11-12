import React from 'react';
import { MuscleGroup } from '../types/tracking';

/**
 * Small pictures for the Lift side: a tiny body with the worked muscle group lit (on every exercise row, so a list can be scanned by
 * eye), a progress ring, and the picture-and-sentence shown when a screen has nothing in it yet.
 */

type Part = 'chest' | 'shoulders' | 'arms' | 'core' | 'legs' | 'glutes' | 'back' | 'all' | 'cardio';

const PART: Record<string, Part> = {
  Chest: 'chest',
  Back: 'back',
  Shoulders: 'shoulders',
  Arms: 'arms',
  Legs: 'legs',
  Glutes: 'glutes',
  Core: 'core',
  'Full Body': 'all',
  'Warm-up': 'all',
  Cardio: 'cardio',
  Stretch: 'all',
};

/** A little body, front-on, with the group's area filled in the accent color. */
export const MuscleBadge: React.FC<{ group: MuscleGroup | string; size?: number }> = ({ group, size = 40 }) => {
  const part = PART[group] ?? 'all';
  const on = 'var(--l-accent)';
  const off = 'var(--l-dim)';
  const fill = (p: Part, extra?: Part) => (part === p || part === extra || part === 'all' ? on : off);
  const op = (p: Part, extra?: Part) => (part === p || part === extra || part === 'all' ? 1 : 0.38);
  return (
    <span className="l-badge" style={{ width: size, height: size }} aria-hidden="true">
      <svg viewBox="0 0 40 40" width={size * 0.8} height={size * 0.8}>
        <circle cx="20" cy="7" r="4" fill={off} opacity="0.38" />
        <rect x="13" y="12" width="14" height="15" rx="3.5" fill={fill('core', 'back')} opacity={op('core', 'back') * (part === 'chest' || part === 'shoulders' ? 0.38 : 1)} />
        {part === 'chest' && <rect x="13.5" y="12.5" width="13" height="6" rx="3" fill={on} />}
        {part === 'shoulders' && (
          <>
            <circle cx="10.5" cy="13.5" r="3.4" fill={on} />
            <circle cx="29.5" cy="13.5" r="3.4" fill={on} />
          </>
        )}
        {part === 'core' && <rect x="16" y="19" width="8" height="8" rx="2.5" fill={on} />}
        <rect x="7.5" y="13" width="4" height="13" rx="2" fill={fill('arms')} opacity={op('arms')} />
        <rect x="28.5" y="13" width="4" height="13" rx="2" fill={fill('arms')} opacity={op('arms')} />
        <rect x="14" y="28" width="5.2" height="11" rx="2.4" fill={fill('legs')} opacity={op('legs')} />
        <rect x="20.8" y="28" width="5.2" height="11" rx="2.4" fill={fill('legs')} opacity={op('legs')} />
        {part === 'glutes' && <rect x="13.5" y="24" width="13" height="6" rx="3" fill={on} />}
        {part === 'cardio' && <path d="M8 22h6l2-6 4 12 3-9 2 3h7" fill="none" stroke={on} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />}
      </svg>
    </span>
  );
};

/** A ring that fills as `value` approaches `goal`, with whatever you put inside in the middle. */
export const ProgressRing: React.FC<{ value: number; goal: number; size?: number; stroke?: number; label: string; children?: React.ReactNode }> = ({ value, goal, size = 88, stroke = 9, label, children }) => {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const frac = goal > 0 ? Math.max(0, Math.min(1, value / goal)) : 0;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--l-s2)" strokeWidth={stroke} />
        <circle
          className="l-ring-arc"
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--l-accent)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${c * frac} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ ['--ring-full' as string]: `${c}` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  );
};

/**
 * The rest countdown as a ring that empties second by second, with the time in the middle. In the last five seconds it throbs and
 * turns to the warning color, so you can see it from across the gym.
 */
export const RestRing: React.FC<{ left: number; total: number; size?: number; label: string; children: React.ReactNode }> = ({ left, total, size = 84, label, children }) => {
  const stroke = 7;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const frac = Math.max(0, Math.min(1, left / Math.max(1, total)));
  const low = left <= 5;
  return (
    <div className={`relative shrink-0 ${low ? 'l-rest-low' : ''}`} style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--l-s2)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={low ? 'var(--l-fail)' : 'var(--l-accent)'}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${c * frac} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dasharray 1s linear, stroke 0.3s' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  );
};

/** What a screen shows when there is nothing in it yet: a picture, a sentence, and (optionally) the one thing to do. */
export const EmptyState: React.FC<{ icon: React.ReactNode; title: string; text: string; action?: React.ReactNode }> = ({ icon, title, text, action }) => (
  <div className="l-empty">
    <span className="soft-float flex h-16 w-16 items-center justify-center rounded-full" style={{ background: 'var(--l-s2)', color: 'var(--l-accent)', boxShadow: '0 0 0 8px var(--l-s1)' }} aria-hidden="true">
      {icon}
    </span>
    <p className="mt-4 text-base font-bold">{title}</p>
    <p className="l-dim mx-auto mt-1 max-w-xs text-sm leading-snug">{text}</p>
    {action && <div className="mt-4">{action}</div>}
  </div>
);
