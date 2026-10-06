import React, { useEffect, useState } from 'react';
import { HardDrive } from 'lucide-react';
import { Row } from './ui/SettingsParts';
import { StorageUsage, biggestEntries, megabytes, storageUsage } from '../lib/storageHealth';

const NAMES: Record<string, string> = {
  workouts: 'workouts',
  food: 'food',
  sleep_logs: 'sleep',
  steps_samples: 'step history',
  hc_vitals: 'Health Connect readings',
  own_hr: 'watch heart rate',
  own_steps: 'watch steps',
};

/** How much of the phone's app storage is used, and what takes the most. A nearly full store makes saving fail. */
export const StorageRow: React.FC = () => {
  const [state, setState] = useState<{ usage: StorageUsage; top: { key: string; chars: number }[] } | null>(null);
  useEffect(() => {
    try {
      // Only entries that really take room are worth naming.
      setState({ usage: storageUsage(localStorage), top: biggestEntries(localStorage, 2).filter((t) => t.chars >= 100_000) });
    } catch {
      setState(null);
    }
  }, []);
  if (!state) return null;
  const { usage, top } = state;
  const pct = Math.min(100, Math.round(usage.fraction * 100));
  const color = usage.level === 'ok' ? 'var(--accent)' : usage.level === 'warn' ? '#FDD663' : '#F28B82';
  return (
    <Row
      icon={<HardDrive className="w-5 h-5 text-neutral-300" />}
      title="Storage"
      sub={
        <>
          {megabytes(usage.used)} of about {megabytes(usage.limit)} used ({pct}%)
          {top.length > 0 && ` · mostly ${top.map((t) => NAMES[t.key] ?? t.key.replace(/_/g, ' ')).join(' and ')}`}
          <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-white/10" role="img" aria-label={`${pct} percent of storage used`}>
            <span className="block h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
          </span>
          {usage.level !== 'ok' && <span className="mt-1.5 block" style={{ color }}>Running low: back up your data, then you can free space.</span>}
        </>
      }
    />
  );
};
