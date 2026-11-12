import React from 'react';

/**
 * A simple body drawn from the front and the back with the muscles an exercise works lit up: the main muscles in the accent color,
 * the helpers in a paler shade. The muscle names are the ones the exercise library uses (abdominals, lats, quadriceps...).
 */

type Shape = { kind: 'e'; cx: number; cy: number; rx: number; ry: number; rot?: number } | { kind: 'r'; x: number; y: number; w: number; h: number; r?: number } | { kind: 'p'; d: string };

interface Region {
  muscle: string;
  side: 'front' | 'back';
  shapes: Shape[];
}

/** An ellipse and its mirror image on the other side of the body (the figure is 100 wide, centered on 50). */
const pair = (cx: number, cy: number, rx: number, ry: number, rot = 0): Shape[] => [
  { kind: 'e', cx, cy, rx, ry, rot },
  { kind: 'e', cx: 100 - cx, cy, rx, ry, rot: -rot },
];

const REGIONS: Region[] = [
  // front
  { muscle: 'neck', side: 'front', shapes: [{ kind: 'r', x: 44, y: 27, w: 12, h: 8, r: 3 }] },
  { muscle: 'traps', side: 'front', shapes: [{ kind: 'p', d: 'M40 35 L50 33 L60 35 L57 40 L43 40 Z' }] },
  { muscle: 'shoulders', side: 'front', shapes: pair(29, 44, 8.5, 8) },
  { muscle: 'chest', side: 'front', shapes: pair(41.5, 53, 10, 8, 8) },
  { muscle: 'biceps', side: 'front', shapes: pair(23, 64, 5, 11, 6) },
  { muscle: 'forearms', side: 'front', shapes: pair(19, 88, 4.5, 12, 4) },
  { muscle: 'abdominals', side: 'front', shapes: [{ kind: 'r', x: 43, y: 63, w: 14, h: 30, r: 5 }] },
  { muscle: 'abductors', side: 'front', shapes: pair(32, 106, 4, 9, -8) },
  { muscle: 'quadriceps', side: 'front', shapes: pair(40.5, 128, 8.5, 21, 3) },
  { muscle: 'adductors', side: 'front', shapes: pair(47, 120, 3, 13) },
  { muscle: 'calves', side: 'front', shapes: pair(38.5, 172, 5.5, 16, 2) },
  // back
  { muscle: 'neck', side: 'back', shapes: [{ kind: 'r', x: 44, y: 27, w: 12, h: 8, r: 3 }] },
  { muscle: 'traps', side: 'back', shapes: [{ kind: 'p', d: 'M50 33 L63 41 L50 62 L37 41 Z' }] },
  { muscle: 'shoulders', side: 'back', shapes: pair(29, 44, 8.5, 8) },
  { muscle: 'lats', side: 'back', shapes: pair(37, 68, 7, 14, -10) },
  { muscle: 'middle back', side: 'back', shapes: [{ kind: 'r', x: 43.5, y: 52, w: 13, h: 14, r: 4 }] },
  { muscle: 'lower back', side: 'back', shapes: [{ kind: 'r', x: 42.5, y: 70, w: 15, h: 17, r: 5 }] },
  { muscle: 'triceps', side: 'back', shapes: pair(23, 64, 5, 11, 6) },
  { muscle: 'forearms', side: 'back', shapes: pair(19, 88, 4.5, 12, 4) },
  { muscle: 'glutes', side: 'back', shapes: pair(42, 99, 9, 9) },
  { muscle: 'abductors', side: 'back', shapes: pair(31.5, 106, 3.5, 8, -8) },
  { muscle: 'hamstrings', side: 'back', shapes: pair(40.5, 130, 8.5, 19, 3) },
  { muscle: 'calves', side: 'back', shapes: pair(38.5, 170, 6, 16, 2) },
];

/** The grey body behind the muscles. */
const OUTLINE: Shape[] = [
  { kind: 'e', cx: 50, cy: 15, rx: 10.5, ry: 12 },
  { kind: 'r', x: 34, y: 34, w: 32, h: 62, r: 10 },
  ...pair(23, 66, 6.5, 22, 6),
  ...pair(19, 90, 5.5, 14, 4),
  ...pair(40.5, 128, 11, 32, 3),
  ...pair(38.5, 172, 7, 22, 2),
];

const draw = (s: Shape, key: string, props: React.SVGProps<SVGElement>) => {
  if (s.kind === 'e') return <ellipse key={key} cx={s.cx} cy={s.cy} rx={s.rx} ry={s.ry} transform={s.rot ? `rotate(${s.rot} ${s.cx} ${s.cy})` : undefined} {...(props as React.SVGProps<SVGEllipseElement>)} />;
  if (s.kind === 'r') return <rect key={key} x={s.x} y={s.y} width={s.w} height={s.h} rx={s.r ?? 0} {...(props as React.SVGProps<SVGRectElement>)} />;
  return <path key={key} d={s.d} {...(props as React.SVGProps<SVGPathElement>)} />;
};

const Figure: React.FC<{ side: 'front' | 'back'; primary: Set<string>; secondary: Set<string> }> = ({ side, primary, secondary }) => (
  <svg viewBox="0 0 100 200" className="h-44 w-auto" aria-hidden="true">
    {OUTLINE.map((s, i) => draw(s, `o${i}`, { fill: 'var(--l-s2)' }))}
    {REGIONS.filter((r) => r.side === side).map((r) =>
      r.shapes.map((s, i) =>
        draw(s, `${r.muscle}${i}`, {
          fill: primary.has(r.muscle) ? 'var(--l-accent)' : secondary.has(r.muscle) ? 'var(--l-accent)' : 'var(--l-line)',
          fillOpacity: primary.has(r.muscle) ? 1 : secondary.has(r.muscle) ? 0.42 : 0.55,
        })
      )
    )}
  </svg>
);

export const MuscleMap: React.FC<{ primary: string[]; secondary: string[] }> = ({ primary, secondary }) => {
  const p = new Set(primary);
  const s = new Set(secondary.filter((m) => !p.has(m)));
  const say = (list: string[]) => (list.length ? list.join(', ') : 'none');
  return (
    <figure className="l-card m-0 px-3 py-2" aria-label={`Muscles worked. Main: ${say(primary)}. Helping: ${say([...s])}.`}>
      <div className="flex items-end justify-center gap-6">
        <div className="text-center">
          <Figure side="front" primary={p} secondary={s} />
          <figcaption className="l-dim text-[11px]">Front</figcaption>
        </div>
        <div className="text-center">
          <Figure side="back" primary={p} secondary={s} />
          <figcaption className="l-dim text-[11px]">Back</figcaption>
        </div>
      </div>
      <div className="l-dim mt-1 flex justify-center gap-4 text-[11px]" aria-hidden="true">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: 'var(--l-accent)' }} /> Main
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: 'var(--l-accent)', opacity: 0.42 }} /> Helping
        </span>
      </div>
    </figure>
  );
};
