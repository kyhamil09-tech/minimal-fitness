import React from 'react';

/** Keeps at most `max` readings, evenly spread, so a long session stays a short list. */
export const thin = (xs: number[], max = 80): number[] => {
  if (xs.length <= max) return xs;
  const out: number[] = [];
  for (let i = 0; i < max; i++) out.push(xs[Math.round((i * (xs.length - 1)) / (max - 1))]);
  return out;
};

/** Heart rate through a session as a line, with the first and last readings written out. Needs a few readings to say anything. */
export const HrLine: React.FC<{ values: number[]; hue: string }> = ({ values, hue }) => {
  if (values.length < 5) return null;
  const w = 300;
  const h = 80;
  const lo = Math.min(...values) - 3;
  const hi = Math.max(...values) + 3;
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * w).toFixed(1)},${(h - ((v - lo) / (hi - lo)) * h).toFixed(1)}`).join(' ');
  const first = values[0];
  const last = values[values.length - 1];
  return (
    <figure className="m-0 w-full">
      <svg viewBox={`0 0 ${w} ${h}`} className="h-20 w-full" role="img" aria-label={`Heart rate from ${first} to ${last} beats a minute`} preserveAspectRatio="none">
        <polyline points={pts} fill="none" stroke={hue} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <figcaption className="mt-1 flex justify-between text-xs">
        <span className="br-dim">Start {first} bpm</span>
        <span className="font-semibold" style={{ color: hue }}>
          {last - first === 0 ? 'No change' : `${last - first > 0 ? '+' : ''}${last - first} bpm`}
        </span>
        <span className="br-dim">End {last} bpm</span>
      </figcaption>
    </figure>
  );
};
