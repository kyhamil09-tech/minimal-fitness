import React from 'react';
import { createPortal } from 'react-dom';
import { ChevronUp, Dumbbell } from 'lucide-react';
import { useLiftScheme } from './theme';
import { useT } from '../lib/i18n';

/**
 * The bar that stands in for a workout you have minimized: what you are on, the clock (or the rest countdown), and a tap to go back to
 * it. It floats above the bottom navigation of whichever side of the app you are in, so you can look at History or an exercise guide
 * without losing the workout.
 */
export const ResumeBar: React.FC<{ title: string; clock: string; paused: boolean; restText: string | null; onOpen: () => void }> = ({ title, clock, paused, restText, onOpen }) => {
  const scheme = useLiftScheme();
  const tr = useT();
  return createPortal(
    <div className="lift l-docked" data-scheme={scheme}>
      <button type="button" className="l-resume-bar" onClick={onOpen} aria-label={`Back to your workout, ${title}, ${paused ? 'paused' : restText ? `rest ${restText}` : clock}`}>
        <span className="l-resume-icon" aria-hidden="true">
          <Dumbbell className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1 text-left">
          <span className="block truncate text-sm font-bold">{title}</span>
          <span className="l-dim block text-xs tabular-nums">{paused ? `${tr('lift.wo.pausedShort')} · ${clock}` : restText ? tr('lift.wo.restTime', { time: restText }) : `${tr('lift.wo.inProgress')} · ${clock}`}</span>
        </span>
        <span className="flex items-center gap-1 text-sm font-bold" style={{ color: 'var(--l-accent)' }}>
          {tr('lift.wo.backTo')}
          <ChevronUp className="h-4 w-4" aria-hidden="true" />
        </span>
      </button>
    </div>,
    document.body
  );
};
