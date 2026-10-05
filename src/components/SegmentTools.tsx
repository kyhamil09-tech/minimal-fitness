import React, { useMemo, useState } from 'react';
import { Flag, Trash2, Trophy } from 'lucide-react';
import { WorkoutSession } from '../types/health';
import { UnitSystem } from '../types/tracking';
import { ColorPalette } from '../types/theme';
import { SEGMENT_SPORTS, Segment, SegmentSport, segmentEfforts, segmentFromTrack, standingsFor } from '../lib/segments';
import { useSegments } from '../hooks/useSegments';
import { formatDuration } from '../lib/workoutStats';
import { shortMonthDay, toDateKey } from '../lib/dates';
import { distanceUnit, kmToDisplay } from '../lib/units';

const sportOf = (w: WorkoutSession): SegmentSport | null =>
  w.type === 'Running' || w.type === 'Treadmill' ? 'Running' : w.type === 'Cycling' ? 'Cycling' : w.type === 'Walking' ? 'Walking' : w.type === 'Hiking' ? 'Hiking' : null;

const ordinal = (n: number) => (n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`);

/** On a finished workout: where it ranks on the segments it passes through, and a way to mark a new segment on its track. */
export const SegmentsOnWorkout: React.FC<{ workout: WorkoutSession; all: WorkoutSession[]; units: UnitSystem; theme: Pick<ColorPalette, 'primary'> }> = ({ workout, all, units, theme }) => {
  const [segs, setSegs] = useSegments();
  const track = workout.track;
  const total = track && track.length > 1 ? track[track.length - 1].d : 0;
  const sport = sportOf(workout);
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(0);
  const [to, setTo] = useState(0);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const standings = useMemo(() => standingsFor(all, workout, segs), [all, workout, segs]);

  if (!track || total < 0.3 || !sport) return null;
  const du = distanceUnit(units);

  const create = () => {
    const seg = segmentFromTrack(track, from, to || total, name, sport);
    if (!seg) return setError('Pick a stretch of at least 100 m.');
    setSegs([...segs, seg]);
    setOpen(false);
    setName('');
    setError('');
  };

  return (
    <section className="mt-4 rounded-2xl glass-inset p-3.5 space-y-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-bold text-white">
          <Flag className="w-4 h-4" style={{ color: theme.primary }} /> Segments
        </div>
        <button onClick={() => { setOpen((o) => !o); setFrom(0); setTo(Math.round(total * 100) / 100); }} className="text-[11px] font-bold" style={{ color: theme.primary }}>
          {open ? 'Cancel' : 'Mark a segment'}
        </button>
      </div>

      {standings.length === 0 && !open && <p className="text-[11px] text-neutral-400">Mark a hill or any stretch of this {workout.type.toLowerCase()}. Every time you pass it again you get a time and a rank against your own efforts.</p>}

      {standings.map(({ seg, effort, of, best }) => (
        <div key={seg.id} className="flex items-center gap-2 text-xs">
          <Trophy className="w-3.5 h-3.5 shrink-0" style={{ color: effort.rank === 1 ? '#FCD34D' : '#9CA3AF' }} />
          <span className="text-neutral-200 flex-1 min-w-0 truncate">{seg.name}</span>
          <span className="font-mono text-white">{formatDuration(effort.seconds)}</span>
          <span className="text-neutral-400 w-24 text-right">
            {effort.rank === 1 ? `best of ${of}` : `${ordinal(effort.rank)} of ${of}, +${formatDuration(effort.seconds - best.seconds)}`}
          </span>
        </div>
      ))}

      {open && (
        <div className="space-y-2 pt-1">
          <label className="block text-[11px] text-neutral-400">
            Starts at {kmToDisplay(from, units, 2)} {du}
            <input type="range" min={0} max={total} step={0.05} value={from} onChange={(e) => setFrom(Math.min(Number(e.target.value), (to || total) - 0.1))} className="w-full" aria-label="Segment start" />
          </label>
          <label className="block text-[11px] text-neutral-400">
            Ends at {kmToDisplay(to || total, units, 2)} {du} ({kmToDisplay(Math.max(0, (to || total) - from), units, 2)} {du} long)
            <input type="range" min={0} max={total} step={0.05} value={to || total} onChange={(e) => setTo(Math.max(Number(e.target.value), from + 0.1))} className="w-full" aria-label="Segment end" />
          </label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name, e.g. River Road hill" aria-label="Segment name" className="w-full px-3 py-2 text-sm text-white" />
          {error && <p className="text-xs text-rose-400">{error}</p>}
          <button onClick={create} className="w-full py-2.5 rounded-full text-sm font-extrabold" style={{ background: theme.primary, color: 'var(--on-accent)' }}>
            Save segment
          </button>
        </div>
      )}
    </section>
  );
};

/** All your segments with your times on each, fastest first. */
export const SegmentsPanel: React.FC<{ workouts: WorkoutSession[]; units: UnitSystem; theme: ColorPalette; onOpenWorkout: (w: WorkoutSession) => void }> = ({ workouts, units, theme, onOpenWorkout }) => {
  const [segs, setSegs] = useSegments();
  const [openId, setOpenId] = useState<string | null>(null);
  const effortsById = useMemo(() => new Map(segs.map((s) => [s.id, segmentEfforts(workouts, s)])), [segs, workouts]);
  if (segs.length === 0) return null;

  return (
    <section className="rounded-[28px] border p-4 space-y-2" style={{ backgroundColor: theme.surface, borderColor: theme.surfaceBorder }} aria-label="Segments">
      <div className="flex items-center gap-2 text-sm font-semibold text-white">
        <Flag className="w-4 h-4" style={{ color: theme.primary }} /> Segments
      </div>
      {segs.map((s) => {
        const efforts = effortsById.get(s.id) ?? [];
        const best = efforts[0];
        const open = openId === s.id;
        return (
          <div key={s.id} className="rounded-2xl glass-inset">
            <button onClick={() => setOpenId(open ? null : s.id)} className="w-full flex items-center justify-between gap-2 px-3.5 py-3 text-left" aria-expanded={open}>
              <div className="min-w-0">
                <div className="text-sm font-bold text-white truncate">{s.name}</div>
                <div className="text-[11px] text-neutral-400">
                  {kmToDisplay(s.km, units, 2)} {distanceUnit(units)} · {s.sport} · {efforts.length} {efforts.length === 1 ? 'pass' : 'passes'}
                </div>
              </div>
              <div className="font-mono text-sm font-bold" style={{ color: theme.primary }}>
                {best ? formatDuration(best.seconds) : '--'}
              </div>
            </button>
            {open && (
              <div className="px-3.5 pb-3 space-y-1">
                {efforts.map((e) => {
                  const w = workouts.find((x) => x.id === e.workoutId);
                  return (
                    <button key={e.workoutId} onClick={() => w && onOpenWorkout(w)} className="w-full flex items-center gap-2 text-xs py-1 text-left">
                      <span className="w-6 text-neutral-500">{e.rank}</span>
                      <span className="flex-1 text-neutral-300">{shortMonthDay(toDateKey(e.at))}</span>
                      <span className="font-mono text-white">{formatDuration(e.seconds)}</span>
                    </button>
                  );
                })}
                {efforts.length === 0 && <p className="text-[11px] text-neutral-500">No recorded workout passes through this one.</p>}
                <button
                  onClick={() => {
                    setSegs(segs.filter((x) => x.id !== s.id));
                    setOpenId(null);
                  }}
                  className="mt-1 text-[11px] font-bold text-neutral-500 hover:text-rose-400 flex items-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Delete segment
                </button>
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
};

export { SEGMENT_SPORTS };
