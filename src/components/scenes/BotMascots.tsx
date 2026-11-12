import React, { Suspense, lazy, useMemo } from 'react';
import type { BotSpec } from './BotScene3D';

const BotScene3D = lazy(() => import('./BotScene3D'));

/**
 * The Google-inspired theme's Home strip: four original athletic androids (a runner, a hydration check, a recovery stretch and an
 * overhead lift) rendered as real 3D models in Google's four colors. The speech line says something about your day; tapping an
 * android makes it flex and moves to the next line. The three.js code is loaded only when this strip is shown.
 */
const CAST: BotSpec[] = [
  { kind: 'runner', color: '#4285F4' },
  { kind: 'water', color: '#EA4335' },
  { kind: 'recover', color: '#FFCB2E' },
  { kind: 'lift', color: '#34A853' },
];

interface MascotStripProps {
  /** What the bubble says now. */
  line: string;
  /** True in the light look, where the page filter flips colors. */
  light: boolean;
  /** Reduce-motion: draw one still frame instead of animating. */
  still?: boolean;
  /** Called when an android is tapped, to move to the next line. */
  onNext: () => void;
}

export const MascotStrip: React.FC<MascotStripProps> = ({ line, light, still = false, onNext }) => {
  const specs = useMemo(() => CAST, []);
  return (
    <section className="mascot-strip" aria-label="Your training androids">
      <div className="mascot-bubble" role="status">
        {line}
      </div>
      <Suspense fallback={<div className="mascot-stage"><div className="mascot-stage-fallback">Loading…</div></div>}>
        <BotScene3D specs={specs} light={light} still={still} onTap={onNext} label="Training androids. Tap one for a new tip." />
      </Suspense>
      <p className="mascot-note">Original 3D characters inspired by Android’s friendly robot. Not affiliated with Google.</p>
    </section>
  );
};
