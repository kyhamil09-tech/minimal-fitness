import React, { useEffect, useId, useRef, useState } from 'react';
import { haptic } from '../../lib/haptics';

/** A value that eases from zero (or its last value) to the target on the next frame, so a ring fills when it appears. */
const useEased = (target: number): number => {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(target));
    return () => cancelAnimationFrame(id);
  }, [target]);
  return shown;
};

/** True for a moment when a value that was below 1 reaches 1 while you watch (not for one that was already full when it appeared). */
const useClosed = (value: number): boolean => {
  const prev = useRef(value);
  const [pop, setPop] = useState(false);
  useEffect(() => {
    if (prev.current < 1 && value >= 1) {
      haptic.success();
      setPop(true);
      const t = window.setTimeout(() => setPop(false), 1100);
      prev.current = value;
      return () => window.clearTimeout(t);
    }
    prev.current = value;
  }, [value]);
  return pop;
};

export interface BarDatum {
  label: string;
  value: number;
  highlight?: boolean;
}

interface BarChartProps {
  data: BarDatum[];
  color: string;
  height?: number;
  goal?: number;
  format?: (v: number) => string;
  ariaLabel: string;
}

/** Simple responsive SVG bar chart with optional goal line. */
export const BarChart: React.FC<BarChartProps> = ({ data, color, height = 120, goal, format, ariaLabel }) => {
  const w = 300;
  const padTop = 14;
  const padBottom = 18;
  const max = Math.max(1, goal || 0, ...data.map((d) => d.value));
  const plotH = height - padTop - padBottom;
  const slot = w / Math.max(1, data.length);
  const barW = Math.max(2, Math.min(24, slot * 0.62));
  const showEvery = data.length > 16 ? Math.ceil(data.length / 8) : 1;
  const fmt = format || ((v: number) => String(Math.round(v)));
  const gid = useId().replace(/:/g, '');

  return (
    <svg
      viewBox={`0 0 ${w} ${height}`}
      className="w-full"
      role="img"
      aria-label={ariaLabel}
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id={`bar-${gid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={1} />
          <stop offset="100%" stopColor={color} stopOpacity={0.35} />
        </linearGradient>
      </defs>
      {goal ? (
        <>
          <line
            x1={0}
            x2={w}
            y1={padTop + plotH * (1 - goal / max)}
            y2={padTop + plotH * (1 - goal / max)}
            stroke="#7E889B"
            strokeDasharray="3 3"
            strokeWidth={0.8}
          />
        </>
      ) : null}
      {data.map((d, i) => {
        const h = (d.value / max) * plotH;
        const x = i * slot + (slot - barW) / 2;
        const y = padTop + plotH - h;
        return (
          <g key={`${d.label}-${i}`}>
            <rect
              x={x}
              y={d.value > 0 ? y : padTop + plotH - 1}
              width={barW}
              height={d.value > 0 ? h : 1}
              rx={4}
              fill={d.value > 0 ? `url(#bar-${gid})` : 'rgba(255,255,255,0.08)'}
              opacity={d.highlight ? 1 : 0.72}
            />
            {data.length <= 10 && d.value > 0 && (
              <text x={x + barW / 2} y={y - 3} textAnchor="middle" fontSize={8} fill="#CBD5E1">
                {fmt(d.value)}
              </text>
            )}
            {i % showEvery === 0 && (
              <text x={x + barW / 2} y={height - 5} textAnchor="middle" fontSize={8} fill="#7E889B">
                {d.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
};

export interface LinePoint {
  label: string;
  value: number;
}

interface LineChartProps {
  points: LinePoint[];
  color: string;
  height?: number;
  goal?: number;
  unit?: string;
  /** Fixed vertical range; without them the chart zooms to the data. */
  yMin?: number;
  yMax?: number;
  ariaLabel: string;
}

export const LineChart: React.FC<LineChartProps> = ({ points, color, height = 130, goal, unit = '', yMin, yMax, ariaLabel }) => {
  const w = 300;
  const padX = 10;
  const padTop = 14;
  const padBottom = 18;
  const gid = useId().replace(/:/g, '');
  if (points.length === 0) return null;
  const vals = points.map((p) => p.value).concat(goal !== undefined ? [goal] : []);
  let min = yMin ?? Math.min(...vals);
  let max = yMax ?? Math.max(...vals);
  if (max - min < 1) {
    min -= 1;
    max += 1;
  }
  const span = max - min;
  const pad = yMin !== undefined && yMax !== undefined ? 0 : span * 0.1;
  min -= pad;
  max += pad;
  const plotH = height - padTop - padBottom;
  const xAt = (i: number) => (points.length === 1 ? w / 2 : padX + (i * (w - padX * 2)) / (points.length - 1));
  const yAt = (v: number) => padTop + plotH * (1 - (v - min) / (max - min));
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${xAt(i).toFixed(1)},${yAt(p.value).toFixed(1)}`).join(' ');
  const last = points[points.length - 1];
  const first = points[0];
  const area =`${path} L${xAt(points.length - 1).toFixed(1)},${padTop + plotH} L${xAt(0).toFixed(1)},${padTop + plotH} Z`;

  return (
    <svg viewBox={`0 0 ${w} ${height}`} className="w-full" role="img" aria-label={ariaLabel} preserveAspectRatio="none">
      <defs>
        <linearGradient id={`area-${gid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.35} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      {goal !== undefined && (
        <line x1={0} x2={w} y1={yAt(goal)} y2={yAt(goal)} stroke="#7E889B" strokeDasharray="3 3" strokeWidth={0.8} />
      )}
      {points.length > 1 && <path d={area} fill={`url(#area-${gid})`} stroke="none" />}
      <path d={path} fill="none" stroke={color} strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) => (
        <circle key={i} cx={xAt(i)} cy={yAt(p.value)} r={points.length > 30 ? 1.2 : 2.4} fill={color} />
      ))}
      <text x={xAt(points.length - 1)} y={yAt(last.value) - 6} textAnchor="end" fontSize={9} fill="#F8FAFC">
        {Math.round(last.value * 10) / 10}
        {unit}
      </text>
      <text x={padX} y={height - 5} fontSize={8} fill="#7E889B">
        {first.label}
      </text>
      <text x={w - padX} y={height - 5} textAnchor="end" fontSize={8} fill="#7E889B">
        {last.label}
      </text>
    </svg>
  );
};

interface RingProps {
  value: number; // 0..1
  size?: number;
  stroke?: number;
  color: string;
  children?: React.ReactNode;
  ariaLabel: string;
}

export const Ring: React.FC<RingProps> = ({ value, size = 64, stroke = 6, color, children, ariaLabel }) => {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const target = Math.max(0, Math.min(1, value));
  const v = useEased(target);
  const pop = useClosed(target);
  return (
    <div className={'relative shrink-0' + (pop ? ' ring-pop' : '')} style={{ width: size, height: size }} role="img" aria-label={ariaLabel}>
      <svg width={size} height={size} className="-rotate-90" style={{ overflow: 'visible' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v)}
          style={{ transition: 'stroke-dashoffset 0.8s cubic-bezier(0.22,1,0.36,1)', filter: `drop-shadow(0 0 5px ${color}99)` }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-center">{children}</div>
    </div>
  );
};

interface ConcentricRingsProps {
  /** Outermost first. */
  rings: { value: number; color: string }[];
  size?: number;
  stroke?: number;
  children?: React.ReactNode;
  ariaLabel: string;
}

/** Google Health style activity rings: nested progress arcs with round caps over soft tracks. */
export const ConcentricRings: React.FC<ConcentricRingsProps> = ({ rings, size = 132, stroke = 13, children, ariaLabel }) => {
  const gap = 5;
  const eased = useEased(1);
  const closed = useClosed(rings.length ? Math.min(...rings.map((r) => Math.max(0, Math.min(1, r.value)))) : 0);
  return (
    <div className={'relative shrink-0' + (closed ? ' ring-pop' : '')} style={{ width: size, height: size }} role="img" aria-label={ariaLabel}>
      <svg width={size} height={size} className="-rotate-90" style={{ overflow: 'visible' }}>
        {rings.map((ring, i) => {
          const r = (size - stroke) / 2 - i * (stroke + gap);
          if (r <= 0) return null;
          const c = 2 * Math.PI * r;
          const v = Math.max(0, Math.min(1, ring.value)) * eased;
          return (
            <g key={i}>
              <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={ring.color} strokeOpacity={0.16} strokeWidth={stroke} />
              <circle
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={ring.color}
                strokeWidth={stroke}
                strokeLinecap="round"
                strokeDasharray={c}
                strokeDashoffset={v > 0 ? c * (1 - v) : c}
                opacity={v > 0 ? 1 : 0}
                style={{ transition: `stroke-dashoffset 0.9s cubic-bezier(0.22,1,0.36,1) ${i * 0.09}s`, filter: `drop-shadow(0 0 6px ${ring.color}88)` }}
              />
            </g>
          );
        })}
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-center">{children}</div>
    </div>
  );
};

/* -------------------------------------------------------------------------
   Sleep and fitness charts
   ------------------------------------------------------------------------- */

const clockLabel = (ms: number) => {
  const d = new Date(ms);
  const h = d.getHours();
  const m = d.getMinutes();
  return `${h % 12 === 0 ? 12 : h % 12}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h < 12 ? 'AM' : 'PM'}`;
};

export interface HypnogramColors {
  awake: string;
  rem: string;
  light: string;
  deep: string;
}

interface HypnogramProps {
  /** [stage code (0 awake, 1 light, 2 deep, 3 REM), start ms, end ms], in time order. */
  segments: [number, number, number][];
  startMs: number;
  endMs: number;
  colors: HypnogramColors;
  ariaLabel: string;
}

/** The night as stage blocks over time, in four lanes: awake, REM, light and deep from top to bottom. */
export const Hypnogram: React.FC<HypnogramProps> = ({ segments, startMs, endMs, colors, ariaLabel }) => {
  const w = 300;
  const left = 34;
  const right = 6;
  const laneH = 20;
  const gap = 5;
  const top = 6;
  const plotW = w - left - right;
  const height = top + 4 * laneH + 3 * gap + 22;
  const span = Math.max(1, endMs - startMs);
  const laneOf = (code: number) => ({ 0: 0, 3: 1, 1: 2, 2: 3 })[code as 0 | 1 | 2 | 3] ?? 2;
  const colorOf = (code: number) => [colors.awake, colors.light, colors.deep, colors.rem][code] ?? colors.light;
  const xAt = (ms: number) => left + ((ms - startMs) / span) * plotW;
  const yAt = (lane: number) => top + lane * (laneH + gap);
  const lanes: [string, number][] = [['Awake', 0], ['REM', 3], ['Light', 1], ['Deep', 2]];

  // An hour tick for every full hour inside the night; label every second one when the night is long.
  const ticks: number[] = [];
  const firstHour = new Date(startMs);
  firstHour.setMinutes(0, 0, 0);
  for (let t = firstHour.getTime() + 3_600_000; t < endMs; t += 3_600_000) ticks.push(t);
  const labelEvery = span > 8 * 3_600_000 ? 2 : 1;

  return (
    <svg viewBox={`0 0 ${w} ${height}`} className="w-full" role="img" aria-label={ariaLabel}>
      {lanes.map(([name, code]) => (
        <g key={name}>
          <rect x={left} y={yAt(laneOf(code))} width={plotW} height={laneH} rx={5} fill="rgba(255,255,255,0.035)" />
          <text x={left - 5} y={yAt(laneOf(code)) + laneH / 2 + 3} textAnchor="end" fontSize={8} fill="#7E889B">
            {name}
          </text>
        </g>
      ))}
      {ticks.map((t, i) => (
        <line key={t} x1={xAt(t)} x2={xAt(t)} y1={top} y2={top + 4 * laneH + 3 * gap} stroke="rgba(255,255,255,0.06)" strokeWidth={0.6} />
      ))}
      {segments.map(([code, from, to], i) => {
        const prev = segments[i - 1];
        const x = xAt(Math.max(from, startMs));
        const bw = Math.max(1.6, xAt(Math.min(to, endMs)) - x);
        return (
          <g key={i}>
            {prev && laneOf(prev[0]) !== laneOf(code) && (
              <line
                x1={x}
                x2={x}
                y1={yAt(laneOf(prev[0])) + laneH / 2}
                y2={yAt(laneOf(code)) + laneH / 2}
                stroke={colorOf(code)}
                strokeOpacity={0.45}
                strokeWidth={1}
              />
            )}
            <rect x={x} y={yAt(laneOf(code))} width={bw} height={laneH} rx={4} fill={colorOf(code)} />
          </g>
        );
      })}
      <text x={left} y={height - 6} fontSize={8} fill="#7E889B">
        {clockLabel(startMs)}
      </text>
      {ticks.map((t, i) =>
        i % labelEvery === labelEvery - 1 && xAt(t) > left + 46 && xAt(t) < w - right - 42 ? (
          <text key={t} x={xAt(t)} y={height - 6} textAnchor="middle" fontSize={8} fill="#5F6877">
            {clockLabel(t)}
          </text>
        ) : null
      )}
      <text x={w - right} y={height - 6} textAnchor="end" fontSize={8} fill="#7E889B">
        {clockLabel(endMs)}
      </text>
    </svg>
  );
};

export interface StackedDatum {
  label: string;
  /** Bottom to top. */
  parts: number[];
  highlight?: boolean;
}

interface StackedBarsProps {
  data: StackedDatum[];
  colors: string[];
  height?: number;
  ariaLabel: string;
}

/** One stacked bar per night, with the total above each bar when there is room. */
export const StackedBars: React.FC<StackedBarsProps> = ({ data, colors, height = 130, ariaLabel }) => {
  const w = 300;
  const padTop = 14;
  const padBottom = 18;
  const totals = data.map((d) => d.parts.reduce((a, b) => a + b, 0));
  const max = Math.max(1, ...totals);
  const plotH = height - padTop - padBottom;
  const slot = w / Math.max(1, data.length);
  const barW = Math.max(3, Math.min(24, slot * 0.62));
  const showEvery = data.length > 16 ? Math.ceil(data.length / 8) : 1;
  return (
    <svg viewBox={`0 0 ${w} ${height}`} className="w-full" role="img" aria-label={ariaLabel}>
      {data.map((d, i) => {
        const x = i * slot + (slot - barW) / 2;
        let y = padTop + plotH;
        return (
          <g key={`${d.label}-${i}`} opacity={d.highlight ? 1 : 0.8}>
            {totals[i] <= 0 && <rect x={x} y={padTop + plotH - 1} width={barW} height={1} fill="rgba(255,255,255,0.08)" />}
            {d.parts.map((p, k) => {
              const h = (p / max) * plotH;
              y -= h;
              return h > 0 ? <rect key={k} x={x} y={y} width={barW} height={h} rx={k === d.parts.length - 1 ? 3 : 0} fill={colors[k]} /> : null;
            })}
            {data.length <= 10 && totals[i] > 0 && (
              <text x={x + barW / 2} y={padTop + plotH - (totals[i] / max) * plotH - 3} textAnchor="middle" fontSize={8} fill="#CBD5E1">
                {(totals[i] / 60).toFixed(1)}h
              </text>
            )}
            {i % showEvery === 0 && (
              <text x={x + barW / 2} y={height - 5} textAnchor="middle" fontSize={8} fill="#7E889B">
                {d.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
};

export interface RangeDatum {
  label: string;
  min?: number;
  max?: number;
  avg?: number;
}

interface RangeChartProps {
  data: RangeDatum[];
  color: string;
  height?: number;
  ariaLabel: string;
}

/** A floating bar per day from the lowest to the highest reading, with the average as a white tick. */
export const RangeChart: React.FC<RangeChartProps> = ({ data, color, height = 130, ariaLabel }) => {
  const w = 300;
  const padTop = 14;
  const padBottom = 18;
  const mins = data.map((d) => d.min).filter((v): v is number => v !== undefined);
  const maxs = data.map((d) => d.max).filter((v): v is number => v !== undefined);
  if (mins.length === 0 || maxs.length === 0) return null;
  const lo = Math.floor(Math.min(...mins) / 10) * 10 - 5;
  const hi = Math.ceil(Math.max(...maxs) / 10) * 10 + 5;
  const plotH = height - padTop - padBottom;
  const slot = w / Math.max(1, data.length);
  const barW = Math.max(3, Math.min(14, slot * 0.5));
  const showEvery = data.length > 16 ? Math.ceil(data.length / 8) : 1;
  const yAt = (v: number) => padTop + plotH * (1 - (v - lo) / (hi - lo));
  return (
    <svg viewBox={`0 0 ${w} ${height}`} className="w-full" role="img" aria-label={ariaLabel}>
      {[lo, Math.round((lo + hi) / 2), hi].map((v) => (
        <g key={v}>
          <line x1={0} x2={w} y1={yAt(v)} y2={yAt(v)} stroke="rgba(255,255,255,0.06)" strokeWidth={0.6} />
          <text x={2} y={yAt(v) - 2} fontSize={7} fill="#5F6877">
            {v}
          </text>
        </g>
      ))}
      {data.map((d, i) => {
        const x = i * slot + (slot - barW) / 2;
        return (
          <g key={`${d.label}-${i}`}>
            {d.min !== undefined && d.max !== undefined && (
              <rect x={x} y={yAt(d.max)} width={barW} height={Math.max(2, yAt(d.min) - yAt(d.max))} rx={barW / 2} fill={color} opacity={0.75} />
            )}
            {d.avg !== undefined && <line x1={x - 1} x2={x + barW + 1} y1={yAt(d.avg)} y2={yAt(d.avg)} stroke="#fff" strokeWidth={1.6} strokeLinecap="round" />}
            {i % showEvery === 0 && (
              <text x={x + barW / 2} y={height - 5} textAnchor="middle" fontSize={8} fill="#7E889B">
                {d.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
};

/** A tiny bar strip with no text, for the corner of a card. A missing value leaves a gap. */
export const Sparkbars: React.FC<{
  values: (number | undefined)[];
  color: string;
  height?: number;
  /** Bars rise above and fall below a middle line, for numbers that can be negative. */
  signed?: boolean;
  ariaLabel: string;
}> = ({ values, color, height = 28, signed = false, ariaLabel }) => {
  const w = 120;
  const slot = w / Math.max(1, values.length);
  const barW = Math.max(2, slot * 0.64);
  if (signed) {
    const maxAbs = Math.max(0.1, ...values.map((v) => Math.abs(v ?? 0)));
    const mid = height / 2;
    return (
      <svg viewBox={`0 0 ${w} ${height}`} className="w-full" style={{ height }} role="img" aria-label={ariaLabel} preserveAspectRatio="none">
        <line x1={0} x2={w} y1={mid} y2={mid} stroke="rgba(255,255,255,0.18)" strokeWidth={0.8} />
        {values.map((v, i) => {
          if (v === undefined) return <rect key={i} x={i * slot + (slot - barW) / 2} y={mid - 0.75} width={barW} height={1.5} fill="rgba(255,255,255,0.12)" />;
          const h = Math.max(1.5, (Math.abs(v) / maxAbs) * (mid - 1));
          return <rect key={i} x={i * slot + (slot - barW) / 2} y={v >= 0 ? mid - h : mid} width={barW} height={h} rx={1.5} fill={color} opacity={i === values.length - 1 ? 1 : 0.65} />;
        })}
      </svg>
    );
  }
  const max = Math.max(1, ...values.map((v) => v ?? 0));
  return (
    <svg viewBox={`0 0 ${w} ${height}`} className="w-full" style={{ height }} role="img" aria-label={ariaLabel} preserveAspectRatio="none">
      {values.map((v, i) => {
        const h = v === undefined ? 0 : Math.max(2, (v / max) * (height - 2));
        const x = i * slot + (slot - barW) / 2;
        return (
          <rect key={i} x={x} y={height - Math.max(h, 1.5)} width={barW} height={Math.max(h, 1.5)} rx={1.5} fill={v === undefined ? 'rgba(255,255,255,0.08)' : color} opacity={i === values.length - 1 ? 1 : 0.65} />
        );
      })}
    </svg>
  );
};
export const EmptyState: React.FC<{ title: string; hint?: string }> = ({ title, hint }) => (
  <div className="text-center py-6 text-xs text-[#7E889B]">
    <div className="text-neutral-300 font-medium">{title}</div>
    {hint && <div className="mt-1">{hint}</div>}
  </div>
);

