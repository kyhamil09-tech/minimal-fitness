import React, { useEffect, useRef, useState } from 'react';
import { HUNGER_TIPS, REFEED, STOP_RULES, VERDICTS, Verdict, WHAT_BREAKS, refeedFor } from './content';
import { useNow } from './ui';

/** Does it break a fast? Every drink and food with a verdict and a line of why, with a filter. */
export const WhatBreaksList: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const [filter, setFilter] = useState<Verdict | 'all'>('all');
  const list = WHAT_BREAKS.filter((w) => filter === 'all' || w.verdict === filter);
  return (
    <div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Show">
        <button type="button" className="fa-chip" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>
          All
        </button>
        {(['fine', 'depends', 'breaks'] as Verdict[]).map((v) => (
          <button key={v} type="button" className="fa-chip" aria-pressed={filter === v} onClick={() => setFilter(v)}>
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: VERDICTS[v].color }} aria-hidden="true" />
            {VERDICTS[v].label}
          </button>
        ))}
      </div>
      <ul className={`mt-3 ${compact ? 'space-y-1.5' : 'space-y-2'}`}>
        {list.map((w) => (
          <li key={w.id} className="fa-card !p-3">
            <div className="flex items-start justify-between gap-3">
              <span className="text-sm font-bold leading-snug">{w.label}</span>
              <span className="fa-tag shrink-0" style={{ color: VERDICTS[w.verdict].color, borderColor: `${VERDICTS[w.verdict].color}66` }}>
                {VERDICTS[w.verdict].label}
              </span>
            </div>
            <p className="fa-dim mt-1 text-xs leading-relaxed">{w.note}</p>
          </li>
        ))}
      </ul>
    </div>
  );
};

/** How to break a fast of a given length: the first steps in order, what to leave until later, and a note of care for the long ones. */
export const RefeedGuide: React.FC<{ hours: number; onHours?: (h: number) => void }> = ({ hours, onHours }) => {
  const g = refeedFor(hours);
  return (
    <div>
      {onHours && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="How long was the fast">
          {REFEED.map((r) => (
            <button key={r.id} type="button" className="fa-chip" aria-pressed={r.id === g.id} onClick={() => onHours(r.minHours + 0.01)}>
              {r.label}
            </button>
          ))}
        </div>
      )}
      <ol className={`${onHours ? 'mt-3' : ''} space-y-2`}>
        {g.steps.map((s, i) => (
          <li key={s.title} className="fa-card flex gap-3 !p-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold" style={{ background: 'color-mix(in srgb, var(--fa-hue) 25%, transparent)', color: 'var(--fa-hue)' }}>
              {i + 1}
            </span>
            <span>
              <span className="block text-sm font-bold">{s.title}</span>
              <span className="fa-dim block text-xs leading-relaxed">{s.text}</span>
            </span>
          </li>
        ))}
      </ol>
      <div className="mt-3">
        <div className="fa-eyebrow">Go easy on</div>
        <ul className="fa-dim mt-1 list-disc space-y-0.5 pl-5 text-sm">
          {g.avoid.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      </div>
      {g.care && <p className="fa-note mt-3 text-sm leading-relaxed">{g.care}</p>}
    </div>
  );
};

/** The stop rules: when to end a fast now, and what to do. */
export const StopRules: React.FC = () => (
  <div>
    <div className="fa-note">
      <div className="text-sm font-bold">End your fast and get help if you have</div>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
        {STOP_RULES.stopNow.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ul>
    </div>
    <p className="mt-3 text-sm leading-relaxed">{STOP_RULES.action}</p>
  </div>
);

const WAVE_SECONDS = 600;

/**
 * A ten-minute pause for a wave of hunger: a slow circle to breathe with and a tip each minute and a half. Hunger often rises and
 * falls on its own in that time. Afterwards you say whether you rode it out, and it is kept with the fast.
 */
export const HungerSurf: React.FC<{ onResult: (rode: boolean) => void }> = ({ onResult }) => {
  const started = useRef(Date.now());
  const now = useNow(1000);
  const left = Math.max(0, WAVE_SECONDS - Math.floor((now - started.current) / 1000));
  const tip = HUNGER_TIPS[Math.min(HUNGER_TIPS.length - 1, Math.floor((WAVE_SECONDS - left) / 100))];
  const [shown, setShown] = useState(tip);
  useEffect(() => setShown(tip), [tip]);
  const mm = Math.floor(left / 60);
  const ss = String(left % 60).padStart(2, '0');
  return (
    <div className="text-center">
      <div className="relative mx-auto my-4 flex h-44 w-44 items-center justify-center">
        <div data-pulse className="absolute inset-0 rounded-full" style={{ background: 'radial-gradient(circle, color-mix(in srgb, var(--fa-hue) 55%, transparent), transparent 70%)', animation: 'fa-pulse 6s ease-in-out infinite' }} aria-hidden="true" />
        <div className="fa-serif relative text-4xl" aria-live="off">
          {mm}:{ss}
        </div>
      </div>
      <p className="mx-auto min-h-[3.5rem] max-w-xs text-sm leading-relaxed" aria-live="polite">
        {left === 0 ? 'Ten minutes are up. How is the hunger now?' : shown}
      </p>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button type="button" className="fa-btn fa-btn-small" onClick={() => onResult(true)}>
          I rode it out
        </button>
        <button type="button" className="fa-btn fa-btn-small fa-btn-quiet" onClick={() => onResult(false)}>
          I ate
        </button>
      </div>
    </div>
  );
};
