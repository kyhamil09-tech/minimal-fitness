import React from 'react';
import { ArrowDown, RefreshCw } from 'lucide-react';
import { PULL_TRIGGER, PullState } from '../hooks/usePullToRefresh';
import { useT } from '../lib/i18n';

interface PullIndicatorProps extends PullState {
  accent: string;
}

/** The little round badge that follows the finger while pulling down to refresh (see usePullToRefresh). */
export const PullIndicator: React.FC<PullIndicatorProps> = ({ pull, busy, accent }) => {
  const t = useT();
  if (pull <= 0 && !busy) return null;
  const ready = pull >= PULL_TRIGGER;
  return (
    <div
      className="pointer-events-none absolute left-1/2 top-2 z-20 -translate-x-1/2"
      style={{ transform: `translate(-50%, ${Math.max(0, pull - 36)}px)`, opacity: Math.min(1, pull / 36) }}
      role="status"
      aria-live="polite"
    >
      <div className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-[#14161B] shadow-lg" style={{ color: accent }}>
        {busy ? (
          <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <ArrowDown className="h-4 w-4 transition-transform" style={{ transform: ready ? 'rotate(180deg)' : 'none' }} aria-hidden="true" />
        )}
      </div>
      <span className="sr-only">{busy ? t('pull.busy') : ready ? t('pull.release') : t('pull.pull')}</span>
    </div>
  );
};
