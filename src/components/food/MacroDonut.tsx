import React, { useEffect, useState } from 'react';
import { ColorPalette } from '../../types/theme';

/** Protein, carbs and fat colours: the palette's accent and data colours, so every screen shows them the same way. */
export const macroColors = (theme: ColorPalette) => ({
  p: theme.primary,
  c: theme.data?.blue ?? '#38BDF8',
  f: theme.data?.yellow ?? '#FBBF24',
});

/** A donut of where the calories come from (protein and carbs 4 kcal a gram, fat 9), with the calorie number in the middle. */
export const MacroDonut: React.FC<{ theme: ColorPalette; p: number; c: number; f: number; size?: number; children?: React.ReactNode }> = ({ theme, p, c, f, size = 132, children }) => {
  const col = macroColors(theme);
  const parts = [
    { v: p * 4, color: col.p },
    { v: c * 4, color: col.c },
    { v: f * 9, color: col.f },
  ];
  const total = parts.reduce((s, x) => s + x.v, 0);
  const stroke = Math.max(10, size * 0.105);
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const gap = total > 0 ? 3 : 0;
  const [on, setOn] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setOn(true));
    return () => cancelAnimationFrame(id);
  }, []);
  let offset = 0;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`Protein ${Math.round(p)} grams, carbs ${Math.round(c)} grams, fat ${Math.round(f)} grams`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--hairline)" strokeWidth={stroke} />
        {total > 0 &&
          parts.map((x, i) => {
            const len = Math.max(0, (x.v / total) * circ - gap);
            const el = (
              <circle
                key={i}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={x.color}
                strokeWidth={stroke}
                strokeLinecap="round"
                strokeDasharray={`${on ? len : 0} ${circ}`}
                strokeDashoffset={-offset}
                style={{ transition: 'stroke-dasharray 0.7s cubic-bezier(0.22,1,0.36,1)' }}
              />
            );
            offset += (x.v / total) * circ;
            return el;
          })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  );
};
