import React, { useEffect, useState } from 'react';
import { Play, Square, Timer } from 'lucide-react';
import { ColorPalette } from '../types/theme';
import { FastingSession } from '../types/health';

interface FastQuickProps {
  theme: ColorPalette;
  sessions: FastingSession[];
  onStart: (opts: { targetHours: number; protocolName: string }) => void;
  onEnd: () => void;
}

/** The protocol you used last time, or 16:8 for a first fast. */
export const lastProtocol = (sessions: FastingSession[]): { targetHours: number; protocolName: string } => {
  const last = sessions.filter((s) => s.isCompleted).sort((a, b) => b.startTimestamp - a.startTimestamp)[0];
  return last ? { targetHours: last.targetDurationHours, protocolName: last.fastProtocolName } : { targetHours: 16, protocolName: '16:8 Standard' };
};

/**
 * One tap to start the fast you usually do, or to end the one that is running, from anywhere in Health. The full timer, the stages and
 * the protocol picker are still on the Fasting card.
 */
export const FastQuick: React.FC<FastQuickProps> = ({ theme, sessions, onStart, onEnd }) => {
  const active = sessions.find((s) => !s.isCompleted);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!active) return undefined;
    const id = window.setInterval(() => tick((n) => n + 1), 30_000);
    return () => window.clearInterval(id);
  }, [active]);
  const usual = lastProtocol(sessions);
  const elapsed = active ? Math.max(0, (Date.now() - active.startTimestamp) / 3_600_000) : 0;
  const h = Math.floor(elapsed);
  const m = Math.floor((elapsed - h) * 60);
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border px-4 py-2.5" style={{ backgroundColor: theme.surface, borderColor: theme.surfaceBorder }}>
      <div className="flex min-w-0 items-center gap-2.5">
        <Timer className="h-4 w-4 shrink-0" style={{ color: '#FCAD70' }} aria-hidden="true" />
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-white">{active ? `Fasting ${h}h ${m}m` : `${usual.protocolName.split(' ')[0]} fast`}</div>
          <div className="truncate text-xs text-[#9AA3B2]">{active ? `of ${active.targetDurationHours}h, ${active.fastProtocolName}` : 'The one you used last'}</div>
        </div>
      </div>
      <button
        type="button"
        onClick={() => (active ? onEnd() : onStart(usual))}
        className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border px-4 text-sm font-bold"
        style={active ? { borderColor: 'var(--hairline-strong)', color: 'var(--ink)' } : { backgroundColor: theme.primary, borderColor: theme.primary, color: 'var(--on-accent, #14130F)' }}
        aria-label={active ? 'End the fast' : `Start a ${usual.protocolName} fast now`}
      >
        {active ? <Square className="h-3.5 w-3.5" aria-hidden="true" /> : <Play className="h-3.5 w-3.5" aria-hidden="true" />}
        {active ? 'End fast' : 'Start now'}
      </button>
    </div>
  );
};
