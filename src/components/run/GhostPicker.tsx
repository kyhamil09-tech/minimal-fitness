import React from 'react';
import { Ghost as GhostIcon, Minus, Plus } from 'lucide-react';
import { GhostChoices } from '../../lib/ghost';
import { formatPaceSec } from '../../lib/workoutStats';
import { UnitSystem } from '../../types/tracking';
import { ColorPalette } from '../../types/theme';
import { distanceUnit } from '../../lib/units';

export type GhostMode = 'off' | 'last' | 'fastest' | 'pace';

const KM_PER_MI = 1.609344;

/** "Race a ghost" on the Run start screen: your last run, your quickest run, or a steady pace to hold. */
export const GhostPicker: React.FC<{
  theme: ColorPalette;
  units: UnitSystem;
  choices: GhostChoices;
  mode: GhostMode;
  onMode: (m: GhostMode) => void;
  /** Seconds per kilometer. */
  pace: number;
  onPace: (secPerKm: number) => void;
}> = ({ theme, units, choices, mode, onMode, pace, onPace }) => {
  const per = units === 'imperial' ? KM_PER_MI : 1;
  const shown = Math.round(pace * per);
  const step = (d: number) => onPace(Math.min(900 / per, Math.max(150 / per, (shown + d) / per)));
  const options: { id: GhostMode; label: string; ok: boolean }[] = [
    { id: 'off', label: 'Off', ok: true },
    { id: 'last', label: 'Last run', ok: !!choices.last },
    { id: 'fastest', label: 'Fastest', ok: !!choices.fastest },
    { id: 'pace', label: 'Pace', ok: true },
  ];
  return (
    <div className="mt-3 rounded-[26px] border p-4 space-y-3" style={{ backgroundColor: theme.surface, borderColor: theme.surfaceBorder }}>
      <div className="flex items-center gap-2">
        <GhostIcon className="h-4 w-4" style={{ color: theme.primary }} aria-hidden="true" />
        <span className="stat-label">Race a ghost</span>
        <span className="ml-auto text-xs text-neutral-400">{mode === 'off' ? 'Ahead or behind, live' : 'On for this run'}</span>
      </div>
      <div className="flex gap-1.5" role="group" aria-label="Ghost to race">
        {options.map((o) => (
          <button key={o.id} type="button" disabled={!o.ok} aria-pressed={mode === o.id} onClick={() => onMode(o.id)} className="sport-pill !py-2 !px-3 !text-xs flex-1 disabled:opacity-40">
            {o.label}
          </button>
        ))}
      </div>
      {mode === 'pace' && (
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-neutral-300">Hold this pace</span>
          <div className="flex items-center gap-2">
            <button type="button" aria-label="Five seconds faster" onClick={() => step(-5)} className="inline-flex h-11 w-11 items-center justify-center rounded-full border" style={{ borderColor: 'var(--hairline)', backgroundColor: 'var(--card2)' }}>
              <Minus className="h-4 w-4" aria-hidden="true" />
            </button>
            <span className="hero-num min-w-[5.5rem] text-center text-2xl" aria-live="polite">
              {formatPaceSec(shown)}
              <span className="ml-1 text-xs text-neutral-400">/{distanceUnit(units)}</span>
            </span>
            <button type="button" aria-label="Five seconds slower" onClick={() => step(5)} className="inline-flex h-11 w-11 items-center justify-center rounded-full border" style={{ borderColor: 'var(--hairline)', backgroundColor: 'var(--card2)' }}>
              <Plus className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
      {mode === 'last' && choices.last && <p className="text-xs text-neutral-400">Your most recent run of this activity runs alongside you.</p>}
      {mode === 'fastest' && choices.fastest && <p className="text-xs text-neutral-400">Your quickest run of the last thirty. Try to stay ahead of it.</p>}
      {mode === 'off' && !choices.last && <p className="text-xs text-neutral-400">After your first GPS run of this activity you can race it here.</p>}
    </div>
  );
};
