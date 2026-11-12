import React, { useMemo } from 'react';
import { BatteryCharging } from 'lucide-react';
import { WorkoutSession } from '../types/health';
import { recoveryAdvice } from '../lib/recovery';

const TONE = { good: '#5fd68a', neutral: '#7FB3FF', warn: '#FFB066', bad: '#ff6b6b' } as const;

/** One card after a session: how hard it was for you, and about how long until another hard one. */
export const RecoveryNote: React.FC<{ workout: WorkoutSession; all: WorkoutSession[] }> = ({ workout, all }) => {
  const advice = useMemo(() => recoveryAdvice(workout, all), [workout, all]);
  if (!advice) return null;
  return (
    <div className="mt-3 rounded-2xl glass-inset px-4 py-3 flex items-start gap-3" role="note" aria-label="Recovery">
      <BatteryCharging className="w-4 h-4 mt-0.5 shrink-0" style={{ color: TONE[advice.tone] }} />
      <div className="min-w-0">
        <div className="text-sm font-bold text-white">{advice.title}</div>
        <div className="text-xs text-neutral-400">{advice.message.replace(advice.title, '').replace(/^\s*/, '')}</div>
      </div>
    </div>
  );
};
