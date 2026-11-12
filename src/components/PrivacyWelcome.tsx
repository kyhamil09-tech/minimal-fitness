import React, { useEffect, useRef } from 'react';
import { ShieldCheck } from 'lucide-react';

/**
 * The first thing a new person sees: a short animated promise that this app is private, and always will be. In the picture, the
 * things you log (steps, heart, routes) flow into the phone and stay; the same data tries to reach the big companies on the right and
 * is stopped at a wall. The words come in one after another underneath, ending with a plain message to those companies.
 * Everything is drawn here with CSS and SVG (see the pw- rules in index.css), so it works offline and costs nothing to load.
 */
export const PrivacyWelcome: React.FC<{ onDone: () => void }> = ({ onDone }) => {
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // The button appears at the end of the animation; move focus there so a keyboard or screen reader lands on it.
    const t = window.setTimeout(() => button.current?.focus({ preventScroll: true }), 4600);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="pw-title" className="pw-root fixed inset-0 z-[80] flex flex-col items-center overflow-y-auto px-6 pb-8 pt-10">
      <div aria-hidden="true" className="pw-glow" />

      <svg className="pw-scene" viewBox="0 0 340 230" role="img" aria-label="Your data flows into your phone and stays there. Big companies on the right are blocked by a wall.">
        {/* The wall between your phone and the companies */}
        <g className="pw-wall">
          <line x1="262" y1="22" x2="262" y2="208" stroke="currentColor" strokeWidth="3" strokeDasharray="5 7" strokeLinecap="round" />
        </g>

        {/* The companies: plain clouds that never receive anything */}
        {[52, 112, 172].map((y, i) => (
          <g key={y} transform={`translate(296 ${y})`}>
            <g className="pw-cloud" style={{ animationDelay: `${0.4 + i * 0.12}s` }}>
              <path d="M-17 8 a8 8 0 0 1 3 -15 a12 12 0 0 1 22 -3 a9 9 0 0 1 9 18 Z" fill="currentColor" />
            </g>
          </g>
        ))}

        {/* Your data going into the phone */}
        {[
          { y: 62, c: 'var(--accent)', d: 0 },
          { y: 115, c: '#ff6b6b', d: 0.5 },
          { y: 168, c: '#7dd3fc', d: 1 },
        ].map((chip) => (
          <circle key={chip.y} className="pw-chip" cx="30" cy={chip.y} r="9" fill={chip.c} style={{ animationDelay: `${0.5 + chip.d}s` }} />
        ))}

        {/* The phone */}
        <g className="pw-phone">
          <rect x="120" y="26" width="100" height="178" rx="22" fill="rgba(255,255,255,0.05)" stroke="currentColor" strokeWidth="3" />
          <rect x="152" y="36" width="36" height="5" rx="2.5" fill="currentColor" opacity="0.5" />
          <path className="pw-shield" d="M170 74 L198 85 V111 C198 129 186 141 170 148 C154 141 142 129 142 111 V85 Z" fill="var(--accent)" />
          <path className="pw-check" d="M157 112 L167 122 L185 100" fill="none" stroke="var(--on-accent, #101112)" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" pathLength="1" />
        </g>

        {/* Attempts to send your data out: they reach the wall and bounce back */}
        {[78, 118, 158].map((y, i) => (
          <g key={y} className="pw-try" style={{ animationDelay: `${3 + i * 0.35}s` }}>
            <circle cx="226" cy={y} r="5" fill="currentColor" />
            <path className="pw-x" d={`M256 ${y - 6} l12 12 m0 -12 l-12 12`} stroke="#ff6b6b" strokeWidth="3.5" strokeLinecap="round" style={{ animationDelay: `${3 + i * 0.35}s` }} />
          </g>
        ))}
      </svg>

      <h2 id="pw-title" className="pw-line pw-title" style={{ animationDelay: '0.5s' }}>
        Private. Always.
      </h2>
      <p className="pw-line pw-body" style={{ animationDelay: '1.3s' }}>
        Everything you log stays on this phone. No account, no ads, no tracking. This app is built privacy-first, and it always will be.
      </p>

      <div className="pw-stamp pw-line" style={{ animationDelay: '3.3s' }}>
        <span className="pw-stamp-small">To the big companies:</span>
        <span className="pw-stamp-big">There is no data here for you.</span>
        <span className="pw-stamp-small">Nothing is uploaded. Nothing is sold. Nothing to collect.</span>
      </div>

      <p className="pw-line pw-fine" style={{ animationDelay: '4s' }}>
        <ShieldCheck className="inline h-3.5 w-3.5 -mt-0.5 mr-1" aria-hidden="true" />
        You can check it yourself any time in You &gt; Privacy, which lists every request the app makes.
      </p>

      <button ref={button} onClick={onDone} className="pw-button pw-line" style={{ animationDelay: '4.5s' }}>
        I like that
      </button>
    </div>
  );
};
