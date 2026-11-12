import React, { useEffect, useState } from 'react';
import { plateBreakdown } from '../lib/strengthProgress';
import { gearFor } from '../lib/gear';
import { usePrefs } from '../lib/prefs';
import { Sheet } from './ui';

/** The look of a plate: its height in the picture and its color (the usual competition colors for kg, a plainer set for lb). */
const plateStyle = (w: number, unit: 'kg' | 'lb'): { h: number; fill: string; text: string } => {
  const kg: Record<number, [number, string, string]> = {
    25: [96, '#d93a2f', '#fff'],
    20: [92, '#2f6fdb', '#fff'],
    15: [80, '#e8c21a', '#1a1a1a'],
    10: [68, '#2fa65a', '#fff'],
    5: [54, '#f2f2f2', '#1a1a1a'],
    2.5: [42, '#1c1c1c', '#fff'],
    1.25: [34, '#9aa0a6', '#1a1a1a'],
    0.5: [28, '#c9ccd0', '#1a1a1a'],
  };
  const lb: Record<number, [number, string, string]> = {
    55: [100, '#d93a2f', '#fff'],
    45: [96, '#2f6fdb', '#fff'],
    35: [84, '#e8c21a', '#1a1a1a'],
    25: [70, '#2fa65a', '#fff'],
    10: [52, '#f2f2f2', '#1a1a1a'],
    5: [40, '#9aa0a6', '#1a1a1a'],
    2.5: [32, '#c9ccd0', '#1a1a1a'],
    1.25: [26, '#b0b4b9', '#1a1a1a'],
  };
  const [h, fill, text] = (unit === 'lb' ? lb : kg)[w] ?? [30, '#888', '#fff'];
  return { h, fill, text };
};

interface PlateSheetProps {
  open: boolean;
  onClose: () => void;
  unit: 'kg' | 'lb';
  /** The weight to load, as typed in the set (display units). */
  weight: string;
}

/** The plate calculator: type a total and see the bar loaded, one side drawn, with the plates listed. */
export const PlateSheet: React.FC<PlateSheetProps> = ({ open, onClose, unit, weight }) => {
  const [value, setValue] = useState(weight);
  useEffect(() => {
    if (open) setValue(weight);
  }, [open, weight]);
  const { prefs } = usePrefs();
  const { bar, plates } = gearFor(unit, prefs);
  const target = parseFloat(value) || 0;
  const res = plateBreakdown(target, bar, plates);
  const counts: { w: number; n: number }[] = [];
  for (const p of res.perSide) {
    const last = counts[counts.length - 1];
    if (last && last.w === p) last.n++;
    else counts.push({ w: p, n: 1 });
  }
  const PW = 14;
  const width = 40 + res.perSide.length * (PW + 2) + 30;
  const summary = target <= bar ? `Just the ${bar} ${unit} bar` : counts.length ? `${counts.map((c) => `${c.n} × ${c.w}`).join(' + ')} each side` : `No plates fit ${target} ${unit}`;
  return (
    <Sheet open={open} onClose={onClose} title="Plate calculator">
      <label htmlFor="plate-weight" className="l-dim text-xs font-semibold">
        Total weight ({unit})
      </label>
      <input id="plate-weight" className="l-num-input mb-3 mt-1 !w-full" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} onFocus={(e) => e.target.select()} />
      <div className="l-card overflow-x-auto p-3">
        <svg viewBox={`0 0 ${Math.max(width, 220)} 110`} className="mx-auto block h-28" role="img" aria-label={`One side of the bar: ${summary}`}>
          {/* the sleeve and the collar */}
          <rect x="0" y="52" width={Math.max(width, 220)} height="6" rx="3" fill="#8e8e93" />
          <rect x="30" y="38" width="8" height="34" rx="2" fill="#5c5c62" />
          {res.perSide.map((w, i) => {
            const s = plateStyle(w, unit);
            const x = 42 + i * (PW + 2);
            return (
              <g key={i}>
                <rect x={x} y={55 - s.h / 2} width={PW} height={s.h} rx="3" fill={s.fill} stroke="#00000055" />
                {s.h >= 40 && (
                  <text x={x + PW / 2} y="58" fontSize="8" fontWeight="700" textAnchor="middle" fill={s.text}>
                    {w}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
      <p className="mt-3 text-sm font-semibold">{summary}</p>
      <p className="l-dim text-xs">
        Your bar is {bar} {unit} (change it under Profile). Loaded {res.loaded} {unit}
        {res.short > 0 ? `, ${res.short} ${unit} short of ${target} with these plates` : ''}.
      </p>
    </Sheet>
  );
};
