import React, { useEffect, useRef, useState } from 'react';
import { Info } from 'lucide-react';
import { Exercise } from '../types/tracking';
import { Modal } from './ui/Modal';
import { FLOOR, Joints, Pose, poseAt, solve } from '../lib/figure';
import { MOTIONS, Motion, Shape } from '../data/motions';

const prefersReduced = () => document.documentElement.classList.contains('reduce-motion') || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const Prop: React.FC<{ motion: Motion; j: Joints }> = ({ motion, j }) => {
  const [x, y] = j.wrist;
  switch (motion.prop) {
    case 'barbell':
      return <circle cx={x} cy={y} r={7} fill="none" stroke="var(--accent)" strokeWidth={3.5} />;
    case 'dumbbell':
      return <rect x={x - 4} y={y - 4} width={8} height={8} rx={2} fill="var(--accent)" />;
    case 'kettlebell':
      return (
        <g>
          <path d={`M${x - 4},${y} q4,-6 8,0`} fill="none" stroke="var(--accent)" strokeWidth={2} />
          <circle cx={x} cy={y + 6} r={6} fill="var(--accent)" />
        </g>
      );
    case 'handle':
      return <line x1={x - 4} y1={y} x2={x + 4} y2={y} stroke="var(--accent)" strokeWidth={3.5} strokeLinecap="round" />;
    default:
      return null;
  }
};

const ShapeEl: React.FC<{ s: Shape }> = ({ s }) =>
  s.t === 'line' ? (
    <line x1={s.a[0]} y1={s.a[1]} x2={s.b[0]} y2={s.b[1]} stroke="var(--hairline, #3a3a3a)" strokeWidth={s.w ?? 3} strokeLinecap="round" />
  ) : (
    <circle cx={s.c[0]} cy={s.c[1]} r={s.r} fill="none" stroke="var(--hairline, #3a3a3a)" strokeWidth={2} />
  );

/** One still picture of the figure in a pose. */
export const FigureSvg: React.FC<{ motion: Motion; pose: Pose; size?: number; label?: string }> = ({ motion, pose, size = 220, label }) => {
  const j = solve(pose);
  const ink = 'var(--ink, #eee)';
  const seg = (a: [number, number], b: [number, number], w = 4.5, o = 1) => (
    <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={ink} strokeWidth={w} strokeLinecap="round" opacity={o} />
  );
  return (
    <svg viewBox="0 0 200 170" width={size} height={(size * 170) / 200} role="img" aria-label={label ?? 'Exercise demonstration'} className="block mx-auto">
      <line x1={10} y1={FLOOR} x2={190} y2={FLOOR} stroke="var(--hairline, #3a3a3a)" strokeWidth={2} strokeLinecap="round" />
      {(motion.shapes ?? []).map((s, i) => (
        <ShapeEl key={i} s={s} />
      ))}
      {motion.pulley && (
        <g>
          <line x1={motion.pulley[0]} y1={motion.pulley[1]} x2={j.wrist[0]} y2={j.wrist[1]} stroke="var(--hairline, #3a3a3a)" strokeWidth={1.5} strokeDasharray="3 3" />
          <circle cx={motion.pulley[0]} cy={motion.pulley[1]} r={3} fill="var(--hairline, #3a3a3a)" />
        </g>
      )}
      {/* far leg, then body, then near leg and arm */}
      {seg(j.hip, j.knee2, 4, 0.45)}
      {seg(j.knee2, j.ankle2, 4, 0.45)}
      {seg(j.ankle2, j.toe2, 3.5, 0.45)}
      {seg(j.hip, j.shoulder, 6)}
      {seg(j.hip, j.knee)}
      {seg(j.knee, j.ankle)}
      {seg(j.ankle, j.toe, 3.5)}
      {seg(j.shoulder, j.elbow)}
      {seg(j.elbow, j.wrist)}
      <line x1={j.shoulder[0]} y1={j.shoulder[1]} x2={j.neck[0]} y2={j.neck[1]} stroke={ink} strokeWidth={3} strokeLinecap="round" />
      <circle cx={j.head[0]} cy={j.head[1]} r={7} fill="none" stroke={ink} strokeWidth={3.5} />
      <Prop motion={motion} j={j} />
    </svg>
  );
};

/** The animated figure for a movement pattern; falls back to the start and end poses side by side with Reduce motion. */
export const ExerciseDemo: React.FC<{ pattern: NonNullable<Exercise['pattern']>; size?: number }> = ({ pattern, size = 240 }) => {
  const motion = MOTIONS[pattern];
  const [pose, setPose] = useState<Pose>(motion.frames[0]);
  const reduced = useRef(prefersReduced());
  const speed = motion.hold ? 3400 : motion.oneWay ? 4200 : 2800;

  useEffect(() => {
    setPose(motion.frames[0]);
    if (reduced.current || motion.frames.length === 1) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      setPose(poseAt(motion.frames, speed, now - t0, motion.oneWay));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [motion, speed]);

  if (reduced.current && motion.frames.length > 1) {
    const last = motion.frames[Math.min(motion.frames.length - 1, motion.oneWay ? 2 : motion.frames.length - 1)];
    return (
      <div className="grid grid-cols-2 gap-2">
        <figure>
          <FigureSvg motion={motion} pose={motion.frames[0]} size={size / 2 + 40} label="Start position" />
          <figcaption className="text-[10px] text-center text-neutral-400">Start</figcaption>
        </figure>
        <figure>
          <FigureSvg motion={motion} pose={last} size={size / 2 + 40} label="End position" />
          <figcaption className="text-[10px] text-center text-neutral-400">End</figcaption>
        </figure>
      </div>
    );
  }
  return <FigureSvg motion={motion} pose={pose} size={size} />;
};

/** The "how to do it" sheet: the animation, the three cues and any note. */
export const ExerciseGuide: React.FC<{ exercise: Exercise | null; onClose: () => void }> = ({ exercise, onClose }) => {
  if (!exercise) return null;
  const motion = exercise.pattern ? MOTIONS[exercise.pattern] : null;
  return (
    <Modal isOpen onClose={onClose} title={exercise.name} icon={<Info className="w-4 h-4" style={{ color: 'var(--accent)' }} />}>
      <div className="text-[11px] text-neutral-400 mb-2">
        {exercise.muscle} · {exercise.equipment}
      </div>
      {motion && exercise.pattern ? (
        <>
          <div className="rounded-2xl border border-[#1A1E26] bg-black/30 py-3">
            <ExerciseDemo pattern={exercise.pattern} />
          </div>
          {motion.note && <p className="text-[11px] text-neutral-500 mt-2">{motion.note}</p>}
          <ol className="mt-3 space-y-2.5">
            {['Set up', 'Move', 'Watch for'].map((h, i) => (
              <li key={h} className="flex gap-3">
                <span className="w-6 h-6 rounded-full text-[11px] font-extrabold flex items-center justify-center shrink-0" style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}>
                  {i + 1}
                </span>
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">{h}</div>
                  <div className="text-sm text-neutral-200 leading-snug">{motion.cues[i]}</div>
                </div>
              </li>
            ))}
          </ol>
          <p className="text-[10px] text-neutral-600 mt-4 leading-relaxed">A simple side-view animation of the movement, not a filmed demonstration. Start light, move with control and stop if something hurts.</p>
        </>
      ) : (
        <p className="text-sm text-neutral-300">There is no animation for this exercise yet. Start light, move with control and stop if something hurts.</p>
      )}
    </Modal>
  );
};
