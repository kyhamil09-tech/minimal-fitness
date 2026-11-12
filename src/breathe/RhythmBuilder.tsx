import React, { useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { BreathPattern, CUSTOM_LIMITS, CustomInput, cycleSec, makeCustomPattern } from '../lib/breathing';
import { categoryHue } from './content';
import { Orb, useBreathClock } from './Orb';
import { BrHeader, SectionTitle } from './ui';

const Stepper: React.FC<{ label: string; sub: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }> = ({ label, sub, value, min, max, step, onChange }) => (
  <div className="br-card flex items-center justify-between gap-3 !py-3">
    <div className="min-w-0">
      <div className="text-sm font-bold">{label}</div>
      <div className="br-dim text-xs">{sub}</div>
    </div>
    <div className="flex items-center gap-2">
      <button type="button" className="br-round br-round-quiet !h-11 !w-11" onClick={() => onChange(Math.max(min, Math.round((value - step) * 10) / 10))} disabled={value <= min} aria-label={`Less ${label.toLowerCase()}`}>
        <Minus className="h-5 w-5" aria-hidden="true" />
      </button>
      <span className="w-14 text-center text-xl font-extrabold tabular-nums" aria-live="polite">
        {value}
        <span className="br-dim ml-0.5 text-xs font-semibold">s</span>
      </span>
      <button type="button" className="br-round br-round-quiet !h-11 !w-11" onClick={() => onChange(Math.min(max, Math.round((value + step) * 10) / 10))} disabled={value >= max} aria-label={`More ${label.toLowerCase()}`}>
        <Plus className="h-5 w-5" aria-hidden="true" />
      </button>
    </div>
  </div>
);

/** Make a rhythm of your own: how long to breathe in, hold, breathe out and hold, with a live preview. */
export const RhythmBuilder: React.FC<{
  /** Set when editing one you made before. */
  initial?: BreathPattern;
  reduceMotion: boolean;
  onBack: () => void;
  onSave: (pattern: BreathPattern) => void;
}> = ({ initial, reduceMotion, onBack, onSave }) => {
  const ph = initial?.phases ?? [];
  const find = (i: number, kind: string) => ph.filter((p) => p.kind === kind)[i]?.sec ?? 0;
  const [name, setName] = useState(initial?.name ?? '');
  const [inSec, setIn] = useState(initial ? find(0, 'in') : 4);
  const [holdIn, setHoldIn] = useState(initial ? (ph[1]?.kind === 'hold' ? ph[1].sec : 0) : 0);
  const [outSec, setOut] = useState(initial ? find(0, 'out') : 6);
  const [holdOut, setHoldOut] = useState(initial ? (ph[ph.length - 1]?.kind === 'hold' && ph.length > 2 && ph[ph.length - 1] !== ph[1] ? ph[ph.length - 1].sec : 0) : 0);
  const input: CustomInput = { name: name || 'Preview', inSec, holdInSec: holdIn, outSec, holdOutSec: holdOut };
  const built = makeCustomPattern(input, initial?.id ?? `custom-${Date.now()}`);
  const ok = 'pattern' in built && name.trim().length > 0;
  const hue = categoryHue('calm');
  const t = useBreathClock(!reduceMotion && 'pattern' in built);
  const total = 'pattern' in built ? cycleSec(built.pattern) : 0;
  const hasHold = holdIn > 0 || holdOut > 0;

  return (
    <>
      <BrHeader title={initial ? 'Edit your rhythm' : 'Make your own rhythm'} onBack={onBack} />
      <div className="br-scroll">
        <div className="flex flex-col items-center pt-1">
          {'pattern' in built ? <Orb pattern={built.pattern} t={reduceMotion ? 0 : t} hue={hue} size={200} reduce={reduceMotion} /> : <div style={{ height: 200 }} />}
          <p className="br-dim mt-2 text-center text-xs">
            {'pattern' in built ? `${built.pattern.rhythm} · ${total} seconds a breath · about ${Math.round((60 / total) * 10) / 10} a minute` : 'error' in built ? built.error : ''}
          </p>
        </div>

        <SectionTitle>Name</SectionTitle>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={CUSTOM_LIMITS.nameMax}
          placeholder="For example: Evening 4-2-6"
          aria-label="Name of your rhythm"
          className="br-input"
        />

        <SectionTitle>The breath</SectionTitle>
        <div className="space-y-2.5">
          <Stepper label="Breathe in" sub={`Up to ${CUSTOM_LIMITS.inMax} seconds`} value={inSec} min={1} max={CUSTOM_LIMITS.inMax} step={0.5} onChange={setIn} />
          <Stepper label="Hold after in" sub="Optional" value={holdIn} min={0} max={CUSTOM_LIMITS.holdMax} step={1} onChange={setHoldIn} />
          <Stepper label="Breathe out" sub={`Up to ${CUSTOM_LIMITS.outMax} seconds`} value={outSec} min={1} max={CUSTOM_LIMITS.outMax} step={0.5} onChange={setOut} />
          <Stepper label="Hold after out" sub="Optional" value={holdOut} min={0} max={CUSTOM_LIMITS.holdMax} step={1} onChange={setHoldOut} />
        </div>

        {hasHold && (
          <div className="br-note mt-5">
            <div className="text-xs font-bold uppercase tracking-wider">Take care</div>
            <p className="mt-1 text-sm leading-relaxed">Keep holds gentle. Skip them if you are pregnant, have a heart or lung condition, or feel dizzy. If a rhythm was given to you by a doctor or coach, follow their advice over this screen.</p>
          </div>
        )}
        <div className="h-4" />
      </div>
      <div className="br-footer">
        <button type="button" className="br-btn w-full disabled:opacity-40" disabled={!ok} onClick={() => 'pattern' in built && onSave(built.pattern)}>
          {initial ? 'Save changes' : 'Save rhythm'}
        </button>
      </div>
    </>
  );
};
