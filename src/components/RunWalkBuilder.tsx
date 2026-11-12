import React from 'react';
import { Minus, Plus } from 'lucide-react';
import { RUN_WALK_LIMITS, RunWalkInput, clampRunWalk } from '../data/intervals';
import { ColorPalette } from '../types/theme';

/** 90 becomes "1:30". */
export const clockSec = (sec: number): string => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;

/** How much one tap changes a time: fine at the short end, coarser as it gets longer. */
export const stepForSec = (sec: number): number => (sec <= 120 ? 5 : sec <= 600 ? 15 : 60);

/** Moves a run or walk time up or down to the next clean value (a multiple of the step), inside the limits. */
export const nudgeSec = (sec: number, dir: 1 | -1, [lo, hi]: readonly [number, number]): number => {
  const step = dir > 0 ? stepForSec(sec) : stepForSec(sec - 1);
  const next = dir > 0 ? (Math.floor(sec / step) + 1) * step : (Math.ceil(sec / step) - 1) * step;
  return Math.max(lo, Math.min(hi, next));
};

/** The whole workout in minutes (warm-up, every run and walk, cool-down). */
export const totalMinutes = (c: RunWalkInput): number =>
  Math.round((c.warmupMin * 60 + c.rounds * c.runSec + Math.max(0, c.rounds - 1) * c.walkSec + c.cooldownMin * 60) / 60);

/** Run and walk times you can pick in one tap. */
export const RUN_WALK_PRESETS: { run: number; walk: number }[] = [
  { run: 30, walk: 60 },
  { run: 60, walk: 60 },
  { run: 60, walk: 120 },
  { run: 90, walk: 90 },
  { run: 120, walk: 60 },
  { run: 180, walk: 60 },
  { run: 300, walk: 60 },
];

const Stepper: React.FC<{ label: string; value: string; onMinus: () => void; onPlus: () => void; minusOff?: boolean; plusOff?: boolean; accent: string }> = ({
  label,
  value,
  onMinus,
  onPlus,
  minusOff,
  plusOff,
  accent,
}) => (
  <div className="rounded-2xl glass-inset px-2 py-2.5 text-center">
    <div className="stat-label" style={{ color: accent }}>
      {label}
    </div>
    <div className="mt-1 flex items-center justify-between gap-1">
      <button onClick={onMinus} disabled={minusOff} aria-label={`Less ${label}`} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full glass-chip text-white disabled:opacity-30">
        <Minus className="h-4 w-4" />
      </button>
      <span className="hero-num text-[1.6rem] leading-none tabular-nums">{value}</span>
      <button onClick={onPlus} disabled={plusOff} aria-label={`More ${label}`} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full glass-chip text-white disabled:opacity-30">
        <Plus className="h-4 w-4" />
      </button>
    </div>
  </div>
);

/** Set how long to run and how long to walk, and for how many rounds. The app then says and buzzes when to switch. */
export const RunWalkBuilder: React.FC<{ value: RunWalkInput; onChange: (v: RunWalkInput) => void; theme: ColorPalette }> = ({ value, onChange, theme }) => {
  const set = (patch: Partial<RunWalkInput>) => onChange(clampRunWalk({ ...value, ...patch }));
  const L = RUN_WALK_LIMITS;
  return (
    <div className="space-y-3 pt-1">
      <div className="grid grid-cols-2 gap-3">
        <Stepper
          label="Run"
          accent={theme.primary}
          value={clockSec(value.runSec)}
          onMinus={() => set({ runSec: nudgeSec(value.runSec, -1, L.runSec) })}
          onPlus={() => set({ runSec: nudgeSec(value.runSec, 1, L.runSec) })}
          minusOff={value.runSec <= L.runSec[0]}
          plusOff={value.runSec >= L.runSec[1]}
        />
        <Stepper
          label="Walk"
          accent="#7dd3fc"
          value={clockSec(value.walkSec)}
          onMinus={() => set({ walkSec: nudgeSec(value.walkSec, -1, L.walkSec) })}
          onPlus={() => set({ walkSec: nudgeSec(value.walkSec, 1, L.walkSec) })}
          minusOff={value.walkSec <= L.walkSec[0]}
          plusOff={value.walkSec >= L.walkSec[1]}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Stepper
          label="Rounds"
          accent="#9AA3B2"
          value={String(value.rounds)}
          onMinus={() => set({ rounds: value.rounds - 1 })}
          onPlus={() => set({ rounds: value.rounds + 1 })}
          minusOff={value.rounds <= L.rounds[0]}
          plusOff={value.rounds >= L.rounds[1]}
        />
        <Stepper
          label="Warm-up"
          accent="#9AA3B2"
          value={`${value.warmupMin}m`}
          onMinus={() => set({ warmupMin: value.warmupMin - 1 })}
          onPlus={() => set({ warmupMin: value.warmupMin + 1 })}
          minusOff={value.warmupMin <= L.warmupMin[0]}
          plusOff={value.warmupMin >= L.warmupMin[1]}
        />
        <div className="col-span-2">
        <Stepper
          label="Cool-down"
          accent="#9AA3B2"
          value={`${value.cooldownMin}m`}
          onMinus={() => set({ cooldownMin: value.cooldownMin - 1 })}
          onPlus={() => set({ cooldownMin: value.cooldownMin + 1 })}
          minusOff={value.cooldownMin <= L.cooldownMin[0]}
          plusOff={value.cooldownMin >= L.cooldownMin[1]}
        />
        </div>
      </div>
      <div>
        <div className="stat-label mb-1.5">Quick picks (run / walk)</div>
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1" role="group" aria-label="Quick run and walk times">
          {RUN_WALK_PRESETS.map((p) => {
            const on = value.runSec === p.run && value.walkSec === p.walk;
            return (
              <button key={`${p.run}-${p.walk}`} onClick={() => set({ runSec: p.run, walkSec: p.walk })} aria-pressed={on} className="sport-pill !py-1.5 !px-3 !text-xs whitespace-nowrap">
                {clockSec(p.run)} / {clockSec(p.walk)}
              </button>
            );
          })}
        </div>
      </div>
      <p className="text-xs leading-relaxed text-neutral-400">
        {value.rounds} rounds: run {clockSec(value.runSec)}, walk {clockSec(value.walkSec)}. About {totalMinutes(value)} minutes in all. The app says "Run" and "Walk" out loud and buzzes the phone, with a warning
        before each change (set in Settings).
      </p>
    </div>
  );
};
