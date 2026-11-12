import React, { useState } from 'react';
import { Bell, ChevronRight, Play } from 'lucide-react';
import { GUIDED, GuidedSession } from './guided';
import { SectionTitle } from './ui';

const SILENT_MINUTES = [5, 10, 15, 20, 30] as const;

/** Sit tab: a silent timer with bells, and the guided sessions. */
export const Meditate: React.FC<{ onSilent: (minutes: number) => void; onGuided: (g: GuidedSession) => void }> = ({ onSilent, onGuided }) => {
  const [minutes, setMinutes] = useState<number>(10);
  return (
    <div className="br-scroll">
      <h1 className="br-h1 mt-3">Meditate</h1>
      <p className="br-dim mt-1 text-sm">A quiet sit, or a guided one. No breathing pattern to follow.</p>

      <section className="br-card mt-5" aria-label="Silent timer">
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5" style={{ color: 'var(--br-hue)' }} aria-hidden="true" />
          <h2 className="br-h2">Silent timer</h2>
        </div>
        <p className="br-dim mt-1 text-xs leading-relaxed">A bell to begin and a bell to end. Choose a bell during the sit, a soft background sound and a black screen when you start.</p>
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Length">
          {SILENT_MINUTES.map((m) => (
            <button key={m} type="button" className="br-chip" aria-pressed={minutes === m} onClick={() => setMinutes(m)}>
              {m} min
            </button>
          ))}
        </div>
        <button type="button" className="br-btn mt-4 w-full" onClick={() => onSilent(minutes)}>
          <Play className="h-5 w-5" aria-hidden="true" /> Start · {minutes} min
        </button>
      </section>

      <SectionTitle>Guided</SectionTitle>
      <ul className="space-y-2.5">
        {GUIDED.map((g) => (
          <li key={g.id}>
            <button type="button" className="br-card br-row w-full text-left" style={{ ['--row-hue' as string]: g.hue }} onClick={() => onGuided(g)} aria-label={`${g.title}, ${g.minutes} minutes. ${g.line}`}>
              <span className="h-12 w-12 shrink-0 rounded-full" style={{ background: `radial-gradient(circle at 38% 32%, ${g.hue}, ${g.hue}44 70%)`, boxShadow: `0 0 22px ${g.hue}44` }} aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block text-base font-bold">{g.title}</span>
                <span className="br-dim mt-0.5 block text-xs leading-relaxed">{g.line}</span>
                <span className="mt-1.5 block text-xs font-semibold" style={{ color: g.hue }}>
                  {g.minutes} min
                </span>
              </span>
              <ChevronRight className="h-5 w-5 shrink-0 opacity-60" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
      <p className="br-dim mt-5 px-1 text-xs leading-relaxed">Guided sessions are read in the phone's own voice when you turn Voice on, and shown on the screen as they go. They are for relaxation, not treatment.</p>
      <div className="h-4" />
    </div>
  );
};
