import React, { useMemo, useState } from 'react';
import { Share2, Trophy } from 'lucide-react';
import { WorkoutSession } from '../types/health';
import { UnitSystem } from '../types/tracking';
import { ColorPalette } from '../types/theme';
import { BestGroup, BestRecord, allBests, isRecent } from '../lib/bestRecords';
import { shortMonthDay, toDateKey } from '../lib/dates';
import { StoryData } from '../lib/storyCards';
import { EmptyState } from './ui/charts';

interface Props {
  theme: ColorPalette;
  workouts: WorkoutSession[];
  units: UnitSystem;
  onShare: (data: StoryData) => void;
}

const TABS: { id: BestGroup | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'run', label: 'Running' },
  { id: 'ride', label: 'Riding' },
  { id: 'move', label: 'Walk & row' },
  { id: 'lift', label: 'Lifts' },
];

const storyFor = (r: BestRecord): StoryData => ({
  kind: 'milestone',
  eyebrow: 'PERSONAL BEST',
  title: r.label,
  subtitle: r.sub,
  big: r.big,
  unit: r.unit,
  date: r.at ? new Date(r.at).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }) : '',
});

/** Your best efforts across running, riding, walking, rowing and lifting, each shareable as a card. */
export const BestsPanel: React.FC<Props> = ({ theme, workouts, units, onShare }) => {
  const [tab, setTab] = useState<BestGroup | 'all'>('all');
  const all = useMemo(() => allBests(workouts, units), [workouts, units]);
  const list = tab === 'all' ? all : all.filter((r) => r.group === tab);
  const fresh = all.filter((r) => isRecent(r)).length;

  return (
    <section className="rounded-3xl border p-4 space-y-3" style={{ backgroundColor: theme.surface, borderColor: theme.surfaceBorder }}>
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[#7E889B] flex items-center gap-1.5">
          <Trophy className="w-3.5 h-3.5 text-amber-300" /> Best efforts
        </h3>
        {fresh > 0 && <span className="text-[11px] font-bold" style={{ color: theme.primary }}>{fresh} new in 14 days</span>}
      </div>
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar" role="tablist" aria-label="Record type">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className="px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap border"
            style={{ background: tab === t.id ? theme.primary : 'transparent', color: tab === t.id ? 'var(--on-accent)' : '#9aa3b2', borderColor: tab === t.id ? 'transparent' : '#1A1E26' }}
          >
            {t.label}
          </button>
        ))}
      </div>
      {list.length === 0 ? (
        <EmptyState title="Nothing here yet" hint="Records appear on their own as you log runs, rides and lifts." />
      ) : (
        <ul className="divide-y divide-[#1A1E26]">
          {list.map((r) => (
            <li key={r.id} className="py-2.5 flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-white truncate flex items-center gap-1.5">
                  {r.label}
                  {r.estimated && (
                    <span title="From a distance and time without a GPS track" className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full border border-[#2A3040] text-neutral-400">
                      Logged
                    </span>
                  )}
                  {isRecent(r) && (
                    <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded-full" style={{ background: theme.primary, color: 'var(--on-accent)' }}>
                      New
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-neutral-500">
                  {r.sub}
                  {r.at > 0 ? ` · ${shortMonthDay(toDateKey(r.at))}` : ''}
                </div>
              </div>
              <div className="text-sm font-bold font-mono tabular-nums" style={{ color: theme.primary }}>
                {r.value}
              </div>
              <button onClick={() => onShare(storyFor(r))} aria-label={`Share ${r.label}`} className="p-1.5 text-neutral-400 hover:text-white">
                <Share2 className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};
